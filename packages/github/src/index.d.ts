import type { GitHubIssue, ProjectGitHubConfig } from "../../types/src/index";
export declare function readGitHubToken(): string | null;
export declare class GitHubClient {
    private readonly token;
    constructor(token: string);
    listIssues(owner: string, repo: string, labels: string[]): Promise<GitHubIssue[]>;
    getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue>;
    postComment(owner: string, repo: string, issueNumber: number, body: string): Promise<void>;
    addLabel(owner: string, repo: string, issueNumber: number, label: string): Promise<void>;
}
export interface IssuePolledEvent {
    projectId: string;
    issue: GitHubIssue;
}
export declare class GitHubService {
    private readonly events;
    private readonly pollers;
    startWatchingProject(projectId: string, config: ProjectGitHubConfig): void;
    stopWatchingProject(projectId: string): void;
    listIssues(projectId: string, config: ProjectGitHubConfig): Promise<GitHubIssue[]>;
    getIssue(config: ProjectGitHubConfig, issueNumber: number): Promise<GitHubIssue>;
    postComment(config: ProjectGitHubConfig, issueNumber: number, body: string): Promise<void>;
    onIssuePolled(listener: (event: IssuePolledEvent) => void): void;
    stopAll(): void;
}
