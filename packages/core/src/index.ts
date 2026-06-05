import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import { DatabaseClient } from "../../database/src/index";
import { GitCliService } from "../../git/src/index";
import { GitHubService } from "../../github/src/index";
import { TaskLoopService } from "../../taskloop/src/index";
import { watchProject } from "../../watcher/src/index";
import {
  PROJECT_CONFIG_FILE,
  buildDefaultProjectConfig,
  detectSuspiciousCommand,
  inferMultiAgentSuspicion,
  normalizeTerminalCommand,
  parseProjectConfig,
  type AuditEventDetectedEvent,
  type CoreServices,
  type DiffRequestPayload,
  type GitCommitDiffPayload,
  type GitCommitPayload,
  type GitFilePayload,
  type GitStatusChangedEvent,
  type IdeOpenPayload,
  type RenameWorkspacePayload,
  type SaveProjectLayoutPayload,
  type TerminalCreatePayload,
  type TerminalInputPayload,
  type TerminalRestartPayload,
  type TerminalResizePayload
} from "../../shared/src/index";
import { TerminalManager } from "../../terminal/src/index";
import {
  AiTerminalManager,
  type AiTerminalBlockStartEvent,
  type AiTerminalBlockChunkEvent,
  type AiTerminalBlockEndEvent,
  type AiTerminalExitEvent,
  type AiTerminalPromptEvent
} from "../../ai-terminal/src/index";
import type { FSWatcher } from "chokidar";
import type {
  ActiveAgentView,
  AiTerminalSessionRecord,
  AppSettings,
  AuditEvent,
  CommandBlock,
  DiffPreview,
  FileHistoryEntry,
  GitHubIssue,
  GitHubIssueRecord,
  GitStatusGroup,
  IssueDispatchEvent,
  LoadedProjectConfig,
  ProjectGitHubConfig,
  ProjectId,
  ProjectImportResult,
  ProjectLayoutRecord,
  ProjectRecord,
  TerminalChunkRecord,
  TerminalLifecycleState,
  TerminalSessionRecord,
  WorkspaceSnapshot
} from "../../types/src/index";

const execFileAsync = promisify(execFile);

const ANSI_ESCAPE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

const WAITING_INPUT_PATTERNS: RegExp[] = [
  /\[y\/n\]/i,
  /\(y\/n\)/i,
  /\[yes\/no\]/i,
  /press\s+(any\s+key|enter\b)/i,
  /password\s*:/i,
  /passphrase\s*:/i,
  /\bproceed\?/i,
  /\bcontinue\?/i,
  /are\s+you\s+sure/i,
  /do\s+you\s+want\s+to\b/i,
];

function detectsWaitingInput(content: string): boolean {
  const plain = content.replace(ANSI_ESCAPE, "").replace(/\r/g, "");
  return WAITING_INPUT_PATTERNS.some((pattern) => pattern.test(plain));
}

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

export async function openInIde(command: string, targetPath: string, line?: number): Promise<void> {
  const args = line !== undefined ? ["--line", String(line), targetPath] : [targetPath];
  try {
    await execFileAsync(command, args);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`IDE "${command}" not found. Make sure it is installed and available in PATH.`);
    }
    // Non-zero exit is expected when the IDE is already running and takes focus
  }
}

