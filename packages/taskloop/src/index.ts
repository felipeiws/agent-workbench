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
import { type TaskLoopProgressEvent } from "../../shared/src/index";

const FORGEDESK_DIR = ".forgedesk";
const SHELL_BOOT_GRACE_MS = 150;
const TASK_MARKER_POLL_MS = 1000;
const ANSI_ESCAPE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

type TaskCompletionMarkerStatus = TaskLoopTaskStatus | "running";

interface TaskCompletionMarker {
  taskId: string;
  taskTitle: string;
  status: TaskCompletionMarkerStatus;
  updatedAt: string;
  summary?: string;
  failureReason?: string;
}

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
      const taskDef = definition.tasks[i]!;
      const taskStatusFile = join(tasksPath, `${i}_${sanitizeFilename(taskDef.title)}.json`);

      this.deps.db.createTaskLoopTask({
        loopId,
        taskIndex: i,
        title: taskDef.title
      });

      writeTaskMarker(taskStatusFile, {
        taskId: taskDef.id,
        taskTitle: taskDef.title,
        status: "pending",
        updatedAt: new Date().toISOString()
      });
    }

    await this.spawnLoopSession(loopId, projectId, definition.name, agent, definition, loopPath, projectPath, 0);

    return this.deps.db.getTaskLoopById(loopId)!;
  }

  private async spawnLoopSession(
    loopId: string,
    projectId: string,
    loopName: string,
    agent: TaskLoopAgent,
    definition: TaskLoopDefinition,
    loopPath: string,
    projectPath: string,
    startIndex: number
  ): Promise<void> {
    const session = await this.deps.createTerminalSession({
      projectId,
      name: `Loop: ${loopName}`,
      command: "bash"
    });

    this.deps.db.updateTaskLoop(loopId, {
      sessionId: session.id,
      status: "running",
      currentTaskIndex: startIndex,
      completedAt: null
    });

    void this.runLoop(loopId, session.id, agent, definition, loopPath, projectPath, startIndex);
  }

  private async runLoop(
    loopId: string,
    sessionId: string,
    agent: TaskLoopAgent,
    definition: TaskLoopDefinition,
    loopPath: string,
    projectPath: string,
    startIndex = 0
  ): Promise<void> {
    // The loop session now boots into a plain bash shell. Give the PTY a brief
    // moment to settle, but do not wait for shell output that may never come.
    await sleep(SHELL_BOOT_GRACE_MS);

    for (let i = startIndex; i < definition.tasks.length; i++) {
      if (this.stoppedLoops.has(loopId)) break;

      while (this.pausedLoops.has(loopId) && !this.stoppedLoops.has(loopId)) {
        await sleep(300);
      }

      if (this.stoppedLoops.has(loopId)) break;

      const taskDef = definition.tasks[i];
      const taskRecord = this.deps.db.getTaskLoopTaskByIndex(loopId, i);
      if (!taskDef || !taskRecord) continue;

      const taskBaseName = `${i}_${sanitizeFilename(taskDef.title)}`;
      const taskOutputFile = join(loopPath, "tasks", `${taskBaseName}.txt`);
      const taskStatusFile = join(loopPath, "tasks", `${taskBaseName}.json`);
      const taskPromptFile = join(loopPath, "tasks", `${taskBaseName}.prompt.txt`);
      const taskStatusRelativePath = toProjectRelativePath(projectPath, taskStatusFile);

      this.deps.db.updateTaskLoopTask(taskRecord.id, {
        status: "running",
        startedAt: new Date().toISOString()
      });
      writeTaskMarker(taskStatusFile, {
        taskId: taskDef.id,
        taskTitle: taskDef.title,
        status: "running",
        updatedAt: new Date().toISOString()
      });
      this.deps.db.updateTaskLoop(loopId, { currentTaskIndex: i });
      this.emitProgress(loopId, projectIdFromLoop(this.deps.db, loopId), "running", i, "running");

      const taskChunks: string[] = [];
      const collectOutput = (content: string) => taskChunks.push(content);

      try {
        this.outputEmitter.on(`output:${sessionId}`, collectOutput);

        const prompt = buildTaskPrompt({
          prePrompt: definition.prePrompt,
          postPrompt: definition.postPrompt,
          taskPrompt: taskDef.prompt,
          taskStatusRelativePath
        });

        writeFileSync(taskPromptFile, prompt, "utf8");

        if (agent === "codex") {
          this.deps.writeTerminal(
            sessionId,
            `${buildCodexExecShellCommand(prompt, taskStatusFile)}\r`
          );
        } else if (agent === "claude") {
          this.deps.writeTerminal(
            sessionId,
            `${buildClaudeShellCommand(taskPromptFile, taskStatusFile)}\r`
          );
        } else {
          this.deps.writeTerminal(sessionId, `${prompt}\r`);
        }

        const marker = await this.waitForTaskMarker(loopId, taskStatusFile);

        this.outputEmitter.removeListener(`output:${sessionId}`, collectOutput);

        const rawOutput = taskChunks.join("");
        const cleanOutput = rawOutput.replace(ANSI_ESCAPE, "");
        writeFileSync(taskOutputFile, cleanOutput, "utf8");

        if (marker === null) {
          break;
        }

        if (marker.status === "failed") {
          this.deps.db.updateTaskLoopTask(taskRecord.id, {
            status: "failed",
            completedAt: new Date().toISOString()
          });
          this.deps.db.updateTaskLoop(loopId, {
            status: "failed",
            completedAt: new Date().toISOString()
          });
          this.emitProgress(loopId, projectIdFromLoop(this.deps.db, loopId), "failed", i, "failed");
          return;
        }

        if (taskDef.memoryNote) {
          appendFileSync(
            join(loopPath, "memory.md"),
            `## Task ${i + 1}: ${taskDef.title}\n${taskDef.memoryNote}\n\n`,
            "utf8"
          );
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
    const finalTaskStatus: TaskLoopTaskStatus = finalStatus === "stopped" ? "pending" : "completed";
    this.emitProgress(loopId, projectId, finalStatus, definition.tasks.length - 1, finalTaskStatus);
    this.stoppedLoops.delete(loopId);
  }

  private async waitForTaskMarker(
    loopId: string,
    taskStatusFile: string
  ): Promise<TaskCompletionMarker | null> {
    while (!this.stoppedLoops.has(loopId)) {
      const marker = readTaskMarker(taskStatusFile);
      if (marker?.status === "completed" || marker?.status === "failed") {
        return marker;
      }

      await sleep(TASK_MARKER_POLL_MS);
    }

    return null;
  }

  pause(loopId: string): void {
    const loop = this.deps.db.getTaskLoopById(loopId);
    if (!loop || loop.status !== "running") return;

    this.pausedLoops.add(loopId);
    this.deps.db.updateTaskLoop(loopId, { status: "paused" });
    this.emitProgress(loopId, loop.projectId, "paused", loop.currentTaskIndex, "running");
  }

  async resume(loopId: string, nextAgent?: TaskLoopAgent): Promise<void> {
    const loop = this.deps.db.getTaskLoopById(loopId);
    if (!loop) return;

    if (loop.status === "paused") {
      this.pausedLoops.delete(loopId);
      this.deps.db.updateTaskLoop(loopId, { status: "running", completedAt: null });
      this.emitProgress(loopId, loop.projectId, "running", loop.currentTaskIndex, "running");
      return;
    }

    if (loop.status !== "failed" && loop.status !== "stopped") return;

    const projectPath = this.deps.getProjectPath(loop.projectId);
    const loopPath = join(projectPath, FORGEDESK_DIR, "loops", loopId);
    const definition = readTaskLoopDefinition(join(loopPath, "definition.json"));
    const currentTaskDef = definition.tasks[loop.currentTaskIndex];
    const currentTaskRecord = this.deps.db.getTaskLoopTaskByIndex(loopId, loop.currentTaskIndex);
    const agent = nextAgent ?? loop.agent;

    if (!currentTaskDef || !currentTaskRecord) {
      throw new Error(`Loop ${loopId} has no task at index ${loop.currentTaskIndex} to resume.`);
    }

    const taskStatusFile = join(
      loopPath,
      "tasks",
      `${loop.currentTaskIndex}_${sanitizeFilename(currentTaskDef.title)}.json`
    );

    writeTaskMarker(taskStatusFile, {
      taskId: currentTaskDef.id,
      taskTitle: currentTaskDef.title,
      status: "pending",
      updatedAt: new Date().toISOString()
    });

    this.deps.db.updateTaskLoopTask(currentTaskRecord.id, {
      status: "pending",
      startedAt: null,
      completedAt: null
    });

    this.stoppedLoops.delete(loopId);
    this.pausedLoops.delete(loopId);
    this.deps.db.updateTaskLoop(loopId, {
      agent,
      status: "running",
      completedAt: null
    });
    this.emitProgress(loopId, loop.projectId, "running", loop.currentTaskIndex, "pending");

    await this.spawnLoopSession(
      loopId,
      loop.projectId,
      loop.name,
      agent,
      definition,
      loopPath,
      projectPath,
      loop.currentTaskIndex
    );
  }

  async stop(loopId: string): Promise<void> {
    const loop = this.deps.db.getTaskLoopById(loopId);
    if (!loop) return;

    this.stoppedLoops.add(loopId);
    this.pausedLoops.delete(loopId);

    if (loop.sessionId) {
      await this.deps.terminateTerminal(loop.sessionId);
    }

    const currentTask = this.deps.db.getTaskLoopTaskByIndex(loopId, loop.currentTaskIndex);
    if (currentTask?.status === "running") {
      this.deps.db.updateTaskLoopTask(currentTask.id, {
        status: "pending",
        startedAt: null,
        completedAt: null
      });
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

function buildTaskPrompt(input: {
  prePrompt?: string;
  postPrompt?: string | null;
  taskPrompt: string;
  taskStatusRelativePath: string;
}): string {
  const instructions = [
    input.taskPrompt,
    "",
    `Quando concluir esta task, atualize o arquivo ${input.taskStatusRelativePath} com JSON valido e defina "status": "completed".`,
    `Se nao conseguir concluir, atualize o mesmo arquivo com "status": "failed" e preencha "failureReason".`,
    'Voce pode preencher opcionalmente "summary" com um resumo curto do que foi feito.',
    "Nao avance para outra task por conta propria; o loop so libera a proxima depois desse arquivo ser marcado."
  ];

  if (input.postPrompt) {
    instructions.push("", `Antes de marcar o arquivo, execute tambem esta instrucao complementar: ${input.postPrompt}`);
  }

  return input.prePrompt
    ? `${input.prePrompt}\n${instructions.join("\n")}`
    : instructions.join("\n");
}

function buildCodexExecShellCommand(prompt: string, taskStatusFile: string): string {
  const codexCommand = [
    "CODEX_BIN=codex;",
    "if [ -s \"$HOME/.nvm/nvm.sh\" ]; then",
    ". \"$HOME/.nvm/nvm.sh\";",
    "NVM_NODE=$(nvm which current 2>/dev/null || true);",
    "NVM_CODEX=${NVM_NODE%/node}/codex;",
    "if [ -x \"$NVM_CODEX\" ]; then CODEX_BIN=\"$NVM_CODEX\"; fi;",
    "fi;",
    "\"$CODEX_BIN\""
  ].join(" ");
  const agentCommand = [
    codexCommand,
    "--no-alt-screen",
    "exec",
    "--dangerously-bypass-approvals-and-sandbox",
    "--skip-git-repo-check",
    shellSingleQuote(prompt)
  ].join(" ");

  return buildGuardedAgentShellCommand(agentCommand, taskStatusFile);
}

function buildClaudeShellCommand(promptFile: string, taskStatusFile: string): string {
  const agentCommand = `cat ${shellSingleQuote(promptFile)} | claude --dangerously-skip-permissions`;
  return buildGuardedAgentShellCommand(agentCommand, taskStatusFile);
}

function buildGuardedAgentShellCommand(agentCommand: string, taskStatusFile: string): string {
  const guardCommand = [
    "node",
    "-e",
    shellSingleQuote(
      [
        "const fs = require('node:fs');",
        "const statusFile = process.argv[1];",
        "const exitCode = Number(process.argv[2] ?? '0');",
        "let marker = {};",
        "try { marker = JSON.parse(fs.readFileSync(statusFile, 'utf8')); } catch {}",
        "if (marker.status === 'completed' || marker.status === 'failed') process.exit(0);",
        "marker = {",
        "  ...marker,",
        "  status: 'failed',",
        "  updatedAt: new Date().toISOString(),",
        "  failureReason: exitCode === 0",
        "    ? 'Agent command exited without updating task status file.'",
        "    : `Agent command exited with code ${exitCode} before updating task status file.`",
        "};",
        "fs.writeFileSync(statusFile, JSON.stringify(marker, null, 2) + '\\n', 'utf8');"
      ].join(" ")
    ),
    shellSingleQuote(taskStatusFile),
    '"$status"'
  ].join(" ");

  return `(${agentCommand}); status=$?; ${guardCommand}`;
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function writeTaskMarker(taskStatusFile: string, marker: TaskCompletionMarker): void {
  writeFileSync(taskStatusFile, JSON.stringify(marker, null, 2) + "\n", "utf8");
}

function readTaskMarker(taskStatusFile: string): TaskCompletionMarker | null {
  try {
    return JSON.parse(readFileSync(taskStatusFile, "utf8")) as TaskCompletionMarker;
  } catch {
    return null;
  }
}

function readTaskLoopDefinition(definitionFile: string): TaskLoopDefinition {
  return JSON.parse(readFileSync(definitionFile, "utf8")) as TaskLoopDefinition;
}

function toProjectRelativePath(projectPath: string, filePath: string): string {
  const normalizedProjectPath = projectPath.endsWith("/") ? projectPath : `${projectPath}/`;
  return filePath.startsWith(normalizedProjectPath)
    ? filePath.slice(normalizedProjectPath.length)
    : filePath;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
