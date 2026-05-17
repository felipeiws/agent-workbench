import type {
  SaveProjectLayoutPayload,
} from "@agent-workbench/shared";
import type {
  AuditEvent,
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
  TaskLoopAgent,
  TaskLoopDefinition,
  TaskLoopRecord,
  TaskLoopTaskRecord,
  TerminalSessionRecord,
  WorkspaceSnapshot
} from "@agent-workbench/types";

import { getDesktopApi } from "./desktop-api";

export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
  return getDesktopApi().workspaces.rename({ workspaceId, name });
}

export async function fetchSnapshot(): Promise<WorkspaceSnapshot> {
  return getDesktopApi().app.getSnapshot();
}

export async function fetchProjectConfig(projectId: ProjectId): Promise<LoadedProjectConfig> {
  return getDesktopApi().projects.getConfig({ projectId });
}

export async function fetchProjectLayout(
  projectId: ProjectId
): Promise<ProjectLayoutRecord> {
  return getDesktopApi().projects.getLayout({ projectId });
}

export async function saveProjectLayout(
  layout: SaveProjectLayoutPayload
): Promise<ProjectLayoutRecord> {
  return getDesktopApi().projects.saveLayout(layout);
}

export async function removeProject(projectId: string): Promise<void> {
  return getDesktopApi().projects.removeProject(projectId);
}

export async function importProject(workspaceId?: string): Promise<ProjectImportResult> {
  return getDesktopApi().projects.importProject({ workspaceId });
}

export async function createTerminal(
  projectId: ProjectId,
  name: string,
  command: string
): Promise<TerminalSessionRecord> {
  return getDesktopApi().terminals.create({ projectId, name, command });
}

export async function fetchTerminalOutput(sessionId: string) {
  return getDesktopApi().terminals.getOutput(sessionId);
}

export async function writeTerminal(sessionId: string, input: string): Promise<void> {
  return getDesktopApi().terminals.write({ sessionId, input });
}

export async function resizeTerminal(
  sessionId: string,
  cols: number,
  rows: number
): Promise<void> {
  return getDesktopApi().terminals.resize({ sessionId, cols, rows });
}

export async function terminateTerminal(sessionId: string): Promise<void> {
  return getDesktopApi().terminals.terminate(sessionId);
}

export async function restartTerminal(sessionId: string): Promise<TerminalSessionRecord> {
  return getDesktopApi().terminals.restart({ sessionId });
}

export async function fetchGitStatus(projectId: string): Promise<GitStatusGroup[]> {
  return getDesktopApi().git.getStatus(projectId);
}

export async function fetchDiff(
  projectId: string,
  filePath: string,
  mode: DiffPreview["mode"],
  staged?: boolean
): Promise<DiffPreview> {
  return getDesktopApi().git.getDiff({ projectId, filePath, mode, staged });
}

export async function fetchHistory(
  projectId: string,
  filePath: string
): Promise<FileHistoryEntry[]> {
  return getDesktopApi().git.getHistory({ projectId, filePath });
}

export async function fetchCommitDiff(
  projectId: string,
  commitHash: string,
  filePath: string,
  mode: DiffPreview["mode"]
): Promise<DiffPreview> {
  return getDesktopApi().git.getCommitDiff({ projectId, commitHash, filePath, mode });
}

export async function stageFile(projectId: string, filePath: string): Promise<GitStatusGroup[]> {
  return getDesktopApi().git.stage({ projectId, filePath });
}

export async function unstageFile(projectId: string, filePath: string): Promise<GitStatusGroup[]> {
  return getDesktopApi().git.unstage({ projectId, filePath });
}

export async function addToGitIgnore(projectId: string, filePath: string): Promise<void> {
  return getDesktopApi().git.addToGitIgnore({ projectId, filePath });
}

export async function commitFiles(projectId: string, message: string): Promise<GitStatusGroup[]> {
  return getDesktopApi().git.commit({ projectId, message });
}

export async function generateCommitMessage(projectId: string): Promise<string> {
  return getDesktopApi().git.generateCommitMessage(projectId);
}

export async function openProjectInIde(
  projectId: string,
  filePath?: string
): Promise<void> {
  return getDesktopApi().projects.openIde({ projectId, filePath });
}

export async function fetchAuditEvents(projectId: string): Promise<AuditEvent[]> {
  return getDesktopApi().audit.listEvents(projectId);
}

export async function fetchGitHubIssues(projectId: string): Promise<GitHubIssue[]> {
  return getDesktopApi().github.listIssues({ projectId });
}

export async function fetchDispatchedIssues(projectId: string): Promise<GitHubIssueRecord[]> {
  return getDesktopApi().github.listDispatched({ projectId });
}

export async function dispatchGitHubIssue(
  projectId: string,
  issueNumber: number
): Promise<IssueDispatchEvent> {
  return getDesktopApi().github.dispatchIssue({ projectId, issueNumber });
}

export async function saveGitHubConfig(
  projectId: string,
  github: ProjectGitHubConfig | null
): Promise<LoadedProjectConfig> {
  return getDesktopApi().github.saveConfig({ projectId, github });
}

export async function importTaskLoopDefinition(
  projectId: string
): Promise<TaskLoopDefinition | null> {
  return getDesktopApi().taskloop.import({ projectId });
}

export async function startTaskLoop(
  projectId: string,
  agent: TaskLoopAgent,
  definition: TaskLoopDefinition
): Promise<TaskLoopRecord> {
  return getDesktopApi().taskloop.start({ projectId, agent, definition });
}

export async function pauseTaskLoop(loopId: string): Promise<void> {
  return getDesktopApi().taskloop.pause({ loopId });
}

export async function resumeTaskLoop(loopId: string): Promise<void> {
  return getDesktopApi().taskloop.resume({ loopId });
}

export async function stopTaskLoop(loopId: string): Promise<void> {
  return getDesktopApi().taskloop.stop({ loopId });
}

export async function deleteTaskLoop(loopId: string): Promise<void> {
  return getDesktopApi().taskloop.delete({ loopId });
}

export async function listTaskLoops(projectId: string): Promise<TaskLoopRecord[]> {
  return getDesktopApi().taskloop.list({ projectId });
}

export async function getTaskLoopTasks(loopId: string): Promise<TaskLoopTaskRecord[]> {
  return getDesktopApi().taskloop.getTasks(loopId);
}
