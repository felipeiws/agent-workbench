import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { DatabaseClient } from "../../database/src/index";
import type {
  TaskLoopAgent,
  TaskLoopDefinition,
  TaskLoopRecord,
  TaskLoopStatus,
  TaskLoopTaskRecord,
  TaskLoopTaskStatus,
} from "../../types/src/index";
import type { TaskLoopProgressEvent } from "../../shared/src/index";

const FORGEDESK_DIR = ".forgedesk";
const DEFAULT_IDLE_TIMEOUT_MS = 15000;
const STARTUP_EXTRA_MS = 10000;
const ANSI_ESCAPE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export interface TaskLoopTerminalOutput {
  sessionId: string;
  content: string;
}

export interface TaskLoopDeps {
  db: DatabaseClient;
  getProjectPath: (projectId: string) => string;
  createTerminalSession: (input: {
    projectId: string;
    name: string;
    command: string;
  }) => Promise<{ id: string }>;
  writeTerminal: (sessionId: string, input: string) => void;
  terminateTerminal: (sessionId: string) => Promise<void>;
  subscribeToOutput: (listener: (event: TaskLoopTerminalOutput) => void) => void;
}

export class TaskLoopService {
  private readonly events = new EventEmitter();
  private readonly outputEmitter = new EventEmitter();
  private readonly pausedLoops = new Set<string>();
  private readonly stoppedLoops = new Set<string>();

  constructor(private readonly deps: TaskLoopDeps) {
    deps.subscribeToOutput((event) => {
      this.outputEmitter.emit(`output:${event.sessionId}`, event.content);
    });
  }

  async start(
    projectId: string,
    agent: TaskLoopAgent,
    definition: TaskLoopDefinition
  ): Promise<TaskLoopRecord> {
    const projectPath = this.deps.getProjectPath(projectId);
    const loopId = randomUUID();

    const loopPath = join(projectPath, FORGEDESK_DIR, "loops", loopId);
    const tasksPath = join(loopPath, "tasks");
    mkdirSync(tasksPath, { recursive: true });

    writeFileSync(
      join(loopPath, "definition.json"),
      JSON.stringify(definition, null, 2) + "\n",
      "utf8"
    );
    writeFileSync(
      join(loopPath, "memory.md"),
      `# Loop Memory: ${definition.name}\n\n`,
      "utf8"
    );

    ensureGitIgnore(projectPath);

    const loop = this.deps.db.createTaskLoop({
      id: loopId,
      projectId,
      name: definition.name,
      agent,
      status: "running",
      totalTasks: definition.tasks.length
    });

    for (let i = 0; i < definition.tasks.length; i++) {
      this.deps.db.createTaskLoopTask({
        loopId,
        taskIndex: i,
        title: definition.tasks[i]!.title
      });
    }

    const agentCommand = agent === "claude"
      ? "claude --dangerously-skip-permissions"
      : "codex";

    const session = await this.deps.createTerminalSession({
      projectId,
      name: `Loop: ${definition.name}`,
      command: agentCommand
    });

    this.deps.db.updateTaskLoop(loopId, { sessionId: session.id });

    void this.runLoop(loopId, session.id, definition, loopPath);

    return this.deps.db.getTaskLoopById(loopId)!;
  }

  private async runLoop(
    loopId: string,
    sessionId: string,
    definition: TaskLoopDefinition,
    loopPath: string
  ): Promise<void> {
    const idleMs = definition.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;

    // Wait for agent to start up before sending anything
    await this.waitForIdle(sessionId, idleMs + STARTUP_EXTRA_MS);

    for (let i = 0; i < definition.tasks.length; i++) {
      if (this.stoppedLoops.has(loopId)) break;

      while (this.pausedLoops.has(loopId) && !this.stoppedLoops.has(loopId)) {
        await sleep(300);
      }

      if (this.stoppedLoops.has(loopId)) break;

      const taskDef = definition.tasks[i];
      const taskRecord = this.deps.db.getTaskLoopTaskByIndex(loopId, i);
      if (!taskDef || !taskRecord) continue;

      this.deps.db.updateTaskLoopTask(taskRecord.id, {
        status: "running",
        startedAt: new Date().toISOString()
      });
      this.deps.db.updateTaskLoop(loopId, { currentTaskIndex: i });
      this.emitProgress(loopId, projectIdFromLoop(this.deps.db, loopId), "running", i, "running");

      const taskChunks: string[] = [];
      const collectOutput = (content: string) => taskChunks.push(content);
      this.outputEmitter.on(`output:${sessionId}`, collectOutput);

      try {
        if (definition.prePrompt) {
          this.deps.writeTerminal(sessionId, `${definition.prePrompt}\r`);
          await this.waitForIdle(sessionId, idleMs);
        }

        this.deps.writeTerminal(sessionId, `${taskDef.prompt}\r`);

        await this.waitForIdle(sessionId, idleMs);

        this.outputEmitter.removeListener(`output:${sessionId}`, collectOutput);

        const rawOutput = taskChunks.join("");
        const cleanOutput = rawOutput.replace(ANSI_ESCAPE, "");
        const taskFile = join(loopPath, "tasks", `${i}_${sanitizeFilename(taskDef.title)}.txt`);
        writeFileSync(taskFile, cleanOutput, "utf8");

        if (taskDef.memoryNote) {
          appendFileSync(
            join(loopPath, "memory.md"),
            `## Task ${i + 1}: ${taskDef.title}\n${taskDef.memoryNote}\n\n`,
            "utf8"
          );
        }

        if (definition.postPrompt) {
          this.deps.writeTerminal(sessionId, `${definition.postPrompt}\r`);
          await this.waitForIdle(sessionId, idleMs);
        }

        const completedStatus: TaskLoopTaskStatus = "completed";
        this.deps.db.updateTaskLoopTask(taskRecord.id, {
          status: completedStatus,
          completedAt: new Date().toISOString()
        });
        this.emitProgress(loopId, projectIdFromLoop(this.deps.db, loopId), "running", i, "completed");
      } catch {
        this.outputEmitter.removeListener(`output:${sessionId}`, collectOutput);
        this.deps.db.updateTaskLoopTask(taskRecord.id, {
          status: "failed",
          completedAt: new Date().toISOString()
        });
        this.deps.db.updateTaskLoop(loopId, { status: "failed" });
        this.emitProgress(loopId, projectIdFromLoop(this.deps.db, loopId), "failed", i, "failed");
        return;
      }
    }

    const finalStatus: TaskLoopStatus = this.stoppedLoops.has(loopId) ? "stopped" : "completed";
    this.deps.db.updateTaskLoop(loopId, {
      status: finalStatus,
      completedAt: new Date().toISOString()
    });

    const projectId = projectIdFromLoop(this.deps.db, loopId);
    this.emitProgress(loopId, projectId, finalStatus, definition.tasks.length - 1, "completed");
    this.stoppedLoops.delete(loopId);
  }

