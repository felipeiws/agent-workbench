import type { ActiveAgentView, AgentSuspicion, AuditEvent, DiffPreview, FileHistoryEntry, GitHubIssue, GitHubIssueRecord, GitStatusGroup, IssueDispatchEvent, LoadedProjectConfig, ProjectGitHubConfig, ProjectImportResult, ProjectId, ProjectLayoutRecord, ProjectRecord, TerminalChunkRecord, TerminalLifecycleState, TerminalSessionId, TerminalSessionRecord, WorkspaceSnapshot } from "../../types/src/index";
export interface TerminalCreatePayload {
    projectId: ProjectId;
    name: string;
    command: string;
}
export interface TerminalInputPayload {
    sessionId: TerminalSessionId;
    input: string;
}
export interface TerminalResizePayload {
    sessionId: TerminalSessionId;
    cols: number;
    rows: number;
}
export interface TerminalRestartPayload {
    sessionId: TerminalSessionId;
}
export interface IdeOpenPayload {
    projectId: ProjectId;
    filePath?: string;
    line?: number;
}
export interface GitFilePayload {
    projectId: ProjectId;
    filePath: string;
}
export interface DiffRequestPayload extends GitFilePayload {
    mode: DiffPreview["mode"];
    staged?: boolean;
}
export interface GitCommitPayload {
    projectId: ProjectId;
    message: string;
}
export interface GitCommitDiffPayload {
    projectId: ProjectId;
    commitHash: string;
    filePath: string;
    mode: DiffPreview["mode"];
}
export interface ProjectConfigPayload {
    projectId: ProjectId;
}
export interface ProjectLayoutPayload {
    projectId: ProjectId;
}
export interface ImportProjectPayload {
    workspaceId?: string;
}
export interface RenameWorkspacePayload {
    workspaceId: string;
    name: string;
}
export interface GitHubListIssuesPayload {
    projectId: ProjectId;
}
export interface GitHubDispatchIssuePayload {
    projectId: ProjectId;
    issueNumber: number;
}
export interface GitHubListDispatchedPayload {
    projectId: ProjectId;
}
export interface SaveProjectGitHubConfigPayload {
    projectId: ProjectId;
    github: ProjectGitHubConfig | null;
}
export interface SaveProjectLayoutPayload {
    projectId: ProjectId;
    activeSessionId: TerminalSessionId | null;
    terminalMode: ProjectLayoutRecord["terminalMode"];
    diffMode: ProjectLayoutRecord["diffMode"];
    selectedFilePath: string | null;
}
export interface AppIpcApi {
    app: {
        getSnapshot: () => Promise<WorkspaceSnapshot>;
    };
    github: {
        listIssues: (payload: GitHubListIssuesPayload) => Promise<GitHubIssue[]>;
        dispatchIssue: (payload: GitHubDispatchIssuePayload) => Promise<IssueDispatchEvent>;
        listDispatched: (payload: GitHubListDispatchedPayload) => Promise<GitHubIssueRecord[]>;
        saveConfig: (payload: SaveProjectGitHubConfigPayload) => Promise<LoadedProjectConfig>;
    };
    audit: {
        listEvents: (projectId: ProjectId) => Promise<AuditEvent[]>;
    };
    workspaces: {
        rename: (payload: RenameWorkspacePayload) => Promise<void>;
    };
    terminals: {
        create: (payload: TerminalCreatePayload) => Promise<TerminalSessionRecord>;
        write: (payload: TerminalInputPayload) => Promise<void>;
        resize: (payload: TerminalResizePayload) => Promise<void>;
        restart: (payload: TerminalRestartPayload) => Promise<TerminalSessionRecord>;
        terminate: (sessionId: TerminalSessionId) => Promise<void>;
        getOutput: (sessionId: TerminalSessionId) => Promise<TerminalChunkRecord[]>;
    };
    projects: {
        getConfig: (payload: ProjectConfigPayload) => Promise<LoadedProjectConfig>;
        getLayout: (payload: ProjectLayoutPayload) => Promise<ProjectLayoutRecord>;
        saveLayout: (payload: SaveProjectLayoutPayload) => Promise<ProjectLayoutRecord>;
        importProject: (payload: ImportProjectPayload) => Promise<ProjectImportResult>;
        removeProject: (projectId: ProjectId) => Promise<void>;
        openIde: (payload: IdeOpenPayload) => Promise<void>;
        listActiveAgents: () => Promise<ActiveAgentView[]>;
    };
    git: {
        getStatus: (projectId: ProjectId) => Promise<GitStatusGroup[]>;
        stage: (payload: GitFilePayload) => Promise<GitStatusGroup[]>;
        unstage: (payload: GitFilePayload) => Promise<GitStatusGroup[]>;
        getDiff: (payload: DiffRequestPayload) => Promise<DiffPreview>;
        getHistory: (payload: GitFilePayload) => Promise<FileHistoryEntry[]>;
        getCommitDiff: (payload: GitCommitDiffPayload) => Promise<DiffPreview>;
        addToGitIgnore: (payload: GitFilePayload) => Promise<void>;
        commit: (payload: GitCommitPayload) => Promise<GitStatusGroup[]>;
        generateCommitMessage: (projectId: ProjectId) => Promise<string>;
    };
}
export declare const ipcChannels: {
    readonly appSnapshot: "app:get-snapshot";
    readonly auditListEvents: "audit:list-events";
    readonly auditEventDetectedEvent: "audit:event-detected";
    readonly terminalCreate: "terminals:create";
    readonly terminalWrite: "terminals:write";
    readonly terminalResize: "terminals:resize";
    readonly terminalRestart: "terminals:restart";
    readonly terminalTerminate: "terminals:terminate";
    readonly terminalOutput: "terminals:get-output";
    readonly projectConfig: "projects:get-config";
    readonly projectLayout: "projects:get-layout";
    readonly projectSaveLayout: "projects:save-layout";
    readonly projectImport: "projects:import";
    readonly projectOpenIde: "projects:open-ide";
    readonly projectActiveAgents: "projects:list-active-agents";
    readonly gitStatus: "git:get-status";
    readonly gitStage: "git:stage";
    readonly gitUnstage: "git:unstage";
    readonly gitDiff: "git:get-diff";
    readonly gitHistory: "git:get-history";
    readonly gitCommitDiff: "git:get-commit-diff";
    readonly gitIgnoreAdd: "git:ignore-add";
    readonly gitCommit: "git:commit";
    readonly gitGenerateCommitMessage: "git:generate-commit-message";
    readonly githubListIssues: "github:list-issues";
    readonly githubDispatchIssue: "github:dispatch-issue";
    readonly githubListDispatched: "github:list-dispatched";
    readonly projectSaveGitHubConfig: "projects:save-github-config";
    readonly workspaceRename: "workspaces:rename";
    readonly projectRemove: "projects:remove";
    readonly terminalOutputEvent: "terminals:output";
    readonly terminalExitEvent: "terminals:exit";
    readonly terminalStateChangeEvent: "terminals:state-change";
    readonly gitStatusChangedEvent: "git:status-changed";
    readonly githubIssueDispatchedEvent: "github:issue-dispatched";
    readonly systemStatsEvent: "system:stats";
};
export interface TerminalOutputEvent {
    sessionId: TerminalSessionId;
    chunk: TerminalChunkRecord;
}
export interface TerminalExitEvent {
    sessionId: TerminalSessionId;
    exitCode: number;
}
export interface TerminalStateChangeEvent {
    sessionId: TerminalSessionId;
    state: TerminalLifecycleState;
}
export interface GitStatusChangedEvent {
    projectId: ProjectId;
    groups: GitStatusGroup[];
    suspicion: AgentSuspicion | null;
}
export interface AuditEventDetectedEvent {
    projectId: ProjectId;
    event: AuditEvent;
}
export interface SystemStatsEvent {
    cpuPercent: number;
    memUsedMb: number;
    memTotalMb: number;
}
export interface AgentWorkbenchWindow {
    agentWorkbench: AppIpcApi & {
        onTerminalOutput: (listener: (event: TerminalOutputEvent) => void) => () => void;
        onTerminalExit: (listener: (event: TerminalExitEvent) => void) => () => void;
        onTerminalStateChange: (listener: (event: TerminalStateChangeEvent) => void) => () => void;
        onGitStatusChanged: (listener: (event: GitStatusChangedEvent) => void) => () => void;
        onAuditEventDetected: (listener: (event: AuditEventDetectedEvent) => void) => () => void;
        onGithubIssueDispatched: (listener: (event: IssueDispatchEvent) => void) => () => void;
        onSystemStats: (listener: (event: SystemStatsEvent) => void) => () => void;
    };
}
export type IpcRequestMap = {
    'app:get-snapshot': [undefined, WorkspaceSnapshot];
    'audit:list-events': [ProjectId, AuditEvent[]];
    'workspaces:rename': [RenameWorkspacePayload, void];
    'terminals:create': [TerminalCreatePayload, TerminalSessionRecord];
    'terminals:write': [TerminalInputPayload, void];
    'terminals:resize': [TerminalResizePayload, void];
    'terminals:restart': [TerminalRestartPayload, TerminalSessionRecord];
    'terminals:terminate': [TerminalSessionId, void];
    'terminals:get-output': [TerminalSessionId, TerminalChunkRecord[]];
    'projects:get-config': [ProjectConfigPayload, LoadedProjectConfig];
    'projects:get-layout': [ProjectLayoutPayload, ProjectLayoutRecord];
    'projects:save-layout': [SaveProjectLayoutPayload, ProjectLayoutRecord];
    'projects:import': [ImportProjectPayload, ProjectImportResult];
    'projects:open-ide': [IdeOpenPayload, void];
    'projects:list-active-agents': [undefined, ActiveAgentView[]];
    'projects:remove': [ProjectId, void];
    'git:get-status': [ProjectId, GitStatusGroup[]];
    'git:stage': [GitFilePayload, GitStatusGroup[]];
    'git:unstage': [GitFilePayload, GitStatusGroup[]];
    'git:get-diff': [DiffRequestPayload, DiffPreview];
    'git:get-history': [GitFilePayload, FileHistoryEntry[]];
    'git:get-commit-diff': [GitCommitDiffPayload, DiffPreview];
    'git:ignore-add': [GitFilePayload, void];
    'git:commit': [GitCommitPayload, GitStatusGroup[]];
    'git:generate-commit-message': [ProjectId, string];
    'github:list-issues': [GitHubListIssuesPayload, GitHubIssue[]];
    'github:dispatch-issue': [GitHubDispatchIssuePayload, IssueDispatchEvent];
    'github:list-dispatched': [GitHubListDispatchedPayload, GitHubIssueRecord[]];
    'projects:save-github-config': [SaveProjectGitHubConfigPayload, LoadedProjectConfig];
};
export type IpcEventMap = {
    'terminals:output': TerminalOutputEvent;
    'terminals:exit': TerminalExitEvent;
    'terminals:state-change': TerminalStateChangeEvent;
    'git:status-changed': GitStatusChangedEvent;
    'audit:event-detected': AuditEventDetectedEvent;
    'github:issue-dispatched': IssueDispatchEvent;
    'system:stats': SystemStatsEvent;
};
export interface SeedProjectDefinition {
    workspaceName: string;
    name: string;
    path: string;
    ideCommand: string;
}
export interface SeedData {
    workspaces: string[];
    projects: SeedProjectDefinition[];
}
export interface CoreServices {
    auditService: {
        listEvents: (projectId: ProjectId) => Promise<AuditEvent[]>;
        onAuditEvent: (listener: (event: AuditEventDetectedEvent) => void) => void;
    };
    projectService: {
        renameWorkspace: (payload: RenameWorkspacePayload) => Promise<void>;
        removeProject: (projectId: ProjectId) => Promise<void>;
        getSnapshot: () => Promise<WorkspaceSnapshot>;
        getProjectConfig: (projectId: ProjectId) => Promise<LoadedProjectConfig>;
        getProjectLayout: (projectId: ProjectId) => Promise<ProjectLayoutRecord>;
        saveProjectLayout: (payload: SaveProjectLayoutPayload) => Promise<ProjectLayoutRecord>;
        importProject: (projectPath: string, workspaceId?: string) => Promise<ProjectImportResult>;
        openIde: (payload: IdeOpenPayload) => Promise<void>;
        listActiveAgents: () => Promise<ActiveAgentView[]>;
        getProjectById: (projectId: ProjectId) => Promise<ProjectRecord>;
        saveGitHubConfig: (projectId: ProjectId, github: ProjectGitHubConfig | null) => Promise<LoadedProjectConfig>;
    };
    terminalService: {
        createSession: (payload: TerminalCreatePayload) => Promise<TerminalSessionRecord>;
        write: (payload: TerminalInputPayload) => Promise<void>;
        resize: (payload: TerminalResizePayload) => Promise<void>;
        restart: (payload: TerminalRestartPayload) => Promise<TerminalSessionRecord>;
        terminate: (sessionId: TerminalSessionId) => Promise<void>;
        getOutput: (sessionId: TerminalSessionId) => Promise<TerminalChunkRecord[]>;
        onOutput: (listener: (event: TerminalOutputEvent) => void) => void;
        onExit: (listener: (event: TerminalExitEvent) => void) => void;
        onStateChange: (listener: (event: TerminalStateChangeEvent) => void) => void;
    };
    gitService: {
        getStatus: (projectId: ProjectId) => Promise<GitStatusGroup[]>;
        stage: (payload: GitFilePayload) => Promise<GitStatusGroup[]>;
        unstage: (payload: GitFilePayload) => Promise<GitStatusGroup[]>;
        getDiff: (payload: DiffRequestPayload) => Promise<DiffPreview>;
        getHistory: (payload: GitFilePayload) => Promise<FileHistoryEntry[]>;
        getCommitDiff: (payload: GitCommitDiffPayload) => Promise<DiffPreview>;
        addToGitIgnore: (payload: GitFilePayload) => Promise<void>;
        commit: (payload: GitCommitPayload) => Promise<GitStatusGroup[]>;
        getStagedDiff: (projectId: ProjectId) => Promise<string>;
    };
    watcherService: {
        watchProject: (projectId: ProjectId, projectPath: string) => void;
        unwatchProject: (projectId: ProjectId) => void;
        onGitStatusChanged: (listener: (event: GitStatusChangedEvent) => void) => void;
    };
    githubService: {
        startWatchingProject: (projectId: ProjectId, config: ProjectGitHubConfig) => void;
        stopWatchingProject: (projectId: ProjectId) => void;
        listIssues: (projectId: ProjectId) => Promise<GitHubIssue[]>;
        dispatchIssue: (projectId: ProjectId, issueNumber: number) => Promise<IssueDispatchEvent>;
        listDispatched: (projectId: ProjectId) => GitHubIssueRecord[];
        onIssueDispatched: (listener: (event: IssueDispatchEvent) => void) => void;
    };
}
