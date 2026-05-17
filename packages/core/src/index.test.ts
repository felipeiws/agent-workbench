import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { DatabaseClient } from "../../database/src/index";
import { GitCliService } from "../../git/src/index";
import { PROJECT_CONFIG_FILE } from "../../shared/src/index";

import { ProjectService, TerminalService } from "./index";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

function initGitRepo(projectDir: string): void {
  mkdirSync(projectDir, { recursive: true });
  execFileSync("git", ["init"], { cwd: projectDir });
  writeFileSync(join(projectDir, "README.md"), "# Test\n", "utf8");
}

class FakeTerminalManager extends EventEmitter {
  has(): boolean {
    return false;
  }

  terminate(): void {}
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();

    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe("ProjectService", () => {
  it("creates and syncs the project config file when missing", async () => {
    const rootDir = createTempDir("agent-workbench-core-");
    const projectDir = join(rootDir, "bridge");
    const databaseFile = join(rootDir, "agent-workbench.db");
    const db = new DatabaseClient(databaseFile);
    const git = new GitCliService();
    const service = new ProjectService(db, git);
    const workspace = db.createWorkspace("DadosTech");
    const project = db.createProject({
      workspaceId: workspace.id,
      name: "bridge",
      path: projectDir,
      safeMode: "off",
      ideCommand: "code",
      configPath: join(projectDir, PROJECT_CONFIG_FILE)
    });

    const loaded = await service.getProjectConfig(project.id);
    const persisted = db.getProjectById(project.id);

    expect(loaded.source).toBe("defaults");
    expect(loaded.config.project).toBe("bridge");
    expect(loaded.config.ide.command).toBe("phpstorm");
    expect(readFileSync(loaded.path, "utf8")).toContain('"project": "bridge"');
    expect(persisted?.safeMode).toBe("audit");
    expect(persisted?.ideCommand).toBe("phpstorm");

    db.close();
  });

  it("imports a local git project into the selected workspace", async () => {
    const rootDir = createTempDir("agent-workbench-core-");
    const projectDir = join(rootDir, "bridge");
    const databaseFile = join(rootDir, "agent-workbench.db");
    initGitRepo(projectDir);

    const db = new DatabaseClient(databaseFile);
    const git = new GitCliService();
    const service = new ProjectService(db, git);
    const workspace = db.createWorkspace("Clientes");

    const result = await service.importProject(projectDir, workspace.id);

    expect(result.status).toBe("imported");
    if (result.status !== "imported") {
      throw new Error("Expected project import to succeed.");
    }

    const project = db.getProjectById(result.projectId);

    expect(project?.workspaceId).toBe(workspace.id);
    expect(project?.path).toBe(projectDir);
    expect(readFileSync(join(projectDir, PROJECT_CONFIG_FILE), "utf8")).toContain('"project": "bridge"');

    db.close();
  });

  it("rejects folders that are not git projects", async () => {
    const rootDir = createTempDir("agent-workbench-core-");
    const projectDir = join(rootDir, "not-a-repo");
    const databaseFile = join(rootDir, "agent-workbench.db");
    mkdirSync(projectDir, { recursive: true });

    const db = new DatabaseClient(databaseFile);
    const git = new GitCliService();
    const service = new ProjectService(db, git);

    await expect(service.importProject(projectDir)).rejects.toThrow("not a Git project");

    db.close();
  });
});

describe("TerminalService", () => {
  it("clears the active tab when a terminal is closed manually", async () => {
    const rootDir = createTempDir("agent-workbench-core-");
    const databaseFile = join(rootDir, "agent-workbench.db");
    const db = new DatabaseClient(databaseFile);
    const git = new GitCliService();
    const projectService = new ProjectService(db, git);
    const workspace = db.createWorkspace("DadosTech");
    const project = db.createProject({
      workspaceId: workspace.id,
      name: "bridge",
      path: rootDir,
      safeMode: "audit",
      ideCommand: "code",
      configPath: join(rootDir, PROJECT_CONFIG_FILE)
    });

    const session = db.createTerminalSession({
      projectId: project.id,
      name: "Shell",
      command: "bash",
      cwd: rootDir,
      state: "running"
    });

    db.saveProjectLayout({
      projectId: project.id,
      activeSessionId: session.id,
      terminalMode: "focus",
      diffMode: "side-by-side",
      selectedFilePath: null
    });

    const service = new TerminalService(
      db,
      projectService,
      new FakeTerminalManager() as unknown as import("../../terminal/src/index").TerminalManager
    );

    await service.terminate(session.id);

    expect(db.getProjectLayout(project.id).activeSessionId).toBeNull();
    expect(db.getTerminalSessionById(session.id)?.exitCode).toBe(-1);

    db.close();
  });
});