  private waitForIdle(sessionId: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout>;

      const onOutput = () => {
        clearTimeout(timer);
        timer = setTimeout(done, timeoutMs);
      };

      const done = () => {
        this.outputEmitter.removeListener(`output:${sessionId}`, onOutput);
        resolve();
      };

      this.outputEmitter.on(`output:${sessionId}`, onOutput);
      timer = setTimeout(done, timeoutMs);
    });
  }

  pause(loopId: string): void {
    const loop = this.deps.db.getTaskLoopById(loopId);
    if (!loop || loop.status !== "running") return;

    this.pausedLoops.add(loopId);
    this.deps.db.updateTaskLoop(loopId, { status: "paused" });
    this.emitProgress(loopId, loop.projectId, "paused", loop.currentTaskIndex, "running");
  }

  resume(loopId: string): void {
    const loop = this.deps.db.getTaskLoopById(loopId);
    if (!loop || loop.status !== "paused") return;

    this.pausedLoops.delete(loopId);
    this.deps.db.updateTaskLoop(loopId, { status: "running" });
    this.emitProgress(loopId, loop.projectId, "running", loop.currentTaskIndex, "running");
  }

  async stop(loopId: string): Promise<void> {
    const loop = this.deps.db.getTaskLoopById(loopId);
    if (!loop) return;

    this.stoppedLoops.add(loopId);
    this.pausedLoops.delete(loopId);

    if (loop.sessionId) {
      await this.deps.terminateTerminal(loop.sessionId);
    }

    this.deps.db.updateTaskLoop(loopId, {
      status: "stopped",
      completedAt: new Date().toISOString()
    });
    this.emitProgress(loopId, loop.projectId, "stopped", loop.currentTaskIndex, "pending");
  }

  async delete(loopId: string): Promise<void> {
    const loop = this.deps.db.getTaskLoopById(loopId);
    if (!loop) return;

    if (loop.status === "running" || loop.status === "paused") {
      await this.stop(loopId);
    }

    this.stoppedLoops.delete(loopId);
    this.pausedLoops.delete(loopId);
    this.deps.db.deleteTaskLoop(loopId);
  }

  list(projectId: string): TaskLoopRecord[] {
    return this.deps.db.listTaskLoops(projectId);
  }

  getTasks(loopId: string): TaskLoopTaskRecord[] {
    return this.deps.db.listTaskLoopTasks(loopId);
  }

  onProgress(listener: (event: TaskLoopProgressEvent) => void): void {
    this.events.on("progress", listener);
  }

  private emitProgress(
    loopId: string,
    projectId: string,
    status: TaskLoopStatus,
    currentTaskIndex: number,
    taskStatus: TaskLoopTaskStatus
  ): void {
    this.events.emit("progress", {
      loopId,
      projectId,
      status,
      currentTaskIndex,
      taskStatus
    } satisfies TaskLoopProgressEvent);
  }
}

function projectIdFromLoop(db: DatabaseClient, loopId: string): string {
  return db.getTaskLoopById(loopId)?.projectId ?? "";
}

function ensureGitIgnore(projectPath: string): void {
  const gitIgnorePath = join(projectPath, ".gitignore");
  const entry = ".forgedesk/";

  if (!existsSync(gitIgnorePath)) return;

  const content = readFileSync(gitIgnorePath, "utf8");
  if (content.split("\n").some((line) => line.trim() === entry)) return;

  const separator = content.endsWith("\n") ? "" : "\n";
  writeFileSync(gitIgnorePath, `${content}${separator}${entry}\n`, "utf8");
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
