import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { DatabaseClient } from "../../database/src/index";
import { GitCliService } from "../../git/src/index";
import { GitHubService } from "../../github/src/index";
import { watchProject } from "../../watcher/src/index";
import { PROJECT_CONFIG_FILE, buildDefaultProjectConfig, detectSuspiciousCommand, inferMultiAgentSuspicion, parseProjectConfig } from "../../shared/src/index";
import { TerminalManager } from "../../terminal/src/index";
const execFileAsync = promisify(execFile);
const ANSI_ESCAPE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const WAITING_INPUT_PATTERNS = [
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
function detectsWaitingInput(content) {
    const plain = content.replace(ANSI_ESCAPE, "").replace(/\r/g, "");
    return WAITING_INPUT_PATTERNS.some((pattern) => pattern.test(plain));
}
function sortActiveAgents(items) {
    const rank = {
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
export async function openInIde(command, targetPath, line) {
    const args = line !== undefined ? ["--line", String(line), targetPath] : [targetPath];
    try {
        await execFileAsync(command, args);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            throw new Error(`IDE "${command}" not found. Make sure it is installed and available in PATH.`);
        }
        // Non-zero exit is expected when the IDE is already running and takes focus
    }
}
function writeProjectConfigFile(path, config) {
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
export class WatcherService {
    git;
    db;
    getActivityMap;
    events = new EventEmitter();
    watchers = new Map();
    constructor(git, db, getActivityMap) {
        this.git = git;
        this.db = db;
        this.getActivityMap = getActivityMap;
    }
    watchProject(projectId, projectPath) {
        if (this.watchers.has(projectId)) {
            return;
        }
        this.startWatcher(projectId, projectPath, false);
    }
    unwatchProject(projectId) {
        const watcher = this.watchers.get(projectId);
        if (watcher) {
            void watcher.close();
            this.watchers.delete(projectId);
        }
    }
    onGitStatusChanged(listener) {
        this.events.on("gitStatusChanged", listener);
    }
    startWatcher(projectId, projectPath, polling) {
        const watcher = watchProject({
            path: projectPath,
            polling,
            onChange: () => void this.handleChange(projectId, projectPath)
        });
        watcher.on("error", (err) => {
            const code = err.code;
            if (!polling && (code === "ENOSPC" || code === "EMFILE")) {
                void watcher.close();
                this.watchers.delete(projectId);
                this.startWatcher(projectId, projectPath, true);
            }
        });
        this.watchers.set(projectId, watcher);
    }
    async handleChange(projectId, projectPath) {
        const groups = await this.git.getStatus(projectPath);
        const sessions = this.db.listTerminalSessions(projectId);
        const activityMap = this.getActivityMap?.() ?? new Map();
        const suspicion = inferMultiAgentSuspicion(sessions, activityMap);
        this.events.emit("gitStatusChanged", { projectId, groups, suspicion });
    }
}
export class ProjectService {
    db;
    git;
    watcherService;
    constructor(db, git) {
        this.db = db;
        this.git = git;
    }
    setWatcher(watcherService) {
        this.watcherService = watcherService;
    }
    ensureDefaultWorkspace() {
        if (this.db.listWorkspaces().length > 0) {
            return;
        }
        this.db.createWorkspace("Local");
    }
    async renameWorkspace(payload) {
        this.db.renameWorkspace(payload.workspaceId, payload.name);
    }
    async removeProject(projectId) {
        this.watcherService?.unwatchProject(projectId);
        this.db.deleteProject(projectId);
    }
    async getProjectById(projectId) {
        const project = this.db.getProjectById(projectId);
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }
        return project;
    }
    async getProjectConfig(projectId) {
        const project = await this.getProjectById(projectId);
        const configPath = project.configPath;
        if (!existsSync(configPath)) {
            const config = buildDefaultProjectConfig(project.name || basename(project.path));
            mkdirSync(dirname(configPath), { recursive: true });
            writeProjectConfigFile(configPath, config);
            const loaded = parseProjectConfig(config, configPath, "defaults");
            this.db.updateProjectConfig({
                projectId: project.id,
                name: loaded.config.project,
                safeMode: loaded.config.safeMode,
                ideCommand: loaded.config.ide.command
            });
            return loaded;
        }
        const raw = JSON.parse(readFileSync(configPath, "utf8"));
        const loaded = parseProjectConfig(raw, configPath, "file");
        this.db.updateProjectConfig({
            projectId: project.id,
            name: loaded.config.project,
            safeMode: loaded.config.safeMode,
            ideCommand: loaded.config.ide.command
        });
        return loaded;
    }
    async importProject(projectPath, workspaceId) {
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
        const workspace = (workspaceId
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
    async getProjectLayout(projectId) {
        await this.getProjectById(projectId);
        return this.db.getProjectLayout(projectId);
    }
    async saveProjectLayout(payload) {
        await this.getProjectById(payload.projectId);
        return this.db.saveProjectLayout(payload);
    }
    async listActiveAgents() {
        const projects = this.db.listProjects();
        const projectMap = new Map(projects.map((project) => [project.id, project]));
        const sessions = this.db.listTerminalSessions().filter((session) => !(session.state === "failed" && session.exitCode === -1));
        return sortActiveAgents(sessions.map((session) => ({
            sessionId: session.id,
            projectId: session.projectId,
            projectName: projectMap.get(session.projectId)?.name ?? "Unknown",
            terminalName: session.name,
            state: session.state,
            startedAt: session.startedAt
        })));
    }
    async getSnapshot() {
        const workspaces = this.db.listWorkspaces();
        const projects = this.db.listProjects();
        const sessions = this.db.listTerminalSessions();
        const projectSnapshots = await Promise.all(projects.map(async (project) => {
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
        }));
        return {
            workspaces,
            projects: projectSnapshots,
            activeAgents: await this.listActiveAgents()
        };
    }
    async openIde(payload) {
        await this.getProjectConfig(payload.projectId);
        const project = await this.getProjectById(payload.projectId);
        const targetPath = payload.filePath ? join(project.path, payload.filePath) : project.path;
        await openInIde(project.ideCommand, targetPath, payload.line);
    }
    async saveGitHubConfig(projectId, github) {
        const project = await this.getProjectById(projectId);
        const current = await this.getProjectConfig(projectId);
        const { github: _removed, ...rest } = current.config;
        const nextConfig = github ? { ...rest, github } : rest;
        writeProjectConfigFile(project.configPath, nextConfig);
        return this.getProjectConfig(projectId);
    }
}
export class TerminalService {
    db;
    projectService;
    terminalManager;
    auditService;
    events = new EventEmitter();
    lastActivityAt = new Map();
    inputBuffers = new Map();
    constructor(db, projectService, terminalManager, auditService) {
        this.db = db;
        this.projectService = projectService;
        this.terminalManager = terminalManager;
        this.auditService = auditService;
        this.terminalManager.on("output", (event) => {
            this.lastActivityAt.set(event.sessionId, Date.now());
            const chunk = this.db.appendTerminalChunk(event.sessionId, event.stream, event.content);
            const session = this.db.getTerminalSessionById(event.sessionId);
            if (session?.state === "running" && detectsWaitingInput(event.content)) {
                this.db.updateTerminalSessionState(event.sessionId, "waiting-input");
                this.events.emit("stateChange", { sessionId: event.sessionId, state: "waiting-input" });
            }
            this.events.emit("output", {
                sessionId: event.sessionId,
                chunk
            });
        });
        this.terminalManager.on("exit", (event) => {
            const state = event.exitCode === 0 ? "completed" : "failed";
            this.db.updateTerminalSessionState(event.sessionId, state, event.exitCode);
            this.syncProjectLayoutAfterSessionExit(event.sessionId, event.exitCode);
            this.events.emit("exit", event);
        });
    }
    syncProjectLayoutAfterSessionExit(sessionId, exitCode) {
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
        const nextVisibleSession = this.db
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
    async createSession(payload) {
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
    async restart(payload) {
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
    async write(payload) {
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
                this.events.emit("stateChange", { sessionId: payload.sessionId, state: "running" });
            }
        }
    }
    async resize(payload) {
        this.terminalManager.resize(payload.sessionId, payload.cols, payload.rows);
    }
    async terminate(sessionId) {
        if (this.terminalManager.has(sessionId)) {
            this.terminalManager.terminate(sessionId);
        }
        this.inputBuffers.delete(sessionId);
        this.db.updateTerminalSessionState(sessionId, "failed", -1);
        this.syncProjectLayoutAfterSessionExit(sessionId, -1);
    }
    async getOutput(sessionId) {
        return this.db.getTerminalChunks(sessionId);
    }
    getLastActivityMap() {
        return this.lastActivityAt;
    }
    onOutput(listener) {
        this.events.on("output", listener);
    }
    onExit(listener) {
        this.events.on("exit", listener);
    }
    onStateChange(listener) {
        this.events.on("stateChange", listener);
    }
}
export class GitServiceFacade {
    db;
    git;
    constructor(db, git) {
        this.db = db;
        this.git = git;
    }
    async projectPath(projectId) {
        const project = this.db.getProjectById(projectId);
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }
        return project.path;
    }
    async getStatus(projectId) {
        return this.git.getStatus(await this.projectPath(projectId));
    }
    async stage(payload) {
        return this.git.stage(await this.projectPath(payload.projectId), payload.filePath);
    }
    async unstage(payload) {
        return this.git.unstage(await this.projectPath(payload.projectId), payload.filePath);
    }
    async getDiff(payload) {
        return this.git.getDiff(await this.projectPath(payload.projectId), payload.filePath, payload.mode, payload.staged);
    }
    async getHistory(payload) {
        return this.git.getHistory(await this.projectPath(payload.projectId), payload.filePath);
    }
    async getCommitDiff(payload) {
        return this.git.getCommitDiff(await this.projectPath(payload.projectId), payload.commitHash, payload.filePath, payload.mode);
    }
    async addToGitIgnore(payload) {
        this.git.addToGitIgnore(await this.projectPath(payload.projectId), payload.filePath);
    }
    async commit(payload) {
        return this.git.commit(await this.projectPath(payload.projectId), payload.message);
    }
    async getStagedDiff(projectId) {
        return this.git.getStagedDiff(await this.projectPath(projectId));
    }
}
export class AuditService {
    db;
    events = new EventEmitter();
    constructor(db) {
        this.db = db;
    }
    async listEvents(projectId) {
        return this.db.listAuditEvents(projectId);
    }
    record(sessionId, projectId, command) {
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
        this.events.emit("auditEvent", { projectId, event });
    }
    onAuditEvent(listener) {
        this.events.on("auditEvent", listener);
    }
}
function buildIssuePrompt(issue) {
    const body = issue.body?.trim() ?? "No description provided.";
    return `GitHub Issue #${issue.number}: ${issue.title}\n\n${body}`;
}
function shellSingleQuote(s) {
    return `'${s.replace(/'/g, "'\\''")}'`;
}
export class GitHubDispatcher {
    db;
    projectService;
    terminalService;
    events = new EventEmitter();
    githubService;
    inFlight = new Set();
    constructor(db, projectService, terminalService) {
        this.db = db;
        this.projectService = projectService;
        this.terminalService = terminalService;
        this.githubService = new GitHubService();
        this.githubService.onIssuePolled(({ projectId, issue }) => {
            void this.executeDispatch(projectId, issue);
        });
    }
    dispatchKey(projectId, issueNumber) {
        return `${projectId}:${issueNumber}`;
    }
    async getProjectGitHubConfig(projectId) {
        const loaded = await this.projectService.getProjectConfig(projectId);
        if (!loaded.config.github) {
            throw new Error(`Project ${projectId} has no GitHub configuration`);
        }
        return loaded.config.github;
    }
    async executeDispatch(projectId, issue) {
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
            await this.githubService.postComment(config, issue.number, `🤖 Agent Workbench picked up this issue and started a terminal session (\`${session.id}\`).`);
            const event = { projectId, issue, sessionId: session.id };
            this.events.emit("issueDispatched", event);
        }
        finally {
            this.inFlight.delete(key);
        }
    }
    startWatchingProject(projectId, config) {
        if (!config.watchIssues) {
            return;
        }
        this.githubService.startWatchingProject(projectId, config);
    }
    stopWatchingProject(projectId) {
        this.githubService.stopWatchingProject(projectId);
    }
    async listIssues(projectId) {
        const config = await this.getProjectGitHubConfig(projectId);
        return this.githubService.listIssues(projectId, config);
    }
    async dispatchIssue(projectId, issueNumber) {
        const config = await this.getProjectGitHubConfig(projectId);
        const issue = await this.githubService.getIssue(config, issueNumber);
        await this.executeDispatch(projectId, issue);
        const record = this.db.listDispatchedIssues(projectId).find((item) => item.issueNumber === issueNumber);
        if (!record) {
            throw new Error(`Dispatch of issue #${issueNumber} failed or was already dispatched`);
        }
        return { projectId, issue, sessionId: record.sessionId ?? "" };
    }
    listDispatched(projectId) {
        return this.db.listDispatchedIssues(projectId);
    }
    onIssueDispatched(listener) {
        this.events.on("issueDispatched", listener);
    }
}
const DEFAULT_COMMIT_PROMPT =
    "Generate a concise git commit message for these staged changes. Use conventional commits format (feat:, fix:, refactor:, chore:, docs:, style:, test:, etc.). Reply with ONLY the commit message, nothing else.";
export class SettingsService {
    db;
    constructor(db) {
        this.db = db;
    }
    getSettings() {
        return {
            aiProvider: this.db.getAppSetting("aiProvider") ?? "anthropic",
            aiApiKey: (this.db.getAppSetting("aiApiKey") ?? "").trim(),
            aiModel: this.db.getAppSetting("aiModel") ?? "claude-haiku-4-5-20251001",
            commitPrompt: this.db.getAppSetting("commitPrompt") ?? DEFAULT_COMMIT_PROMPT
        };
    }
    saveSettings(settings) {
        for (const [key, value] of Object.entries(settings)) {
            if (value !== undefined) {
                this.db.setAppSetting(key, String(value));
            }
        }
        return this.getSettings();
    }
}
export function createCoreServices(databaseFile) {
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
            startWatchingProject: (projectId, config) => githubDispatcher.startWatchingProject(projectId, config),
            stopWatchingProject: (projectId) => githubDispatcher.stopWatchingProject(projectId),
            listIssues: (projectId) => githubDispatcher.listIssues(projectId),
            dispatchIssue: (projectId, issueNumber) => githubDispatcher.dispatchIssue(projectId, issueNumber),
            listDispatched: (projectId) => githubDispatcher.listDispatched(projectId),
            onIssueDispatched: (listener) => githubDispatcher.onIssueDispatched(listener)
        }
    };
}
