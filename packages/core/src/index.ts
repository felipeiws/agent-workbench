import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { DatabaseClient } from "../../database/src/index";
import { GitCliService } from "../../git/src/index";
import {
  PROJECT_CONFIG_FILE,
  buildDefaultProjectConfig,
  inferMultiAgentSuspicion,
  parseProjectConfig,
  type CoreServices,
  type DiffRequestPayload,
  type GitFilePayload,
  type IdeOpenPayload,
  type SeedData,
  type TerminalCreatePayload,
  type TerminalInputPayload,
  type TerminalResizePayload
} from "../../shared/src/index";
import { TerminalManager } from "../../terminal/src/index";
import type {
  ActiveAgentView,
  DiffPreview,
  FileHistoryEntry,
  GitStatusGroup,
  LoadedProjectConfig,
  ProjectId,
  ProjectRecord,
  TerminalChunkRecord,
  TerminalSessionRecord,
  WorkspaceSnapshot
} from "../../types/src/index";

const execFileAsync = promisify(execFile);

function sortActiveAgents(items: ActiveAgentView[]): ActiveAgentView[] {
  const rank: Record<ActiveAgentView["state"], number> = {
    "waiting-input": 0,
    failed: 1,
    running: 2,
    completed: 3
  };

  return [...items].sort((left, right) => {
    const rankDiff = rank[left.state] - rank[right.state];

    if (rankDiff !== 0) {
      return rankDiff;
    }

    return left.startedAt < right.startedAt ? 1 : -1;
  });
}

export async function openInIde(command: string, targetPath: string): Promise<void> {
  try {
    await execFileAsync(command, [targetPath]);
  } catch {
    return;
  }
}

export class ProjectService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly git: GitCliService
  ) {}

  ensureSeed(seed: SeedData): void {
    for (const workspaceName of seed.workspaces) {
      if (!this.db.getWorkspaceByName(workspaceName)) {
        this.db.createWorkspace(workspaceName);
      }
    }

    const workspaces = this.db.listWorkspaces();

    for (const project of seed.projects) {
      if (this.db.getProjectByPath(project.path)) {
        continue;
      }

      const workspace = workspaces.find((item) => item.name === project.workspaceName);
      if (!workspace) {
        continue;
      }

      this.db.createProject({
        workspaceId: workspace.id,
        name: project.name,
        path: project.path,
        safeMode: "audit",
        ideCommand: project.ideCommand,
        configPath: join(project.path, PROJECT_CONFIG_FILE)
      });
    }
  }

  async getProjectById(projectId: ProjectId): Promise<ProjectRecord> {
    const project = this.db.getProjectById(projectId);

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    return project;
  }

  async getProjectConfig(projectId: ProjectId): Promise<LoadedProjectConfig> {
    const project = await this.getProjectById(projectId);
    const configPath = project.configPath;

    if (!existsSync(configPath)) {
      return parseProjectConfig(
        buildDefaultProjectConfig(project.name),
        configPath,
        "defaults"
      );
    }

    const raw = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    return parseProjectConfig(raw, configPath, "file");
  }

  async listActiveAgents(): Promise<ActiveAgentView[]> {
    const projects = this.db.listProjects();
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const active = this.db.listTerminalSessions().filter((session) => {
      return session.state !== "completed";
    });

    return sortActiveAgents(
      active.map((session) => ({
        sessionId: session.id,
        projectId: session.projectId,
        projectName: projectMap.get(session.projectId)?.name ?? "Unknown",
        terminalName: session.name,
        state: session.state,
        startedAt: session.startedAt
      }))
    );
  }

  async getSnapshot(): Promise<WorkspaceSnapshot> {
    const workspaces = this.db.listWorkspaces();
    const projects = this.db.listProjects();
    const sessions = this.db.listTerminalSessions();

    const projectSnapshots = await Promise.all(
      projects.map(async (project) => {
        const groups = await this.git.getStatus(project.path);
        const primaryFile = groups[0]?.items[0]?.path ?? "src/main.ts";
        const [config, diff, history] = await Promise.all([
          this.getProjectConfig(project.id),
          this.git.getDiff(project.path, primaryFile, "side-by-side"),
          this.git.getHistory(project.path, primaryFile)
        ]);

        const projectSessions = sessions.filter((session) => session.projectId === project.id);

        return {
          project,
          config,
          git: {
            groups,
            diff,
            history,
            suspicion: inferMultiAgentSuspicion(project, projectSessions)
          },
          sessions: projectSessions
        };
      })
    );

    return {
      workspaces,
      projects: projectSnapshots,
      activeAgents: await this.listActiveAgents()
    };
  }

  async openIde(payload: IdeOpenPayload): Promise<void> {
    const project = await this.getProjectById(payload.projectId);
    const targetPath = payload.filePath ? join(project.path, payload.filePath) : project.path;
    await openInIde(project.ideCommand, targetPath);
  }
}

