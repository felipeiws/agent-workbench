import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type {
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

function buildFallbackDiff(filePath: string, mode: DiffPreview["mode"]): DiffPreview {
  return {
    mode,
    filePath,
    original: [
      "export function summarizeSession(session) {",
      "  return session.output.join('\\n');",
      "}"
    ],
    updated: [
      "export function summarizeSession(session) {",
      "  return session.output.join('\\n').trim();",
      "}"
    ]
  };
}

export class GitCliService {
  async getStatus(projectPath: string): Promise<GitStatusGroup[]> {
    const output = await runGit(projectPath, ["status", "--short"], "");
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
    mode: DiffPreview["mode"]
  ): Promise<DiffPreview> {
    const output = await runGit(projectPath, ["diff", "--", filePath], "");

    if (!output) {
      return buildFallbackDiff(filePath, mode);
    }

    const original: string[] = [];
    const updated: string[] = [];

    for (const line of output.split("\n")) {
      if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("@@")) {
        continue;
      }

      if (line.startsWith("-")) {
        original.push(line.slice(1));
        continue;
      }

      if (line.startsWith("+")) {
        updated.push(line.slice(1));
        continue;
      }

      if (line.startsWith(" ")) {
        const value = line.slice(1);
        original.push(value);
        updated.push(value);
      }
    }

    return {
      mode,
      filePath,
      original: original.length ? original : buildFallbackDiff(filePath, mode).original,
      updated: updated.length ? updated : buildFallbackDiff(filePath, mode).updated
    };
  }

  async getHistory(projectPath: string, filePath: string): Promise<FileHistoryEntry[]> {
    const output = await runGit(
      projectPath,
      ["log", "-n", "5", "--format=%H%x1f%an%x1f%ad%x1f%s", "--", filePath],
      ""
    );

    if (!output) {
      return [
        {
          hash: "3ac91b2",
          author: "System Seed",
          date: new Date().toISOString().slice(0, 10),
          message: "Mock history preview for non-git folders"
        }
      ];
    }

    return output.split("\n").map((line) => {
      const [hash, author, date, message] = line.split("\u001f");
      return {
        hash: (hash ?? "unknown").slice(0, 7),
        author: author ?? "Unknown",
        date: date ?? "",
        message: message ?? ""
      };
    });
  }
}
