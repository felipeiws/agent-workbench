import { DatabaseClient } from "../../database/src/index";
import { GitCliService } from "../../git/src/index";
import { type AuditEventDetectedEvent, type CoreServices, type DiffRequestPayload, type GitCommitDiffPayload, type GitCommitPayload, type GitFilePayload, type GitStatusChangedEvent, type IdeOpenPayload, type RenameWorkspacePayload, type SaveProjectLayoutPayload, type TerminalCreatePayload, type TerminalInputPayload, type TerminalRestartPayload, type TerminalResizePayload } from "../../shared/src/index";
import { TerminalManager } from "../../terminal/src/index";
import type { ActiveAgentView, AuditEvent, DiffPreview, FileHistoryEntry, GitHubIssue, GitHubIssueRecord, GitStatusGroup, IssueDispatchEvent, LoadedProjectConfig, ProjectGitHubConfig, ProjectId, ProjectImportResult, ProjectLayoutRecord, ProjectRecord, TerminalChunkRecord, TerminalLifecycleState, TerminalSessionRecord, WorkspaceSnapshot } from "../../types/src/index";
export declare function openInIde(command: string, targetPath: string, line?: number): Promise<void>;
export declare class WatcherService {
    private readonly git;
    private readonly db;
    private readonly getActivityMap?;
    private readonly events;
    private readonly watchers;
    constructor(git: GitCliService, db: DatabaseClient, getActivityMap?: (() => ReadonlyMap<string, number>) | undefined);
    watchProject(projectId: string, projectPath: string): void;
    unwatchProject(projectId: string): void;
    onGitStatusChanged(listener: (event: GitStatusChangedEvent) => void): void;
    private startWatcher;
    private handleChange;
}
export declare class ProjectService {
    private readonly db;
    private readonly git;
    private watcherService?;
    constructor(db: DatabaseClient, git: GitCliService);
    setWatcher(watcherService: WatcherService): void;
    ensureDefaultWorkspace(): void;
    renameWorkspace(payload: RenameWorkspacePayload): Promise<void>;
    removeProject(projectId: ProjectId): Promise<void>;
    getProjectById(projectId: ProjectId): Promise<ProjectRecord>;
    getProjectConfig(projectId: ProjectId): Promise<LoadedProjectConfig>;
    importProject(projectPath: string, workspaceId?: string): Promise<ProjectImportResult>;
    getProjectLayout(projectId: ProjectId): Promise<ProjectLayoutRecord>;
    saveProjectLayout(payload: SaveProjectLayoutPayload): Promise<ProjectLayoutRecord>;
    listActiveAgents(): Promise<ActiveAgentView[]>;
    getSnapshot(): Promise<WorkspaceSnapshot>;
    openIde(payload: IdeOpenPayload): Promise<void>;
    saveGitHubConfig(projectId: ProjectId, github: ProjectGitHubConfig | null): Promise<LoadedProjectConfig>;
}
export declare class TerminalService {
    private readonly db;
    private readonly projectService;
    private readonly terminalManager;
    private readonly auditService?;
    private readonly events;
    private readonly lastActivityAt;
    private readonly inputBuffers;
    constructor(db: DatabaseClient, projectService: ProjectService, terminalManager: TerminalManager, auditService?: AuditService | undefined);
    private syncProjectLayoutAfterSessionExit;
    createSession(payload: TerminalCreatePayload): Promise<TerminalSessionRecord>;
    restart(payload: TerminalRestartPayload): Promise<TerminalSessionRecord>;
    write(payload: TerminalInputPayload): Promise<void>;
    resize(payload: TerminalResizePayload): Promise<void>;
    terminate(sessionId: string): Promise<void>;
    getOutput(sessionId: string): Promise<TerminalChunkRecord[]>;
    getLastActivityMap(): ReadonlyMap<string, number>;
    onOutput(listener: (event: {
        sessionId: string;
        chunk: TerminalChunkRecord;
    }) => void): void;
    onExit(listener: (event: {
        sessionId: string;
        exitCode: number;
    }) => void): void;
    onStateChange(listener: (event: {
        sessionId: string;
        state: TerminalLifecycleState;
    }) => void): void;
}
export declare class GitServiceFacade {
    private readonly db;
    private readonly git;
    constructor(db: DatabaseClient, git: GitCliService);
    private projectPath;
    getStatus(projectId: string): Promise<GitStatusGroup[]>;
    stage(payload: GitFilePayload): Promise<GitStatusGroup[]>;
    unstage(payload: GitFilePayload): Promise<GitStatusGroup[]>;
    getDiff(payload: DiffRequestPayload): Promise<DiffPreview>;
    getHistory(payload: GitFilePayload): Promise<FileHistoryEntry[]>;
    getCommitDiff(payload: GitCommitDiffPayload): Promise<DiffPreview>;
    addToGitIgnore(payload: GitFilePayload): Promise<void>;
    commit(payload: GitCommitPayload): Promise<GitStatusGroup[]>;
    getStagedDiff(projectId: string): Promise<string>;
}
export declare class AuditService {
    private readonly db;
    private readonly events;
    constructor(db: DatabaseClient);
    listEvents(projectId: ProjectId): Promise<AuditEvent[]>;
    record(sessionId: string, projectId: string, command: string): void;
    onAuditEvent(listener: (event: AuditEventDetectedEvent) => void): void;
}
export declare class GitHubDispatcher {
    private readonly db;
    private readonly projectService;
    private readonly terminalService;
    private readonly events;
    private readonly githubService;
    private readonly inFlight;
    constructor(db: DatabaseClient, projectService: ProjectService, terminalService: TerminalService);
    private dispatchKey;
    private getProjectGitHubConfig;
    private executeDispatch;
    startWatchingProject(projectId: ProjectId, config: ProjectGitHubConfig): void;
    stopWatchingProject(projectId: ProjectId): void;
    listIssues(projectId: ProjectId): Promise<GitHubIssue[]>;
    dispatchIssue(projectId: ProjectId, issueNumber: number): Promise<IssueDispatchEvent>;
    listDispatched(projectId: ProjectId): GitHubIssueRecord[];
    onIssueDispatched(listener: (event: IssueDispatchEvent) => void): void;
}
export declare function createCoreServices(databaseFile: string): CoreServices;
