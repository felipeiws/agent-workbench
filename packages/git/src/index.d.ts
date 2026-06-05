import type { DiffLine, DiffPreview, FileHistoryEntry, GitStatusGroup } from "../../types/src/index";
export declare function parseUnifiedDiff(output: string): DiffLine[];
export declare function parseGitStatus(output: string): GitStatusGroup[];
export declare class GitCliService {
    isGitRepository(projectPath: string): Promise<boolean>;
    getStatus(projectPath: string): Promise<GitStatusGroup[]>;
    stage(projectPath: string, filePath: string): Promise<GitStatusGroup[]>;
    unstage(projectPath: string, filePath: string): Promise<GitStatusGroup[]>;
    getDiff(projectPath: string, filePath: string, mode: DiffPreview["mode"], staged?: boolean): Promise<DiffPreview>;
    getHistory(projectPath: string, filePath: string): Promise<FileHistoryEntry[]>;
    getCommitDiff(projectPath: string, commitHash: string, filePath: string, mode: DiffPreview["mode"]): Promise<DiffPreview>;
    getStagedDiff(projectPath: string): Promise<string>;
    commit(projectPath: string, message: string): Promise<GitStatusGroup[]>;
    push(projectPath: string, token?: string): Promise<void>;
    addToGitIgnore(projectPath: string, filePath: string): void;
}