function writeProjectConfigFile(path: string, config: LoadedProjectConfig["config"]): void {
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export class WatcherService {
  private readonly events = new EventEmitter();
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly refreshState = new Map<string, { running: boolean; pending: boolean }>();

  constructor(
    private readonly git: GitCliService,
    private readonly db: DatabaseClient,
    private readonly getActivityMap?: () => ReadonlyMap<string, number>
  ) {}

  watchProject(projectId: string, projectPath: string): void {
    if (this.watchers.has(projectId)) {
      return;
    }

    this.startWatcher(projectId, projectPath, false);
  }

  unwatchProject(projectId: string): void {
    const watcher = this.watchers.get(projectId);
    if (watcher) {
      void watcher.close();
      this.watchers.delete(projectId);
    }

    this.refreshState.delete(projectId);
  }

  onGitStatusChanged(listener: (event: GitStatusChangedEvent) => void): void {
    this.events.on("gitStatusChanged", listener);
  }

  private startWatcher(projectId: string, projectPath: string, polling: boolean): void {
    const watcher = watchProject({
      path: projectPath,
      polling,
      onChange: () => void this.handleChange(projectId, projectPath)
    });

    watcher.on("error", (err: unknown) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (!polling && (code === "ENOSPC" || code === "EMFILE")) {
        void watcher.close();
        this.watchers.delete(projectId);
        this.startWatcher(projectId, projectPath, true);
      }
    });

    this.watchers.set(projectId, watcher);
  }

  private async handleChange(projectId: string, projectPath: string): Promise<void> {
    const state = this.refreshState.get(projectId) ?? { running: false, pending: false };

    if (state.running) {
      state.pending = true;
      this.refreshState.set(projectId, state);
      return;
    }

    state.running = true;
    state.pending = false;
    this.refreshState.set(projectId, state);

    try {
      const groups = await this.git.getStatus(projectPath);
      const sessions = this.db.listTerminalSessions(projectId);
      const activityMap = this.getActivityMap?.() ?? new Map<string, number>();
      const suspicion = inferMultiAgentSuspicion(sessions, activityMap);
      this.events.emit("gitStatusChanged", { projectId, groups, suspicion });
    } finally {
      const nextState = this.refreshState.get(projectId);

      if (!nextState) {
        return;
      }

      nextState.running = false;

      if (nextState.pending) {
        nextState.pending = false;
        void this.handleChange(projectId, projectPath);
        return;
      }

      this.refreshState.set(projectId, nextState);
    }
  }
}

export class ProjectService {
  private watcherService?: WatcherService;

  constructor(
    private readonly db: DatabaseClient,
    private readonly git: GitCliService
  ) {}

  setWatcher(watcherService: WatcherService): void {
    this.watcherService = watcherService;
  }

  ensureDefaultWorkspace(): void {
    if (this.db.listWorkspaces().length > 0) {
      return;
    }

    this.db.createWorkspace("Local");
  }

  async renameWorkspace(payload: RenameWorkspacePayload): Promise<void> {
    this.db.renameWorkspace(payload.workspaceId, payload.name);
  }

  async removeProject(projectId: ProjectId): Promise<void> {
    this.watcherService?.unwatchProject(projectId);
    this.db.deleteProject(projectId);
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
      const config = buildDefaultProjectConfig(project.name || basename(project.path));
      mkdirSync(dirname(configPath), { recursive: true });
      writeProjectConfigFile(configPath, config);

      const loaded = parseProjectConfig(
        config,
        configPath,
        "defaults"
      );

      this.db.updateProjectConfig({
        projectId: project.id,
        name: loaded.config.project,
        safeMode: loaded.config.safeMode,
        ideCommand: loaded.config.ide.command
      });

      return loaded;
    }

    const raw = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    const loaded = parseProjectConfig(raw, configPath, "file");

    this.db.updateProjectConfig({
      projectId: project.id,
      name: loaded.config.project,
      safeMode: loaded.config.safeMode,
      ideCommand: loaded.config.ide.command
    });

