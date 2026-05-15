import type {
  ActiveAgentView,
  DiffPreview,
  FileHistoryEntry,
  GitStatusGroup,
  LoadedProjectConfig,
  ProjectId,
  ProjectRecord,
  TerminalChunkRecord,
  TerminalSessionId,
  TerminalSessionRecord,
  WorkspaceSnapshot
} from "../../types/src/index";

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

export interface IdeOpenPayload {
  projectId: ProjectId;
  filePath?: string;
}

export interface GitFilePayload {
  projectId: ProjectId;
  filePath: string;
}

export interface DiffRequestPayload extends GitFilePayload {
  mode: DiffPreview["mode"];
}

export interface ProjectConfigPayload {
  projectId: ProjectId;
}

export interface AppIpcApi {
  app: {
    getSnapshot: () => Promise<WorkspaceSnapshot>;
  };
  terminals: {
    create: (payload: TerminalCreatePayload) => Promise<TerminalSessionRecord>;
    write: (payload: TerminalInputPayload) => Promise<void>;
    resize: (payload: TerminalResizePayload) => Promise<void>;
    terminate: (sessionId: TerminalSessionId) => Promise<void>;
    getOutput: (sessionId: TerminalSessionId) => Promise<TerminalChunkRecord[]>;
  };
  projects: {
    getConfig: (payload: ProjectConfigPayload) => Promise<LoadedProjectConfig>;
    openIde: (payload: IdeOpenPayload) => Promise<void>;
    listActiveAgents: () => Promise<ActiveAgentView[]>;
  };
  git: {
    getStatus: (projectId: ProjectId) => Promise<GitStatusGroup[]>;
    stage: (payload: GitFilePayload) => Promise<GitStatusGroup[]>;
    unstage: (payload: GitFilePayload) => Promise<GitStatusGroup[]>;
    getDiff: (payload: DiffRequestPayload) => Promise<DiffPreview>;
    getHistory: (payload: GitFilePayload) => Promise<FileHistoryEntry[]>;
  };
}

export const ipcChannels = {
  appSnapshot: "app:get-snapshot",
  terminalCreate: "terminals:create",
  terminalWrite: "terminals:write",
  terminalResize: "terminals:resize",
  terminalTerminate: "terminals:terminate",
  terminalOutput: "terminals:get-output",
  projectConfig: "projects:get-config",
  projectOpenIde: "projects:open-ide",
  projectActiveAgents: "projects:list-active-agents",
  gitStatus: "git:get-status",
  gitStage: "git:stage",
  gitUnstage: "git:unstage",
  gitDiff: "git:get-diff",
  gitHistory: "git:get-history",
  terminalOutputEvent: "terminals:output",
  terminalExitEvent: "terminals:exit"
} as const;

export interface TerminalOutputEvent {
  sessionId: TerminalSessionId;
  chunk: TerminalChunkRecord;
}

export interface TerminalExitEvent {
  sessionId: TerminalSessionId;
  exitCode: number;
}

export interface AgentWorkbenchWindow {
  agentWorkbench: AppIpcApi & {
    onTerminalOutput: (
      listener: (event: TerminalOutputEvent) => void
    ) => () => void;
    onTerminalExit: (listener: (event: TerminalExitEvent) => void) => () => void;
  };
}

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
  projectService: {
    getSnapshot: () => Promise<WorkspaceSnapshot>;
    getProjectConfig: (projectId: ProjectId) => Promise<LoadedProjectConfig>;
    openIde: (payload: IdeOpenPayload) => Promise<void>;
    listActiveAgents: () => Promise<ActiveAgentView[]>;
    getProjectById: (projectId: ProjectId) => Promise<ProjectRecord>;
  };
  terminalService: {
    createSession: (payload: TerminalCreatePayload) => Promise<TerminalSessionRecord>;
    write: (payload: TerminalInputPayload) => Promise<void>;
    resize: (payload: TerminalResizePayload) => Promise<void>;
    terminate: (sessionId: TerminalSessionId) => Promise<void>;
    getOutput: (sessionId: TerminalSessionId) => Promise<TerminalChunkRecord[]>;
    onOutput: (listener: (event: TerminalOutputEvent) => void) => void;
    onExit: (listener: (event: TerminalExitEvent) => void) => void;
  };
  gitService: {
    getStatus: (projectId: ProjectId) => Promise<GitStatusGroup[]>;
    stage: (payload: GitFilePayload) => Promise<GitStatusGroup[]>;
    unstage: (payload: GitFilePayload) => Promise<GitStatusGroup[]>;
    getDiff: (payload: DiffRequestPayload) => Promise<DiffPreview>;
    getHistory: (payload: GitFilePayload) => Promise<FileHistoryEntry[]>;
  };
}
