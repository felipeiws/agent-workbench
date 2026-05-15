export type WorkspaceId = string;
export type ProjectId = string;
export type TerminalSessionId = string;

export type TerminalLifecycleState =
  | "running"
  | "waiting-input"
  | "completed"
  | "failed";

export type SafeMode = "off" | "audit" | "protect";

export type TerminalKind = "agent" | "shell" | "task";

export interface Workspace {
  id: WorkspaceId;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: ProjectId;
  workspaceId: WorkspaceId;
  name: string;
  path: string;
  safeMode: SafeMode;
  ideCommand: string;
  configPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectIdeConfig {
  command: string;
}

export interface ProjectTerminalTemplate {
  name: string;
  type: TerminalKind;
  command: string;
}

export interface ProjectConfig {
  project: string;
  safeMode: SafeMode;
  ide: ProjectIdeConfig;
  terminals: ProjectTerminalTemplate[];
}

export interface LoadedProjectConfig {
  path: string;
  source: "file" | "defaults";
  config: ProjectConfig;
}

export interface TerminalSessionRecord {
  id: TerminalSessionId;
  projectId: ProjectId;
  name: string;
  command: string;
  cwd: string;
  state: TerminalLifecycleState;
  startedAt: string;
  completedAt: string | null;
  exitCode: number | null;
}

export interface TerminalChunkRecord {
  id: string;
  sessionId: TerminalSessionId;
  stream: "stdout" | "stderr" | "system";
  content: string;
  createdAt: string;
}

export interface GitFileChange {
  path: string;
  previousPath?: string;
  status: "staged" | "modified" | "untracked" | "deleted" | "renamed" | "conflicted";
}

export interface GitStatusGroup {
  label: string;
  items: GitFileChange[];
}

export interface FileHistoryEntry {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface DiffPreview {
  mode: "side-by-side" | "inline";
  filePath: string;
  original: string[];
  updated: string[];
}

export interface AgentSuspicion {
  label: "Multi-agent";
  suspectedSource: string[];
  confidence: number;
}

export interface ActiveAgentView {
  sessionId: TerminalSessionId;
  projectId: ProjectId;
  projectName: string;
  terminalName: string;
  state: TerminalLifecycleState;
  startedAt: string;
}

export interface ProjectSnapshot {
  project: ProjectRecord;
  config: LoadedProjectConfig;
  git: {
    groups: GitStatusGroup[];
    diff: DiffPreview;
    history: FileHistoryEntry[];
    suspicion: AgentSuspicion | null;
  };
  sessions: TerminalSessionRecord[];
}

export interface WorkspaceSnapshot {
  workspaces: Workspace[];
  projects: ProjectSnapshot[];
  activeAgents: ActiveAgentView[];
}
