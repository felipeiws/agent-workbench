import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { DatabaseClient } from "./index";

const tempDirs: string[] = [];

function createTempDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "agent-workbench-db-"));
  tempDirs.push(directory);
  return join(directory, "agent-workbench.db");
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();

    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe("DatabaseClient", () => {
  it("applies migrations and persists project layouts plus terminal history", () => {
    const db = new DatabaseClient(createTempDatabasePath());
    const workspace = db.createWorkspace("DadosTech");
    const project = db.createProject({
      workspaceId: workspace.id,
      name: "bridge",
      path: "/tmp/bridge",
      safeMode: "audit",
      ideCommand: "phpstorm",
      configPath: "/tmp/bridge/.agent-workspace.json"
    });

    const defaultLayout = db.getProjectLayout(project.id);
    expect(defaultLayout.projectId).toBe(project.id);
    expect(defaultLayout.activeSessionId).toBeNull();
    expect(defaultLayout.terminalMode).toBe("focus");
    expect(defaultLayout.diffMode).toBe("side-by-side");

    const session = db.createTerminalSession({
      projectId: project.id,
      name: "Codex",
      command: "codex",
      cwd: project.path,
      state: "running"
    });

    const savedLayout = db.saveProjectLayout({
      projectId: project.id,
      activeSessionId: session.id,
      terminalMode: "grid",
      diffMode: "inline",
      selectedFilePath: "packages/core/src/index.ts"
    });

    db.appendTerminalChunk(session.id, "system", "$ codex\r\n");
    db.appendTerminalChunk(session.id, "stdout", "Implementing persistence\n");
    db.updateTerminalSessionState(session.id, "completed", 0);

    const persistedSession = db.getTerminalSessionById(session.id);
    const output = db.getTerminalChunks(session.id);

    expect(savedLayout.activeSessionId).toBe(session.id);
    expect(savedLayout.terminalMode).toBe("grid");
    expect(savedLayout.diffMode).toBe("inline");
    expect(savedLayout.selectedFilePath).toBe("packages/core/src/index.ts");
    expect(persistedSession?.state).toBe("completed");
    expect(persistedSession?.exitCode).toBe(0);
    expect(output.map((chunk) => chunk.content)).toEqual([
      "$ codex\r\n",
      "Implementing persistence\n"
    ]);

    db.close();
  });

  it("updates project metadata from persisted project config", () => {
    const db = new DatabaseClient(createTempDatabasePath());
    const workspace = db.createWorkspace("DadosTech");
    const project = db.createProject({
      workspaceId: workspace.id,
      name: "bridge",
      path: "/tmp/bridge",
      safeMode: "audit",
      ideCommand: "phpstorm",
      configPath: "/tmp/bridge/.agent-workspace.json"
    });

    const updated = db.updateProjectConfig({
      projectId: project.id,
      name: "bridge-next",
      safeMode: "protect",
      ideCommand: "code"
    });

    expect(updated.name).toBe("bridge-next");
    expect(updated.safeMode).toBe("protect");
    expect(updated.ideCommand).toBe("code");

    db.close();
  });
});
