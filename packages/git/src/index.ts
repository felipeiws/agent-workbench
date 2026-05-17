import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { promisify } from "node:util";

import type {
  DiffLine,
  DiffPreview,
  FileHistoryEntry,
  GitFileChange,
  GitStatusGroup
} from "../../types/src/index";

const execFileAsync = promisify(execFile);

async function runGit(
  cwd: string,
  args: string[],
  fallback = ""
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout.trimEnd();
  } catch {
    return fallback;
  }
}

function classifyChange(indexStatus: string, workTreeStatus: string): GitFileChange["status"] {
  if (indexStatus === "U" || workTreeStatus === "U") {
    return "conflicted";
  }

  if (indexStatus === "R" || workTreeStatus === "R") {
    return "renamed";
  }

  if (indexStatus === "D" || workTreeStatus === "D") {
    return "deleted";
  }

  if (workTreeStatus === "?") {
    return "untracked";
  }

  if (indexStatus !== " " && indexStatus !== "?") {
    return "staged";
  }

  return "modified";
}

const MAX_DISPLAY_LINES = 2000;
const MAX_DISPLAY_BYTES = 1_048_576; // 1 MB

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
  ".ico", ".bmp", ".tiff", ".tif", ".avif"
]);

type NewFileResult = Pick<DiffPreview, "lines" | "isNewFile" | "isBinary" | "isImage" | "isTruncated" | "totalLines">;

function readNewFileContent(fullPath: string): NewFileResult {
  if (!existsSync(fullPath)) {
    return { lines: [], isNewFile: true };
  }

  const ext = extname(fullPath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) {
    return { lines: [], isNewFile: true, isBinary: true, isImage: true };
  }

  let buffer: Buffer;
  try {
    buffer = readFileSync(fullPath);
  } catch {
    return { lines: [], isNewFile: true };
  }

  if (buffer.length > MAX_DISPLAY_BYTES) {
    return { lines: [], isNewFile: true, isTruncated: true };
  }

  // Detect binary via null bytes in first 8 KB
  const probe = Math.min(buffer.length, 8192);
  for (let i = 0; i < probe; i++) {
    if (buffer[i] === 0) {
      return { lines: [], isNewFile: true, isBinary: true, isImage: false };
    }
  }

  const rawLines = buffer.toString("utf8").split("\n");
  if (rawLines[rawLines.length - 1] === "") {
    rawLines.pop();
  }

  const totalLines = rawLines.length;
  const truncated = totalLines > MAX_DISPLAY_LINES;
  const visible = truncated ? rawLines.slice(0, MAX_DISPLAY_LINES) : rawLines;

  const lines: DiffLine[] = visible.map((content, index) => ({
    type: "add" as const,
    content,
    oldLineNo: null,
    newLineNo: index + 1
  }));

  return {
    lines,
    isNewFile: true,
    isBinary: false,
    isTruncated: truncated || undefined,
    totalLines: truncated ? totalLines : undefined
  };
}

export function parseUnifiedDiff(output: string): DiffLine[] {
  if (!output) {
    return [];
  }

  const lines = output.split("\n");
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  let seenFileHeader = false;

  for (const line of lines) {
    if (line.startsWith("+++ ")) {
      seenFileHeader = true;
      inHunk = false;
      continue;
    }

    if (!seenFileHeader) {
      continue;
    }

    if (line.startsWith("@@ ")) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match?.[1] && match?.[2]) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
        inHunk = true;
      }
      continue;
    }

    if (!inHunk) {
      continue;
    }

    if (line.startsWith("-")) {
      result.push({ type: "remove", content: line.slice(1), oldLineNo: oldLine++, newLineNo: null });
    } else if (line.startsWith("+")) {
      result.push({ type: "add", content: line.slice(1), oldLineNo: null, newLineNo: newLine++ });
    } else if (line.startsWith(" ")) {
      result.push({ type: "context", content: line.slice(1), oldLineNo: oldLine++, newLineNo: newLine++ });
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file"
    } else if (line.startsWith("diff ") || line.startsWith("index ")) {
      inHunk = false;
      seenFileHeader = false;
    }
  }

  return result;
}

