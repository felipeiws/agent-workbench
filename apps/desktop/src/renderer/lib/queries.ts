import type {
  DiffPreview,
  GitStatusGroup,
  LoadedProjectConfig,
  ProjectId,
  TerminalSessionRecord,
  WorkspaceSnapshot
} from "@agent-workbench/types";

import { getDesktopApi } from "./desktop-api";

export async function fetchSnapshot(): Promise<WorkspaceSnapshot> {
  return getDesktopApi().app.getSnapshot();
}

export async function fetchProjectConfig(projectId: ProjectId): Promise<LoadedProjectConfig> {
  return getDesktopApi().projects.getConfig({ projectId });
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

export async function fetchGitStatus(projectId: string): Promise<GitStatusGroup[]> {
  return getDesktopApi().git.getStatus(projectId);
}

export async function fetchDiff(
  projectId: string,
  filePath: string,
  mode: DiffPreview["mode"]
): Promise<DiffPreview> {
  return getDesktopApi().git.getDiff({ projectId, filePath, mode });
}
