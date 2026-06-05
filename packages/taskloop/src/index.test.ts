import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseClient } from "../../database/src/index";
import type { TaskLoopDefinition, TaskLoopRecord, TaskLoopTaskRecord } from "../../types/src/index";

import { TaskLoopService } from "./index";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

function createDefinition(): TaskLoopDefinition {
  return {
    version: "1",
    name: "Claude Loop",
    tasks: [
      {
        id: "task-1",
        title: "Primeira task",
        prompt: "Escreva um resumo curto."
      }
    ]
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();

    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe("TaskLoopService", () => {
  it("dispatches the first task even when the shell produces no startup output", async () => {
    const rootDir = createTempDir("agent-workbench-taskloop-");
    const projectDir = join(rootDir, "bridge");
    const projectId = "project-1";
    const loopTasks = new Map<number, TaskLoopTaskRecord>();
    const loopRecords = new Map<string, TaskLoopRecord>();
    const db = createTaskLoopDb(loopRecords, loopTasks);

    const writes: Array<{ sessionId: string; input: string }> = [];
    const service = new TaskLoopService({
      db: db as unknown as DatabaseClient,
      getProjectPath: () => projectDir,
      createTerminalSession: async () => ({ id: "session-1" }),
      writeTerminal: (sessionId, input) => {
        writes.push({ sessionId, input });
      },
      terminateTerminal: async () => {},
      subscribeToOutput: () => {}
    });

    await service.start(projectId, "claude", createDefinition());
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(writes).toHaveLength(1);
    expect(writes[0]?.sessionId).toBe("session-1");
    expect(writes[0]?.input).toContain("claude");
    expect(writes[0]?.input).toContain("cat ");
    expect(writes[0]?.input).toContain(".prompt.txt");
    expect(writes[0]?.input).not.toContain("\n");
  });

  it("resumes a failed loop with a different agent and resets the current task", async () => {
    const rootDir = createTempDir("agent-workbench-taskloop-");
    const projectDir = join(rootDir, "bridge");
    const projectId = "project-1";
    const loopId = randomUUID();
    const taskId = randomUUID();
    const definition = createDefinition();
    const loopPath = join(projectDir, ".forgedesk", "loops", loopId);
    const taskStatusFile = join(loopPath, "tasks", "0_primeira-task.json");
    const loopTasks = new Map<number, TaskLoopTaskRecord>();
    const loopRecords = new Map<string, TaskLoopRecord>();

    mkdirSync(join(loopPath, "tasks"), { recursive: true });
    writeFileSync(join(loopPath, "definition.json"), JSON.stringify(definition, null, 2) + "\n", "utf8");
    writeFileSync(
      taskStatusFile,
      JSON.stringify(
        {
          taskId: "task-1",
          taskTitle: "Primeira task",
          status: "failed",
          updatedAt: new Date().toISOString()
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    loopRecords.set(loopId, {
      id: loopId,
      projectId,
      name: definition.name,
      agent: "claude",
      status: "failed",
      currentTaskIndex: 0,
      totalTasks: definition.tasks.length,
      sessionId: "session-old",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });
    loopTasks.set(0, {
      id: taskId,
      loopId,
      taskIndex: 0,
      title: definition.tasks[0]!.title,
      status: "failed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });

    const writes: Array<{ sessionId: string; input: string }> = [];
    let nextSession = 0;
    const db = createTaskLoopDb(loopRecords, loopTasks);
    const service = new TaskLoopService({
      db: db as unknown as DatabaseClient,
      getProjectPath: () => projectDir,
      createTerminalSession: async () => ({ id: `session-${++nextSession}` }),
      writeTerminal: (sessionId, input) => {
        writes.push({ sessionId, input });
      },
      terminateTerminal: async () => {},
      subscribeToOutput: () => {}
    });

    await service.resume(loopId, "codex");
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(loopRecords.get(loopId)?.agent).toBe("codex");
    expect(loopRecords.get(loopId)?.status).toBe("running");
    expect(loopRecords.get(loopId)?.sessionId).toBe("session-1");
    expect(loopTasks.get(0)?.status).toBe("running");
    expect(writes[0]?.sessionId).toBe("session-1");
    expect(writes[0]?.input).toContain("NVM_CODEX=${NVM_NODE%/node}/codex");
    expect(writes[0]?.input).toContain("\"$CODEX_BIN\" --no-alt-screen exec");
    expect(writes[0]?.input).not.toContain("--model");

    const marker = JSON.parse(readFileSync(taskStatusFile, "utf8")) as { status: string };
    expect(marker.status).toBe("running");
  });

  it("stops a running loop by resetting the current task to pending", async () => {
    const rootDir = createTempDir("agent-workbench-taskloop-");
    const projectDir = join(rootDir, "bridge");
    const projectId = "project-1";
    const loopId = randomUUID();
    const taskId = randomUUID();
    const loopTasks = new Map<number, TaskLoopTaskRecord>();
    const loopRecords = new Map<string, TaskLoopRecord>();

    loopRecords.set(loopId, {
      id: loopId,
      projectId,
      name: "Loop em andamento",
      agent: "claude",
      status: "running",
      currentTaskIndex: 0,
      totalTasks: 1,
      sessionId: "session-1",
      startedAt: new Date().toISOString(),
      completedAt: null
    });
    loopTasks.set(0, {
      id: taskId,
      loopId,
      taskIndex: 0,
      title: "Primeira task",
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null
    });

    const terminated: string[] = [];
    const db = createTaskLoopDb(loopRecords, loopTasks);
    const service = new TaskLoopService({
      db: db as unknown as DatabaseClient,
      getProjectPath: () => projectDir,
      createTerminalSession: async () => ({ id: "session-new" }),
      writeTerminal: () => {},
      terminateTerminal: async (sessionId) => {
        terminated.push(sessionId);
      },
      subscribeToOutput: () => {}
    });

    await service.stop(loopId);

    expect(terminated).toEqual(["session-1"]);
    expect(loopRecords.get(loopId)?.status).toBe("stopped");
    expect(loopTasks.get(0)?.status).toBe("pending");
    expect(loopTasks.get(0)?.startedAt).toBeNull();
    expect(loopTasks.get(0)?.completedAt).toBeNull();
  });
});

function createTaskLoopDb(
  loopRecords: Map<string, TaskLoopRecord>,
  loopTasks: Map<number, TaskLoopTaskRecord>
) {
  return {
    createTaskLoop(input: {
      id: string;
      projectId: string;
      name: string;
      agent: "claude" | "codex";
      status: TaskLoopRecord["status"];
      totalTasks: number;
    }) {
      const record: TaskLoopRecord = {
        id: input.id,
        projectId: input.projectId,
        name: input.name,
        agent: input.agent,
        status: input.status,
        currentTaskIndex: 0,
        totalTasks: input.totalTasks,
        sessionId: null,
        startedAt: new Date().toISOString(),
        completedAt: null
      };
      loopRecords.set(record.id, record);
      return record;
    },
    createTaskLoopTask(input: { loopId: string; taskIndex: number; title: string }) {
      const record: TaskLoopTaskRecord = {
        id: randomUUID(),
        loopId: input.loopId,
        taskIndex: input.taskIndex,
        title: input.title,
        status: "pending",
        startedAt: null,
        completedAt: null
      };
      loopTasks.set(input.taskIndex, record);
      return record;
    },
    updateTaskLoop(loopId: string, input: Partial<TaskLoopRecord>) {
      const current = loopRecords.get(loopId);
      if (!current) return;
      loopRecords.set(loopId, { ...current, ...input });
    },
    updateTaskLoopTask(taskId: string, input: Partial<TaskLoopTaskRecord>) {
      for (const [taskIndex, record] of loopTasks.entries()) {
        if (record.id !== taskId) continue;
        loopTasks.set(taskIndex, { ...record, ...input });
        return;
      }
    },
    getTaskLoopById(loopId: string) {
      return loopRecords.get(loopId) ?? null;
    },
    getTaskLoopTaskByIndex(_loopId: string, taskIndex: number) {
      return loopTasks.get(taskIndex) ?? null;
    }
  } as const;
}
