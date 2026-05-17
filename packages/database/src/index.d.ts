import type { AuditEvent, AuditRisk, GitHubIssueRecord, ProjectRecord, ProjectLayoutRecord, TerminalChunkRecord, TerminalSessionRecord, Workspace } from "../../types/src/index";
export interface CreateProjectInput {
    workspaceId: string;
    name: string;
    path: string;
    safeMode: ProjectRecord["safeMode"];
    ideCommand: string;
    configPath: string;
}
export interface CreateTerminalSessionInput {
    projectId: string;
    name: string;
    command: string;
    cwd: string;
    state: TerminalSessionRecord["state"];
}
export interface SaveProjectLayoutInput {
    projectId: string;
    activeSessionId: string | null;
    terminalMode: ProjectLayoutRecord["terminalMode"];
    diffMode: ProjectLayoutRecord["diffMode"];
    selectedFilePath: string | null;
}
export interface UpdateProjectConfigInput {
    projectId: string;
    name: string;
    safeMode: ProjectRecord["safeMode"];
    ideCommand: string;
}
export interface CreateAuditEventInput {
    sessionId: string;
    projectId: string;
    command: string;
    risk: AuditRisk;
    reason: string;
}
export interface MarkIssueDispatchedInput {
    projectId: string;
    issueNumber: number;
    title: string;
    sessionId: string | null;
}
export declare class DatabaseClient {
    private readonly db;
    constructor(filePath: string);
    private migrate;
    close(): void;
    listWorkspaces(): Workspace[];
    createWorkspace(name: string): Workspace;
    renameWorkspace(id: string, name: string): Workspace;
    getWorkspaceByName(name: string): Workspace | null;
    listProjects(): ProjectRecord[];
    getProjectById(projectId: string): ProjectRecord | null;
    getProjectByPath(projectPath: string): ProjectRecord | null;
    deleteProject(projectId: string): void;
    createProject(input: CreateProjectInput): ProjectRecord;
    updateProjectConfig(input: UpdateProjectConfigInput): ProjectRecord;
    listTerminalSessions(projectId?: string): TerminalSessionRecord[];
    createTerminalSession(input: CreateTerminalSessionInput): TerminalSessionRecord;
    getTerminalSessionById(sessionId: string): TerminalSessionRecord | null;
    getProjectLayout(projectId: string): ProjectLayoutRecord;
    saveProjectLayout(input: SaveProjectLayoutInput): ProjectLayoutRecord;
    updateTerminalSessionState(sessionId: string, state: TerminalSessionRecord["state"], exitCode?: number): TerminalSessionRecord;
    appendTerminalChunk(sessionId: string, stream: TerminalChunkRecord["stream"], content: string): TerminalChunkRecord;
    getTerminalChunks(sessionId: string): TerminalChunkRecord[];
    createAuditEvent(input: CreateAuditEventInput): AuditEvent;
    listAuditEvents(projectId: string): AuditEvent[];
    isIssueDispatched(projectId: string, issueNumber: number): boolean;
    markIssueDispatched(input: MarkIssueDispatchedInput): GitHubIssueRecord;
    listDispatchedIssues(projectId: string): GitHubIssueRecord[];
}
