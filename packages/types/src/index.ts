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
export type TerminalPanelMode = "focus" | "grid";

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

export interface ProjectGitHubConfig {
  owner: string;
  repo: string;
  watchIssues: boolean;
  labels: string[];
  pollIntervalMs?: number;
  agentCommand?: string;
}

export interface ProjectConfig {
  project: string;
  safeMode: SafeMode;
  ide: ProjectIdeConfig;
  terminals: ProjectTerminalTemplate[];
  github?: ProjectGitHubConfig;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  labels: string[];
  url: string;
}

export interface GitHubIssueRecord {
  id: string;
  projectId: string;
  issueNumber: number;
  title: string;
  dispatchedAt: string;
  sessionId: string | null;
}

export interface IssueDispatchEvent {
  projectId: ProjectId;
  issue: GitHubIssue;
  sessionId: string;
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

export interface ProjectLayoutRecord {
  projectId: ProjectId;
  activeSessionId: TerminalSessionId | null;
  terminalMode: TerminalPanelMode;
  diffMode: DiffPreview["mode"];
  selectedFilePath: string | null;
  updatedAt: string;
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

export interface DiffLine {
  type: "context" | "add" | "remove";
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

export interface DiffPreview {
  mode: "side-by-side" | "inline";
  filePath: string;
  lines: DiffLine[];
  isNewFile?: boolean;
  isBinary?: boolean;
  isImage?: boolean;
  isTruncated?: boolean;
  totalLines?: number;
}

export interface AgentSuspicion {
  label: "Multi-agent";
  suspectedSource: string[];
  confidence: number;
}

export type AuditRisk = "low" | "medium" | "high";

export interface AuditEvent {
  id: string;
  sessionId: TerminalSessionId;
  projectId: ProjectId;
  command: string;
  risk: AuditRisk;
  reason: string;
  detectedAt: string;
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
  layout: ProjectLayoutRecord;
  config: LoadedProjectConfig;
  git: {
    groups: GitStatusGroup[];
    suspicion: AgentSuspicion | null;
  };
  sessions: TerminalSessionRecord[];
}

export interface WorkspaceSnapshot {
  workspaces: Workspace[];
  projects: ProjectSnapshot[];
  activeAgents: ActiveAgentView[];
}

export type ProjectImportResult =
  | {
      status: "cancelled";
    }
  | {
      status: "imported";
      projectId: ProjectId;
      workspaceId: WorkspaceId;
    }
  | {
      status: "error";
      message: string;
    };

export interface CommandBlock {
  id: string;
  sessionId: string;
  command: string;
  cwd: string;
  output: string;
  exitCode: number | null;
  startedAt: string;
  completedAt: string | null;
  isRunning: boolean;
}

export interface AiTerminalSessionRecord {
  id: string;
  projectId: string;
  name: string;
  cwd: string;
  provider: "claude" | "codex";
  state: "idle" | "running";
  startedAt: string;
}

export type TaskLoopAgent = "claude" | "codex";
export type TaskLoopStatus = "idle" | "running" | "paused" | "completed" | "failed" | "stopped";
export type TaskLoopTaskStatus = "pending" | "running" | "completed" | "failed";

export interface TaskLoopTask {
  id: string;
  title: string;
  prompt: string;
  memoryNote?: string;
}

export interface TaskLoopDefinition {
  version: "1";
  name: string;
  prePrompt?: string;
  postPrompt?: string;
  idleTimeoutMs?: number;
  tasks: TaskLoopTask[];
}

export interface TaskLoopRecord {
  id: string;
  projectId: ProjectId;
  name: string;
  agent: TaskLoopAgent;
  status: TaskLoopStatus;
  currentTaskIndex: number;
  totalTasks: number;
  sessionId: TerminalSessionId | null;
  startedAt: string;
  completedAt: string | null;
}

export interface TaskLoopTaskRecord {
  id: string;
  loopId: string;
  taskIndex: number;
  title: string;
  status: TaskLoopTaskStatus;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AppSettings {
  aiProvider: "anthropic" | "openai";
  aiApiKey: string;
  aiModel: string;
  commitPrompt: string;
  editorCommand: string;
  gitToken: string;
}