export class TerminalService {
  private readonly events = new EventEmitter();

  constructor(
    private readonly db: DatabaseClient,
    private readonly projectService: ProjectService,
    private readonly terminalManager: TerminalManager
  ) {
    this.terminalManager.on("output", (event: { sessionId: string; stream: "stdout" | "stderr" | "system"; content: string }) => {
      const chunk = this.db.appendTerminalChunk(event.sessionId, event.stream, event.content);
      this.events.emit("output", {
        sessionId: event.sessionId,
        chunk
      });
    });

    this.terminalManager.on("exit", (event: { sessionId: string; exitCode: number }) => {
      const state = event.exitCode === 0 ? "completed" : "failed";
      this.db.updateTerminalSessionState(event.sessionId, state, event.exitCode);
      this.events.emit("exit", event);
    });
  }

  async createSession(payload: TerminalCreatePayload): Promise<TerminalSessionRecord> {
    const project = await this.projectService.getProjectById(payload.projectId);
    const session = this.db.createTerminalSession({
      projectId: payload.projectId,
      name: payload.name,
      command: payload.command,
      cwd: project.path,
      state: "running"
    });

    this.db.appendTerminalChunk(session.id, "system", `$ ${payload.command}\r\n`);

    this.terminalManager.spawn({
      id: session.id,
      name: payload.name,
      cwd: project.path,
      command: payload.command
    });

    return session;
  }

  async write(payload: TerminalInputPayload): Promise<void> {
    this.terminalManager.write(payload.sessionId, payload.input);
    const state = payload.input.includes("\n") ? "running" : "waiting-input";
    this.db.updateTerminalSessionState(payload.sessionId, state);
  }

  async resize(payload: TerminalResizePayload): Promise<void> {
    this.terminalManager.resize(payload.sessionId, payload.cols, payload.rows);
  }

  async terminate(sessionId: string): Promise<void> {
    this.terminalManager.terminate(sessionId);
    this.db.updateTerminalSessionState(sessionId, "failed", -1);
  }

  async getOutput(sessionId: string): Promise<TerminalChunkRecord[]> {
    return this.db.getTerminalChunks(sessionId);
  }

  onOutput(listener: (event: { sessionId: string; chunk: TerminalChunkRecord }) => void): void {
    this.events.on("output", listener);
  }

  onExit(listener: (event: { sessionId: string; exitCode: number }) => void): void {
    this.events.on("exit", listener);
  }
}

export class GitServiceFacade {
  constructor(
    private readonly db: DatabaseClient,
    private readonly git: GitCliService
  ) {}

  private async projectPath(projectId: string): Promise<string> {
    const project = this.db.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    return project.path;
  }

  async getStatus(projectId: string): Promise<GitStatusGroup[]> {
    return this.git.getStatus(await this.projectPath(projectId));
  }

  async stage(payload: GitFilePayload): Promise<GitStatusGroup[]> {
    return this.git.stage(await this.projectPath(payload.projectId), payload.filePath);
  }

  async unstage(payload: GitFilePayload): Promise<GitStatusGroup[]> {
    return this.git.unstage(await this.projectPath(payload.projectId), payload.filePath);
  }

  async getDiff(payload: DiffRequestPayload): Promise<DiffPreview> {
    return this.git.getDiff(
      await this.projectPath(payload.projectId),
      payload.filePath,
      payload.mode
    );
  }

  async getHistory(payload: GitFilePayload): Promise<FileHistoryEntry[]> {
    return this.git.getHistory(await this.projectPath(payload.projectId), payload.filePath);
  }
}

export function createCoreServices(databaseFile: string, seed: SeedData): CoreServices {
  const db = new DatabaseClient(databaseFile);
  const git = new GitCliService();
  const projectService = new ProjectService(db, git);
  const terminalManager = new TerminalManager();
  const terminalService = new TerminalService(db, projectService, terminalManager);
  const gitService = new GitServiceFacade(db, git);

  projectService.ensureSeed(seed);

  return {
    projectService,
    terminalService,
    gitService
  };
}
