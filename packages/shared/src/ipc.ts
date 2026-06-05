import type {
  ActiveAgentView,
  AgentSuspicion,
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
  ProjectImportResult,
  ProjectId,
  ProjectLayoutRecord,
  ProjectRecord,
  TaskLoopAgent,
  TaskLoopDefinition,
  TaskLoopRecord,
  TaskLoopStatus,
  TaskLoopTaskRecord,
  TaskLoopTaskStatus,
  TerminalChunkRecord,
  TerminalLifecycleState,
  TerminalSessionId,
  TerminalSessionRecord,
  WorkspaceSnapshot
} from "../../types/src/index";

export type { AppSettings };

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

export interface OpenFileInEditorPayload {
  projectId: ProjectId;
  filePath: string;
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

export interface TaskLoopImportPayload {
  projectId: ProjectId;
}

export interface TaskLoopStartPayload {
  projectId: ProjectId;
  agent: TaskLoopAgent;
  definition: TaskLoopDefinition;
}

export interface TaskLoopIdPayload {
  loopId: string;
}

export interface TaskLoopResumePayload extends TaskLoopIdPayload {
  agent?: TaskLoopAgent;
}

export interface TaskLoopListPayload {
  projectId: ProjectId;
}

export interface TaskLoopProgressEvent {
  loopId: string;
  projectId: ProjectId;
  status: TaskLoopStatus;
  currentTaskIndex: number;
  taskStatus: TaskLoopTaskStatus;
}

export interface SaveProjectLayoutPayload {
  projectId: ProjectId;
  activeSessionId: TerminalSessionId | null;
  terminalMode: ProjectLayoutRecord["terminalMode"];
  diffMode: ProjectLayoutRecord["diffMode"];
  selectedFilePath: string | null;
}

export interface AiTerminalCreatePayload {
  projectId: ProjectId;
  name: string;
  provider: "claude" | "codex";
}

export interface AiTerminalSendPayload {
  sessionId: string;
  command: string;
}

export interface AiTerminalResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface AiTerminalQueryPayload {
  sessionId: string;
  prompt: string;
  provider: "claude" | "codex";
}

export interface AiTerminalQueryResult {
  command: string;
  explanation: string;
}

export interface AiTerminalBlockStartEvent {
  sessionId: string;
  block: CommandBlock;
}

export interface AiTerminalBlockChunkEvent {
  sessionId: string;
  blockId: string;
  chunk: string;
}

export interface AiTerminalBlockEndEvent {
  sessionId: string;
  blockId: string;
  exitCode: number;
  cwd: string;
  completedAt: string;
}

export interface AiTerminalPromptEvent {
  sessionId: string;
  cwd: string;
  exitCode: number;
}

export interface AiTerminalSessionExitEvent {
  sessionId: string;
}

export interface AppUpdateStatus {
  version: string;
  executablePath: string;
  canInstallUpdate: boolean;
  reason: string | null;
}

export interface ManualUpdateInstallResult {
  version: string;
  executablePath: string;
  sourcePath: string;
  replacedAt: string;
}

export interface AppIpcApi {
  app: {
    getSnapshot: () => Promise<WorkspaceSnapshot>;
    getUpdateStatus: () => Promise<AppUpdateStatus>;
    installManualUpdate: () => Promise<ManualUpdateInstallResult | null>;
    relaunch: () => Promise<void>;
    getSettings: () => Promise<AppSettings>;
    saveSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
    testApiKey: () => Promise<{ ok: boolean; keyPreview: string; keyLength: number; error?: string }>;
  };
  taskloop: {
    import: (payload: TaskLoopImportPayload) => Promise<TaskLoopDefinition | null>;
    start: (payload: TaskLoopStartPayload) => Promise<TaskLoopRecord>;
    pause: (payload: TaskLoopIdPayload) => Promise<void>;
    resume: (payload: TaskLoopResumePayload) => Promise<void>;
    stop: (payload: TaskLoopIdPayload) => Promise<void>;
    delete: (payload: TaskLoopIdPayload) => Promise<void>;
    list: (payload: TaskLoopListPayload) => Promise<TaskLoopRecord[]>;
    getTasks: (loopId: string) => Promise<TaskLoopTaskRecord[]>;
  };
  aiTerminal: {
    create: (payload: AiTerminalCreatePayload) => Promise<AiTerminalSessionRecord>;
    send: (payload: AiTerminalSendPayload) => Promise<CommandBlock | null>;
    resize: (payload: AiTerminalResizePayload) => Promise<void>;
    terminate: (sessionId: string) => Promise<void>;
    getBlocks: (sessionId: string) => Promise<CommandBlock[]>;
    listSessions: (projectId: ProjectId) => Promise<AiTerminalSessionRecord[]>;
    query: (payload: AiTerminalQueryPayload) => Promise<AiTerminalQueryResult>;
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
    openFileInEditor: (payload: OpenFileInEditorPayload) => Promise<void>;
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
    push: (projectId: ProjectId) => Promise<void>;
    generateCommitMessage: (projectId: ProjectId) => Promise<string>;
  };
}

export const ipcChannels = {
  appSnapshot: "app:get-snapshot",
  appUpdateStatus: "app:get-update-status",
  appInstallManualUpdate: "app:install-manual-update",
  appRelaunch: "app:relaunch",
  appGetSettings: "app:get-settings",
  appSaveSettings: "app:save-settings",
  appTestApiKey: "app:test-api-key",
  auditListEvents: "audit:list-events",
  auditEventDetectedEvent: "audit:event-detected",
  terminalCreate: "terminals:create",
  terminalWrite: "terminals:write",
  terminalResize: "terminals:resize",
  terminalRestart: "terminals:restart",
  terminalTerminate: "terminals:terminate",
  terminalOutput: "terminals:get-output",
  projectConfig: "projects:get-config",
  projectLayout: "projects:get-layout",
  projectSaveLayout: "projects:save-layout",
  projectImport: "projects:import",
  projectOpenIde: "projects:open-ide",
  projectOpenFileInEditor: "projects:open-file-in-editor",
  projectActiveAgents: "projects:list-active-agents",
  gitStatus: "git:get-status",
  gitStage: "git:stage",
  gitUnstage: "git:unstage",
  gitDiff: "git:get-diff",
  gitHistory: "git:get-history",
  gitCommitDiff: "git:get-commit-diff",
  gitIgnoreAdd: "git:ignore-add",
  gitCommit: "git:commit",
  gitPush: "git:push",
  gitGenerateCommitMessage: "git:generate-commit-message",
  githubListIssues: "github:list-issues",
  githubDispatchIssue: "github:dispatch-issue",
  githubListDispatched: "github:list-dispatched",
  projectSaveGitHubConfig: "projects:save-github-config",
  workspaceRename: "workspaces:rename",
  projectRemove: "projects:remove",
  terminalOutputEvent: "terminals:output",
  terminalExitEvent: "terminals:exit",
  terminalStateChangeEvent: "terminals:state-change",
  gitStatusChangedEvent: "git:status-changed",
  githubIssueDispatchedEvent: "github:issue-dispatched",
  systemStatsEvent: "system:stats",
  taskloopImport: "taskloop:import",
  taskloopStart: "taskloop:start",
  taskloopPause: "taskloop:pause",
  taskloopResume: "taskloop:resume",
  taskloopStop: "taskloop:stop",
  taskloopDelete: "taskloop:delete",
  taskloopList: "taskloop:list",
  taskloopGetTasks: "taskloop:get-tasks",
  taskloopProgressEvent: "taskloop:progress",
  aiTerminalCreate: "ai-terminal:create",
  aiTerminalSend: "ai-terminal:send",
  aiTerminalResize: "ai-terminal:resize",
  aiTerminalTerminate: "ai-terminal:terminate",
  aiTerminalGetBlocks: "ai-terminal:get-blocks",
  aiTerminalListSessions: "ai-terminal:list-sessions",
  aiTerminalQuery: "ai-terminal:query",
  aiTerminalBlockStartEvent: "ai-terminal:block-start",
  aiTerminalBlockChunkEvent: "ai-terminal:block-chunk",
  aiTerminalBlockEndEvent: "ai-terminal:block-end",
  aiTerminalPromptEvent: "ai-terminal:prompt",
  aiTerminalExitEvent: "ai-terminal:exit",
  tokenStatsEvent: "token:stats"
} as const;

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

export interface TokenProviderStats {
  provider: "claude" | "codex";
  used5h: number;
  usedWeekly: number;
  limit5h: number;
  limitWeekly: number;
  nextReset5hMs: number;
  nextResetWeeklyMs: number;
  /** Direct percentage from CLI (0-100). When present, use instead of used/limit ratio. */
  pct5h?: number;
  pctWeekly?: number;
}

export interface TokenStatsEvent {
  claude: TokenProviderStats;
  codex: TokenProviderStats;
}

export interface AgentWorkbenchWindow {
  agentWorkbench: AppIpcApi & {
    onTerminalOutput: (
      listener: (event: TerminalOutputEvent) => void
    ) => () => void;
    onTerminalExit: (listener: (event: TerminalExitEvent) => void) => () => void;
    onTerminalStateChange: (
      listener: (event: TerminalStateChangeEvent) => void
    ) => () => void;
    onGitStatusChanged: (
      listener: (event: GitStatusChangedEvent) => void
    ) => () => void;
    onAuditEventDetected: (
      listener: (event: AuditEventDetectedEvent) => void
    ) => () => void;
    onGithubIssueDispatched: (
      listener: (event: IssueDispatchEvent) => void
    ) => () => void;
    onSystemStats: (
      listener: (event: SystemStatsEvent) => void
    ) => () => void;
    onTaskLoopProgress: (
      listener: (event: TaskLoopProgressEvent) => void
    ) => () => void;
    onAiTerminalBlockStart: (
      listener: (event: AiTerminalBlockStartEvent) => void
    ) => () => void;
    onAiTerminalBlockChunk: (
      listener: (event: AiTerminalBlockChunkEvent) => void
    ) => () => void;
    onAiTerminalBlockEnd: (
      listener: (event: AiTerminalBlockEndEvent) => void
    ) => () => void;
    onAiTerminalPrompt: (
      listener: (event: AiTerminalPromptEvent) => void
    ) => () => void;
    onAiTerminalExit: (
      listener: (event: AiTerminalSessionExitEvent) => void
    ) => () => void;
    onTokenStats: (listener: (event: TokenStatsEvent) => void) => () => void;
  };
}

export type IpcRequestMap = {
  'app:get-snapshot': [undefined, WorkspaceSnapshot];
  'app:get-update-status': [undefined, AppUpdateStatus];
  'app:install-manual-update': [undefined, ManualUpdateInstallResult | null];
  'app:relaunch': [undefined, void];
  'app:get-settings': [undefined, AppSettings];
  'app:save-settings': [Partial<AppSettings>, AppSettings];
  'app:test-api-key': [undefined, { ok: boolean; keyPreview: string; keyLength: number; error?: string }];
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
  'projects:open-file-in-editor': [OpenFileInEditorPayload, void];
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
  'git:push': [ProjectId, void];
  'git:generate-commit-message': [ProjectId, string];
  'github:list-issues': [GitHubListIssuesPayload, GitHubIssue[]];
  'github:dispatch-issue': [GitHubDispatchIssuePayload, IssueDispatchEvent];
  'github:list-dispatched': [GitHubListDispatchedPayload, GitHubIssueRecord[]];
  'projects:save-github-config': [SaveProjectGitHubConfigPayload, LoadedProjectConfig];
  'taskloop:import': [TaskLoopImportPayload, TaskLoopDefinition | null];
  'taskloop:start': [TaskLoopStartPayload, TaskLoopRecord];
  'taskloop:pause': [TaskLoopIdPayload, void];
  'taskloop:resume': [TaskLoopResumePayload, void];
  'taskloop:stop': [TaskLoopIdPayload, void];
  'taskloop:delete': [TaskLoopIdPayload, void];
  'taskloop:list': [TaskLoopListPayload, TaskLoopRecord[]];
  'taskloop:get-tasks': [string, TaskLoopTaskRecord[]];
  'ai-terminal:create': [AiTerminalCreatePayload, AiTerminalSessionRecord];
  'ai-terminal:send': [AiTerminalSendPayload, CommandBlock | null];
  'ai-terminal:resize': [AiTerminalResizePayload, void];
  'ai-terminal:terminate': [string, void];
  'ai-terminal:get-blocks': [string, CommandBlock[]];
  'ai-terminal:list-sessions': [ProjectId, AiTerminalSessionRecord[]];
  'ai-terminal:query': [AiTerminalQueryPayload, AiTerminalQueryResult];
};

export type IpcEventMap = {
  'terminals:output': TerminalOutputEvent;
  'terminals:exit': TerminalExitEvent;
  'terminals:state-change': TerminalStateChangeEvent;
  'git:status-changed': GitStatusChangedEvent;
  'audit:event-detected': AuditEventDetectedEvent;
  'github:issue-dispatched': IssueDispatchEvent;
  'system:stats': SystemStatsEvent;
  'taskloop:progress': TaskLoopProgressEvent;
  'ai-terminal:block-start': AiTerminalBlockStartEvent;
  'ai-terminal:block-chunk': AiTerminalBlockChunkEvent;
  'ai-terminal:block-end': AiTerminalBlockEndEvent;
  'ai-terminal:prompt': AiTerminalPromptEvent;
  'ai-terminal:exit': AiTerminalSessionExitEvent;
  'token:stats': TokenStatsEvent;
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
  settingsService: {
    getSettings: () => AppSettings;
    saveSettings: (settings: Partial<AppSettings>) => AppSettings;
  };
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
    saveProjectLayout: (
      payload: SaveProjectLayoutPayload
    ) => Promise<ProjectLayoutRecord>;
    importProject: (
      projectPath: string,
      workspaceId?: string
    ) => Promise<ProjectImportResult>;
    openIde: (payload: IdeOpenPayload) => Promise<void>;
    openFileInEditor: (projectId: ProjectId, filePath: string, editorCommand: string, line?: number) => Promise<void>;
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
    push: (projectId: ProjectId, token?: string) => Promise<void>;
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
  taskLoopService: {
    start: (projectId: ProjectId, agent: TaskLoopAgent, definition: TaskLoopDefinition) => Promise<TaskLoopRecord>;
    pause: (loopId: string) => void;
    resume: (loopId: string, agent?: TaskLoopAgent) => Promise<void>;
    stop: (loopId: string) => Promise<void>;
    delete: (loopId: string) => Promise<void>;
    list: (projectId: ProjectId) => TaskLoopRecord[];
    getTasks: (loopId: string) => TaskLoopTaskRecord[];
    onProgress: (listener: (event: TaskLoopProgressEvent) => void) => void;
  };
  aiTerminalService: {
    create: (projectId: ProjectId, name: string, provider: "claude" | "codex") => AiTerminalSessionRecord;
    send: (sessionId: string, command: string) => CommandBlock | null;
    resize: (sessionId: string, cols: number, rows: number) => void;
    terminate: (sessionId: string) => void;
    getBlocks: (sessionId: string) => CommandBlock[];
    listSessions: (projectId: ProjectId) => AiTerminalSessionRecord[];
    onBlockStart: (listener: (event: AiTerminalBlockStartEvent) => void) => void;
    onBlockChunk: (listener: (event: AiTerminalBlockChunkEvent) => void) => void;
    onBlockEnd: (listener: (event: AiTerminalBlockEndEvent) => void) => void;
    onPrompt: (listener: (event: AiTerminalPromptEvent) => void) => void;
    onExit: (listener: (event: AiTerminalSessionExitEvent) => void) => void;
  };
}