export function parseGitStatus(output: string): GitStatusGroup[] {
  const groups: Record<GitFileChange["status"], GitFileChange[]> = {
    staged: [],
    modified: [],
    untracked: [],
    deleted: [],
    renamed: [],
    conflicted: []
  };

  for (const line of output.split("\n")) {
    if (!line) {
      continue;
    }

    const indexStatus = line[0] ?? " ";
    const workTreeStatus = line[1] ?? " ";
    const body = line.slice(3);

    const [from = body, to] = body.split(" -> ");
    const status = classifyChange(indexStatus, workTreeStatus);

    groups[status].push({
      path: to ?? from,
      previousPath: to ? from : undefined,
      status
    });
  }

  return [
    { label: "Staged", items: groups.staged },
    { label: "Modified", items: groups.modified },
    { label: "Untracked", items: groups.untracked },
    { label: "Deleted", items: groups.deleted },
    { label: "Renamed", items: groups.renamed },
    { label: "Conflicted", items: groups.conflicted }
  ].filter((group) => group.items.length > 0);
}

export class GitCliService {
  async isGitRepository(projectPath: string): Promise<boolean> {
    if (!existsSync(projectPath) || !statSync(projectPath).isDirectory()) {
      return false;
    }

    const output = await runGit(projectPath, ["rev-parse", "--is-inside-work-tree"], "");
    return output === "true";
  }

  async getStatus(projectPath: string): Promise<GitStatusGroup[]> {
    const output = await runGit(projectPath, ["status", "--porcelain"], "");
    return parseGitStatus(output);
  }

  async stage(projectPath: string, filePath: string): Promise<GitStatusGroup[]> {
    await runGit(projectPath, ["add", "--", filePath], "");
    return this.getStatus(projectPath);
  }

  async unstage(projectPath: string, filePath: string): Promise<GitStatusGroup[]> {
    await runGit(projectPath, ["reset", "HEAD", "--", filePath], "");
    return this.getStatus(projectPath);
  }

  async getDiff(
    projectPath: string,
    filePath: string,
    mode: DiffPreview["mode"],
    staged = false
  ): Promise<DiffPreview> {
    if (!filePath) {
      return { mode, filePath, lines: [] };
    }

    const args = staged
      ? ["diff", "--staged", "--", filePath]
      : ["diff", "--", filePath];

    const output = await runGit(projectPath, args, "");

    if (output) {
      return { mode, filePath, lines: parseUnifiedDiff(output) };
    }

    return { mode, filePath, ...readNewFileContent(join(projectPath, filePath)) };
  }

  async getHistory(projectPath: string, filePath: string): Promise<FileHistoryEntry[]> {
    if (!filePath) {
      return [];
    }

    const output = await runGit(
      projectPath,
      ["log", "-n", "5", "--format=%H%x1f%an%x1f%ad%x1f%s", "--follow", "--", filePath],
      ""
    );

    if (!output) {
      return [];
    }

    return output.split("\n").map((line) => {
      const [hash, author, date, message] = line.split("\x1f");
      return {
        hash: (hash ?? "unknown").slice(0, 7),
        author: author ?? "Unknown",
        date: date ?? "",
        message: message ?? ""
      };
    });
  }

  async getCommitDiff(
    projectPath: string,
    commitHash: string,
    filePath: string,
    mode: DiffPreview["mode"]
  ): Promise<DiffPreview> {
    if (!filePath || !commitHash) {
      return { mode, filePath, lines: [] };
    }

    const output = await runGit(
      projectPath,
      ["show", commitHash, "--", filePath],
      ""
    );

    return { mode, filePath, lines: parseUnifiedDiff(output) };
  }

  async getStagedDiff(projectPath: string): Promise<string> {
    return runGit(projectPath, ["diff", "--staged"], "");
  }

  async commit(projectPath: string, message: string): Promise<GitStatusGroup[]> {
    try {
      await execFileAsync("git", ["commit", "-m", message], { cwd: projectPath });
    } catch (error) {
      const err = error as { stderr?: string };
      throw new Error(err.stderr?.trim() || "Git commit failed");
    }
    return this.getStatus(projectPath);
  }

  addToGitIgnore(projectPath: string, filePath: string): void {
    const gitIgnorePath = join(projectPath, ".gitignore");
    const entry = filePath.replace(/\\/g, "/");

    let existing = "";
    try {
      existing = readFileSync(gitIgnorePath, "utf8");
    } catch {
      // .gitignore does not exist yet
    }

    const alreadyIgnored = existing
      .split("\n")
      .some((line) => line.trim() === entry);

    if (alreadyIgnored) {
      return;
    }

    const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    writeFileSync(gitIgnorePath, `${existing}${separator}${entry}\n`, "utf8");
  }
}