    return loaded;
  }

  async importProject(
    projectPath: string,
    workspaceId?: string
  ): Promise<ProjectImportResult> {
    if (!existsSync(projectPath)) {
      throw new Error("Selected folder does not exist anymore.");
    }

    if (!statSync(projectPath).isDirectory()) {
      throw new Error("Selected path is not a folder.");
    }

    if (!(await this.git.isGitRepository(projectPath))) {
      throw new Error("Selected folder is not a Git project.");
    }

    const existing = this.db.getProjectByPath(projectPath);
    if (existing) {
      await this.getProjectConfig(existing.id);
      this.watcherService?.watchProject(existing.id, projectPath);
      return {
        status: "imported",
        projectId: existing.id,
        workspaceId: existing.workspaceId
      };
    }

    const workspace =
      (workspaceId
        ? this.db.listWorkspaces().find((item) => item.id === workspaceId)
        : null) ??
      this.db.getWorkspaceByName("Local") ??
      this.db.createWorkspace("Local");

    const project = this.db.createProject({
      workspaceId: workspace.id,
      name: basename(projectPath),
      path: projectPath,
      safeMode: "audit",
      ideCommand: "phpstorm",
      configPath: join(projectPath, PROJECT_CONFIG_FILE)
    });

    await this.getProjectConfig(project.id);
    this.watcherService?.watchProject(project.id, projectPath);

    return {
      status: "imported",
      projectId: project.id,
      workspaceId: project.workspaceId
    };
  }

  async getProjectLayout(projectId: ProjectId): Promise<ProjectLayoutRecord> {
    await this.getProjectById(projectId);
    return this.db.getProjectLayout(projectId);
  }

  async saveProjectLayout(
    payload: SaveProjectLayoutPayload
  ): Promise<ProjectLayoutRecord> {
    await this.getProjectById(payload.projectId);
    return this.db.saveProjectLayout(payload);
  }

  async listActiveAgents(): Promise<ActiveAgentView[]> {
    const projects = this.db.listProjects();
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const sessions = this.db.listTerminalSessions().filter(
      (session) => !(session.state === "failed" && session.exitCode === -1)
    );

    return sortActiveAgents(
      sessions.map((session) => ({
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
        const config = await this.getProjectConfig(project.id);
        const syncedProject = await this.getProjectById(project.id);
        const groups = await this.git.getStatus(syncedProject.path);
        const projectSessions = sessions.filter((session) => session.projectId === syncedProject.id);

        return {
          project: syncedProject,
          layout: this.db.getProjectLayout(syncedProject.id),
          config,
          git: {
            groups,
            suspicion: inferMultiAgentSuspicion(projectSessions)
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
    await this.getProjectConfig(payload.projectId);
    const project = await this.getProjectById(payload.projectId);
    const targetPath = payload.filePath ? join(project.path, payload.filePath) : project.path;
    await openInIde(project.ideCommand, targetPath, payload.line);
  }

  async openFileInEditor(projectId: ProjectId, filePath: string, editorCommand: string, line?: number): Promise<void> {
    const project = await this.getProjectById(projectId);
    const command = editorCommand.trim() || project.ideCommand;
    const targetPath = join(project.path, filePath);
    await openInIde(command, targetPath, line);
  }

  async saveGitHubConfig(projectId: ProjectId, github: ProjectGitHubConfig | null): Promise<LoadedProjectConfig> {
    const project = await this.getProjectById(projectId);
    const current = await this.getProjectConfig(projectId);
    const { github: _removed, ...rest } = current.config;
    const nextConfig = github ? { ...rest, github } : rest;
    writeProjectConfigFile(project.configPath, nextConfig);
    return this.getProjectConfig(projectId);
  }
}

export class TerminalService {
  private readonly events = new EventEmitter();
  private readonly lastActivityAt = new Map<string, number>();
  private readonly inputBuffers = new Map<string, string>();

  constructor(
    private readonly db: DatabaseClient,
    private readonly projectService: ProjectService,
    private readonly terminalManager: TerminalManager,
    private readonly auditService?: AuditService
  ) {
    this.terminalManager.on("output", (event: { sessionId: string; stream: "stdout" | "stderr" | "system"; content: string }) => {
      this.lastActivityAt.set(event.sessionId, Date.now());
      const chunk = this.db.appendTerminalChunk(event.sessionId, event.stream, event.content);

      const session = this.db.getTerminalSessionById(event.sessionId);
      if (session?.state === "running" && detectsWaitingInput(event.content)) {
        this.db.updateTerminalSessionState(event.sessionId, "waiting-input");
        this.events.emit("stateChange", { sessionId: event.sessionId, state: "waiting-input" as TerminalLifecycleState });
      }

      this.events.emit("output", {
        sessionId: event.sessionId,
        chunk
      });
    });

    this.terminalManager.on("exit", (event: { sessionId: string; exitCode: number }) => {
      const state = event.exitCode === 0 ? "completed" : "failed";
      this.db.updateTerminalSessionState(event.sessionId, state, event.exitCode);
      this.syncProjectLayoutAfterSessionExit(event.sessionId, event.exitCode);
      this.events.emit("exit", event);
    });
  }

  private syncProjectLayoutAfterSessionExit(sessionId: string, exitCode: number): void {
    if (exitCode !== -1) {
      return;
    }

    const session = this.db.getTerminalSessionById(sessionId);

    if (!session) {
      return;
    }

    const layout = this.db.getProjectLayout(session.projectId);

    if (layout.activeSessionId !== sessionId) {
      return;
    }

    const nextVisibleSession =
      this.db
        .listTerminalSessions(session.projectId)
        .find((item) => item.id !== sessionId && !(item.state === "failed" && item.exitCode === -1)) ??
      null;

    this.db.saveProjectLayout({
      projectId: session.projectId,
      activeSessionId: nextVisibleSession?.id ?? null,
      terminalMode: layout.terminalMode,
      diffMode: layout.diffMode,
      selectedFilePath: layout.selectedFilePath
    });
  }

  async createSession(payload: TerminalCreatePayload): Promise<TerminalSessionRecord> {
    const project = await this.projectService.getProjectById(payload.projectId);
    const command = normalizeTerminalCommand(payload.command);
    const session = this.db.createTerminalSession({
      projectId: payload.projectId,
      name: payload.name,
      command,
      cwd: project.path,
      state: "running"
    });

    this.db.appendTerminalChunk(session.id, "system", `$ ${command}\r\n`);

    this.terminalManager.spawn({
      id: session.id,
      name: payload.name,
      cwd: project.path,
      command
    });

    const layout = this.db.getProjectLayout(payload.projectId);
    this.db.saveProjectLayout({
      projectId: payload.projectId,
      activeSessionId: session.id,
      terminalMode: layout.terminalMode,
      diffMode: layout.diffMode,
      selectedFilePath: layout.selectedFilePath
    });

    return session;
  }

  async restart(payload: TerminalRestartPayload): Promise<TerminalSessionRecord> {
    const previousSession = this.db.getTerminalSessionById(payload.sessionId);

    if (!previousSession) {
      throw new Error(`Terminal session ${payload.sessionId} not found`);
    }

    if (this.terminalManager.has(previousSession.id)) {
      this.terminalManager.terminate(previousSession.id);
      this.db.updateTerminalSessionState(previousSession.id, "failed", -1);
    }

    return this.createSession({
      projectId: previousSession.projectId,
      name: previousSession.name,
      command: previousSession.command
    });
  }

  async write(payload: TerminalInputPayload): Promise<void> {
    this.terminalManager.write(payload.sessionId, payload.input);

    const buffered = (this.inputBuffers.get(payload.sessionId) ?? "") + payload.input;
    const parts = buffered.split(/\r|\n/);
    this.inputBuffers.set(payload.sessionId, parts[parts.length - 1] ?? "");

    const completedLines = parts.slice(0, -1).filter((line) => line.trim().length > 0);
    for (const line of completedLines) {
      const session = this.db.getTerminalSessionById(payload.sessionId);
      if (session) {
        this.auditService?.record(payload.sessionId, session.projectId, line);
      }
    }

    if (payload.input.includes("\n") || payload.input.includes("\r")) {
      const session = this.db.getTerminalSessionById(payload.sessionId);
      if (session?.state === "waiting-input") {
        this.db.updateTerminalSessionState(payload.sessionId, "running");
        this.events.emit("stateChange", { sessionId: payload.sessionId, state: "running" as TerminalLifecycleState });
      }
    }
  }

  async resize(payload: TerminalResizePayload): Promise<void> {
    this.terminalManager.resize(payload.sessionId, payload.cols, payload.rows);
  }

  async terminate(sessionId: string): Promise<void> {
    if (this.terminalManager.has(sessionId)) {
      this.terminalManager.terminate(sessionId);
    }

    this.inputBuffers.delete(sessionId);
    this.db.updateTerminalSessionState(sessionId, "failed", -1);
    this.syncProjectLayoutAfterSessionExit(sessionId, -1);
  }

  async getOutput(sessionId: string): Promise<TerminalChunkRecord[]> {
    return this.db.getTerminalChunks(sessionId);
  }

  getLastActivityMap(): ReadonlyMap<string, number> {
    return this.lastActivityAt;
  }

  onOutput(listener: (event: { sessionId: string; chunk: TerminalChunkRecord }) => void): void {
    this.events.on("output", listener);
  }

  onExit(listener: (event: { sessionId: string; exitCode: number }) => void): void {
    this.events.on("exit", listener);
  }

  onStateChange(listener: (event: { sessionId: string; state: TerminalLifecycleState }) => void): void {
    this.events.on("stateChange", listener);
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
      payload.mode,
      payload.staged
    );
  }

  async getHistory(payload: GitFilePayload): Promise<FileHistoryEntry[]> {
    return this.git.getHistory(await this.projectPath(payload.projectId), payload.filePath);
  }

  async getCommitDiff(payload: GitCommitDiffPayload): Promise<DiffPreview> {
    return this.git.getCommitDiff(
      await this.projectPath(payload.projectId),
      payload.commitHash,
      payload.filePath,
      payload.mode
    );
  }

  async addToGitIgnore(payload: GitFilePayload): Promise<void> {
    this.git.addToGitIgnore(await this.projectPath(payload.projectId), payload.filePath);
  }

  async commit(payload: GitCommitPayload): Promise<GitStatusGroup[]> {
    return this.git.commit(await this.projectPath(payload.projectId), payload.message);
  }

  async getStagedDiff(projectId: string): Promise<string> {
    return this.git.getStagedDiff(await this.projectPath(projectId));
  }

  async push(projectId: string, token?: string): Promise<void> {
    return this.git.push(await this.projectPath(projectId), token);
  }
}

export class AuditService {
  private readonly events = new EventEmitter();

  constructor(private readonly db: DatabaseClient) {}

  async listEvents(projectId: ProjectId): Promise<AuditEvent[]> {
    return this.db.listAuditEvents(projectId);
  }

  record(sessionId: string, projectId: string, command: string): void {
    const match = detectSuspiciousCommand(command);

    if (!match) {
      return;
    }

    const project = this.db.getProjectById(projectId);

    if (!project || project.safeMode === "off") {
      return;
    }

    const event = this.db.createAuditEvent({
      sessionId,
      projectId,
      command,
      risk: match.risk,
      reason: match.reason
    });

    this.events.emit("auditEvent", { projectId, event } satisfies AuditEventDetectedEvent);
  }

  onAuditEvent(listener: (event: AuditEventDetectedEvent) => void): void {
    this.events.on("auditEvent", listener);
  }
}

function buildIssuePrompt(issue: GitHubIssue): string {
  const body = issue.body?.trim() ?? "No description provided.";
  return `GitHub Issue #${issue.number}: ${issue.title}\n\n${body}`;
}

function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export class GitHubDispatcher {
  private readonly events = new EventEmitter();
  private readonly githubService: GitHubService;
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly db: DatabaseClient,
    private readonly projectService: ProjectService,
    private readonly terminalService: TerminalService
  ) {
    this.githubService = new GitHubService();

    this.githubService.onIssuePolled(({ projectId, issue }) => {
      void this.executeDispatch(projectId, issue);
    });
  }

  private dispatchKey(projectId: string, issueNumber: number): string {
    return `${projectId}:${issueNumber}`;
  }

  private async getProjectGitHubConfig(projectId: string): Promise<ProjectGitHubConfig> {
    const loaded = await this.projectService.getProjectConfig(projectId);

    if (!loaded.config.github) {
      throw new Error(`Project ${projectId} has no GitHub configuration`);
    }

    return loaded.config.github;
  }

  private async executeDispatch(projectId: string, issue: GitHubIssue): Promise<void> {
    const key = this.dispatchKey(projectId, issue.number);

    if (this.inFlight.has(key) || this.db.isIssueDispatched(projectId, issue.number)) {
      return;
    }

    this.inFlight.add(key);

    try {
      const config = await this.getProjectGitHubConfig(projectId);
      const agentCommand = config.agentCommand ?? "claude";
      const prompt = buildIssuePrompt(issue);
      const command = `${agentCommand} ${shellSingleQuote(prompt)}`;

      const session = await this.terminalService.createSession({
        projectId,
        name: `Issue #${issue.number}`,
        command
      });

      this.db.markIssueDispatched({
        projectId,
        issueNumber: issue.number,
        title: issue.title,
        sessionId: session.id
      });

      await this.githubService.postComment(
        config,
        issue.number,
        `🤖 Agent Workbench picked up this issue and started a terminal session (\`${session.id}\`).`
      );

      const event: IssueDispatchEvent = { projectId, issue, sessionId: session.id };
      this.events.emit("issueDispatched", event);
    } finally {
      this.inFlight.delete(key);
    }
  }

  startWatchingProject(projectId: ProjectId, config: ProjectGitHubConfig): void {
    if (!config.watchIssues) {
      return;
    }

    this.githubService.startWatchingProject(projectId, config);
  }

  stopWatchingProject(projectId: ProjectId): void {
    this.githubService.stopWatchingProject(projectId);
  }

  async listIssues(projectId: ProjectId): Promise<GitHubIssue[]> {
    const config = await this.getProjectGitHubConfig(projectId);
    return this.githubService.listIssues(projectId, config);
  }

  async dispatchIssue(projectId: ProjectId, issueNumber: number): Promise<IssueDispatchEvent> {
    const config = await this.getProjectGitHubConfig(projectId);
    const issue = await this.githubService.getIssue(config, issueNumber);
    await this.executeDispatch(projectId, issue);

    const record = this.db.listDispatchedIssues(projectId).find(
      (item) => item.issueNumber === issueNumber
    );

    if (!record) {
      throw new Error(`Dispatch of issue #${issueNumber} failed or was already dispatched`);
    }

    return { projectId, issue, sessionId: record.sessionId ?? "" };
  }

  listDispatched(projectId: ProjectId): GitHubIssueRecord[] {
    return this.db.listDispatchedIssues(projectId);
  }

  onIssueDispatched(listener: (event: IssueDispatchEvent) => void): void {
    this.events.on("issueDispatched", listener);
  }
}

export class AiTerminalService {
  private readonly events = new EventEmitter();
  private readonly manager: AiTerminalManager;

  constructor(private readonly getProjectPath: (projectId: string) => string) {
    this.manager = new AiTerminalManager();

    this.manager.on("blockStart", (e: AiTerminalBlockStartEvent) => {
      const record = this.manager.getRecord(e.sessionId);
      if (record) record.state = "running";
      this.events.emit("blockStart", e);
    });

    this.manager.on("blockChunk", (e: AiTerminalBlockChunkEvent) => {
      this.events.emit("blockChunk", e);
    });

    this.manager.on("blockEnd", (e: AiTerminalBlockEndEvent) => {
      const record = this.manager.getRecord(e.sessionId);
      if (record) {
        record.state = "idle";
        record.cwd = e.cwd;
      }
      this.events.emit("blockEnd", e);
    });

    this.manager.on("prompt", (e: AiTerminalPromptEvent) => {
      const record = this.manager.getRecord(e.sessionId);
      if (record) record.cwd = e.cwd;
      this.events.emit("prompt", e);
    });

    this.manager.on("exit", (e: AiTerminalExitEvent) => {
      this.events.emit("exit", e);
    });
  }

  create(projectId: string, name: string, provider: "claude" | "codex"): AiTerminalSessionRecord {
    const cwd = this.getProjectPath(projectId);
    const record: AiTerminalSessionRecord = {
      id: randomUUID(),
      projectId,
      name,
      cwd,
      provider,
      state: "idle",
      startedAt: new Date().toISOString()
    };
    this.manager.create(record);
    return { ...record };
  }

  send(sessionId: string, command: string): CommandBlock | null {
    return this.manager.sendCommand(sessionId, command);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.manager.resize(sessionId, cols, rows);
  }

  terminate(sessionId: string): void {
    this.manager.terminate(sessionId);
  }

  getBlocks(sessionId: string): CommandBlock[] {
    return this.manager.getBlocks(sessionId);
  }

  listSessions(projectId: string): AiTerminalSessionRecord[] {
    return this.manager.listSessions(projectId);
  }

  onBlockStart(listener: (e: AiTerminalBlockStartEvent) => void): void {
    this.events.on("blockStart", listener);
  }

  onBlockChunk(listener: (e: AiTerminalBlockChunkEvent) => void): void {
    this.events.on("blockChunk", listener);
  }

  onBlockEnd(listener: (e: AiTerminalBlockEndEvent) => void): void {
    this.events.on("blockEnd", listener);
  }

  onPrompt(listener: (e: AiTerminalPromptEvent) => void): void {
    this.events.on("prompt", listener);
  }

  onExit(listener: (e: AiTerminalExitEvent) => void): void {
    this.events.on("exit", listener);
  }
}

const DEFAULT_COMMIT_PROMPT =
  "Generate a concise git commit message for these staged changes. Use conventional commits format (feat:, fix:, refactor:, chore:, docs:, style:, test:, etc.). Reply with ONLY the commit message, nothing else.";

export class SettingsService {
  constructor(private readonly db: DatabaseClient) {}

  getSettings(): AppSettings {
    return {
      aiProvider: (this.db.getAppSetting("aiProvider") as AppSettings["aiProvider"]) ?? "anthropic",
      aiApiKey: (this.db.getAppSetting("aiApiKey") ?? "").trim(),
      aiModel: this.db.getAppSetting("aiModel") ?? "claude-haiku-4-5-20251001",
      commitPrompt: this.db.getAppSetting("commitPrompt") ?? DEFAULT_COMMIT_PROMPT,
      editorCommand: this.db.getAppSetting("editorCommand") ?? "",
      gitToken: this.db.getAppSetting("gitToken") ?? ""
    };
  }

  saveSettings(settings: Partial<AppSettings>): AppSettings {
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined) {
        this.db.setAppSetting(key, String(value));
      }
    }
    return this.getSettings();
  }
}

export function createCoreServices(databaseFile: string): CoreServices {
  const db = new DatabaseClient(databaseFile);
  const git = new GitCliService();
  const settingsService = new SettingsService(db);
  const projectService = new ProjectService(db, git);
  const terminalManager = new TerminalManager();
  const auditService = new AuditService(db);
  const terminalService = new TerminalService(db, projectService, terminalManager, auditService);
  const gitService = new GitServiceFacade(db, git);
  const watcherService = new WatcherService(git, db, () => terminalService.getLastActivityMap());
  const githubDispatcher = new GitHubDispatcher(db, projectService, terminalService);
  const taskLoopService = new TaskLoopService({
    db,
    getProjectPath: (projectId) => {
      const project = db.getProjectById(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);
      return project.path;
    },
    createTerminalSession: (input) =>
      terminalService.createSession({
        projectId: input.projectId,
        name: input.name,
        command: input.command
      }),
    writeTerminal: (sessionId, input) => {
      terminalManager.write(sessionId, input);
    },
    terminateTerminal: (sessionId) => terminalService.terminate(sessionId),
    subscribeToOutput: (listener) => {
      terminalService.onOutput((event) => {
        listener({ sessionId: event.sessionId, content: event.chunk.content });
      });
    }
  });

  const aiTerminalService = new AiTerminalService((projectId) => {
    const project = db.getProjectById(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    return project.path;
  });

  projectService.setWatcher(watcherService);
  projectService.ensureDefaultWorkspace();

  for (const project of db.listProjects()) {
    watcherService.watchProject(project.id, project.path);

    void projectService.getProjectConfig(project.id).then((loaded) => {
      if (loaded.config.github?.watchIssues) {
        githubDispatcher.startWatchingProject(project.id, loaded.config.github);
      }
    });
  }

  return {
    settingsService: {
      getSettings: () => settingsService.getSettings(),
      saveSettings: (settings) => settingsService.saveSettings(settings)
    },
    auditService,
    projectService,
    terminalService,
    gitService,
    watcherService,
    githubService: {
      startWatchingProject: (projectId, config) =>
        githubDispatcher.startWatchingProject(projectId, config),
      stopWatchingProject: (projectId) =>
        githubDispatcher.stopWatchingProject(projectId),
      listIssues: (projectId) =>
        githubDispatcher.listIssues(projectId),
      dispatchIssue: (projectId, issueNumber) =>
        githubDispatcher.dispatchIssue(projectId, issueNumber),
      listDispatched: (projectId) =>
        githubDispatcher.listDispatched(projectId),
      onIssueDispatched: (listener) =>
        githubDispatcher.onIssueDispatched(listener)
    },
    taskLoopService: {
      start: (projectId, agent, definition) =>
        taskLoopService.start(projectId, agent, definition),
      pause: (loopId) => taskLoopService.pause(loopId),
      resume: (loopId, agent) => taskLoopService.resume(loopId, agent),
      stop: (loopId) => taskLoopService.stop(loopId),
      delete: (loopId) => taskLoopService.delete(loopId),
      list: (projectId) => taskLoopService.list(projectId),
      getTasks: (loopId) => taskLoopService.getTasks(loopId),
      onProgress: (listener) => taskLoopService.onProgress(listener)
    },
    aiTerminalService: {
      create: (projectId, name, provider) =>
        aiTerminalService.create(projectId, name, provider),
      send: (sessionId, command) => aiTerminalService.send(sessionId, command),
      resize: (sessionId, cols, rows) => aiTerminalService.resize(sessionId, cols, rows),
      terminate: (sessionId) => aiTerminalService.terminate(sessionId),
      getBlocks: (sessionId) => aiTerminalService.getBlocks(sessionId),
      listSessions: (projectId) => aiTerminalService.listSessions(projectId),
      onBlockStart: (listener) => aiTerminalService.onBlockStart(listener),
      onBlockChunk: (listener) => aiTerminalService.onBlockChunk(listener),
      onBlockEnd: (listener) => aiTerminalService.onBlockEnd(listener),
      onPrompt: (listener) => aiTerminalService.onPrompt(listener),
      onExit: (listener) => aiTerminalService.onExit(listener)
    }
  };
}
