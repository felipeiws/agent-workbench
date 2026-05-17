import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseGitStatus, parseUnifiedDiff } from "./index";
import { GitCliService } from "./index";

describe("parseGitStatus", () => {
  it("returns empty array for empty output", () => {
    expect(parseGitStatus("")).toEqual([]);
  });

  it("groups staged files (index modified, worktree clean)", () => {
    const result = parseGitStatus("M  src/app.ts");
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("Staged");
    expect(result[0]?.items).toEqual([{ path: "src/app.ts", status: "staged" }]);
  });

  it("groups modified files (worktree changed, not staged)", () => {
    const result = parseGitStatus(" M src/app.ts");
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("Modified");
    expect(result[0]?.items).toEqual([{ path: "src/app.ts", status: "modified" }]);
  });

  it("groups untracked files", () => {
    const result = parseGitStatus("?? src/new-file.ts");
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("Untracked");
    expect(result[0]?.items).toEqual([{ path: "src/new-file.ts", status: "untracked" }]);
  });

  it("groups deleted files (worktree deleted)", () => {
    const result = parseGitStatus(" D src/old.ts");
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("Deleted");
    expect(result[0]?.items).toEqual([{ path: "src/old.ts", status: "deleted" }]);
  });

  it("groups deleted files (staged deletion)", () => {
    const result = parseGitStatus("D  src/old.ts");
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("Deleted");
    expect(result[0]?.items).toEqual([{ path: "src/old.ts", status: "deleted" }]);
  });

  it("groups renamed files and sets previousPath", () => {
    const result = parseGitStatus("R  old/path.ts -> new/path.ts");
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("Renamed");
    expect(result[0]?.items).toEqual([
      { path: "new/path.ts", previousPath: "old/path.ts", status: "renamed" }
    ]);
  });

  it("groups conflicted files (both unmerged)", () => {
    const result = parseGitStatus("UU src/conflict.ts");
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("Conflicted");
    expect(result[0]?.items).toEqual([{ path: "src/conflict.ts", status: "conflicted" }]);
  });

  it("filters out empty groups", () => {
    const result = parseGitStatus("M  staged.ts");
    const labels = result.map((g) => g.label);
    expect(labels).not.toContain("Modified");
    expect(labels).not.toContain("Untracked");
  });

  it("parses a mix of all status groups", () => {
    const output = [
      "M  staged.ts",
      " M modified.ts",
      "?? untracked.ts",
      " D deleted.ts",
      "R  old.ts -> renamed.ts",
      "UU conflict.ts"
    ].join("\n");

    const result = parseGitStatus(output);
    const byLabel = Object.fromEntries(result.map((g) => [g.label, g.items]));

    expect(byLabel["Staged"]).toEqual([{ path: "staged.ts", status: "staged" }]);
    expect(byLabel["Modified"]).toEqual([{ path: "modified.ts", status: "modified" }]);
    expect(byLabel["Untracked"]).toEqual([{ path: "untracked.ts", status: "untracked" }]);
    expect(byLabel["Deleted"]).toEqual([{ path: "deleted.ts", status: "deleted" }]);
    expect(byLabel["Renamed"]).toEqual([
      { path: "renamed.ts", previousPath: "old.ts", status: "renamed" }
    ]);
    expect(byLabel["Conflicted"]).toEqual([{ path: "conflict.ts", status: "conflicted" }]);
  });

  it("handles multiple files in the same group", () => {
    const output = " M src/a.ts\n M src/b.ts\n M src/c.ts";
    const result = parseGitStatus(output);
    expect(result).toHaveLength(1);
    expect(result[0]?.items).toHaveLength(3);
    expect(result[0]?.items.map((i) => i.path)).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });
});

describe("GitCliService.addToGitIgnore", () => {
  it("creates .gitignore and appends the entry when it does not exist", () => {
    const dir = join(tmpdir(), `gitignore-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    try {
      const service = new GitCliService();
      service.addToGitIgnore(dir, "dist/");

      const content = readFileSync(join(dir, ".gitignore"), "utf8");
      expect(content).toBe("dist/\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("appends to an existing .gitignore", () => {
    const dir = join(tmpdir(), `gitignore-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    try {
      writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
      const service = new GitCliService();
      service.addToGitIgnore(dir, "dist/");

      const content = readFileSync(join(dir, ".gitignore"), "utf8");
      expect(content).toBe("node_modules/\ndist/\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not duplicate an entry already present", () => {
    const dir = join(tmpdir(), `gitignore-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    try {
      writeFileSync(join(dir, ".gitignore"), "dist/\n");
      const service = new GitCliService();
      service.addToGitIgnore(dir, "dist/");

      const content = readFileSync(join(dir, ".gitignore"), "utf8");
      expect(content).toBe("dist/\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("GitCliService.getDiff — binary, image, large file handling", () => {
  it("returns isBinary=true and no lines for a binary file", async () => {
    const dir = join(tmpdir(), `git-binary-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    try {
      const { execFileSync } = await import("node:child_process");
      execFileSync("git", ["init"], { cwd: dir });
      execFileSync("git", ["config", "user.email", "t@t.com"], { cwd: dir });
      execFileSync("git", ["config", "user.name", "T"], { cwd: dir });

      // Write a buffer with a null byte
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a, 0x1a]);
      writeFileSync(join(dir, "image.bin"), buf);

      const service = new GitCliService();
      const result = await service.getDiff(dir, "image.bin", "side-by-side");

      expect(result.isBinary).toBe(true);
      expect(result.isImage).toBe(false);
      expect(result.lines).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns isImage=true for a .png extension file", async () => {
    const dir = join(tmpdir(), `git-img-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    try {
      const { execFileSync } = await import("node:child_process");
      execFileSync("git", ["init"], { cwd: dir });
      execFileSync("git", ["config", "user.email", "t@t.com"], { cwd: dir });
      execFileSync("git", ["config", "user.name", "T"], { cwd: dir });

      writeFileSync(join(dir, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      const service = new GitCliService();
      const result = await service.getDiff(dir, "logo.png", "side-by-side");

      expect(result.isBinary).toBe(true);
      expect(result.isImage).toBe(true);
      expect(result.isNewFile).toBe(true);
      expect(result.lines).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("truncates and sets isTruncated when file has more than 2000 lines", async () => {
    const dir = join(tmpdir(), `git-large-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    try {
      const { execFileSync } = await import("node:child_process");
      execFileSync("git", ["init"], { cwd: dir });
      execFileSync("git", ["config", "user.email", "t@t.com"], { cwd: dir });
      execFileSync("git", ["config", "user.name", "T"], { cwd: dir });

      const content = Array.from({ length: 3000 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
      writeFileSync(join(dir, "large.ts"), content);

      const service = new GitCliService();
      const result = await service.getDiff(dir, "large.ts", "side-by-side");

      expect(result.isNewFile).toBe(true);
      expect(result.isTruncated).toBe(true);
      expect(result.totalLines).toBe(3000);
      expect(result.lines).toHaveLength(2000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("GitCliService.getDiff — untracked file fallback", () => {
  it("shows all file lines as additions when git diff returns empty (untracked file)", async () => {
    const dir = join(tmpdir(), `git-diff-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    try {
      const { execFileSync } = await import("node:child_process");
      execFileSync("git", ["init"], { cwd: dir });
      execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });

      writeFileSync(join(dir, "new.ts"), "line one\nline two\nline three\n");

      const service = new GitCliService();
      const result = await service.getDiff(dir, "new.ts", "side-by-side");

      expect(result.lines).toHaveLength(3);
      expect(result.lines.every((l) => l.type === "add")).toBe(true);
      expect(result.lines.map((l) => l.content)).toEqual(["line one", "line two", "line three"]);
      expect(result.lines.map((l) => l.newLineNo)).toEqual([1, 2, 3]);
      expect(result.lines.every((l) => l.oldLineNo === null)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("parseUnifiedDiff", () => {
  it("returns empty array for empty input", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });

  it("parses a simple hunk with add, remove and context lines", () => {
    const raw = [
      "diff --git a/foo.ts b/foo.ts",
      "index abc..def 100644",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,3 +1,3 @@",
      " context line",
      "-removed line",
      "+added line"
    ].join("\n");

    const lines = parseUnifiedDiff(raw);
    expect(lines).toEqual([
      { type: "context", content: "context line", oldLineNo: 1, newLineNo: 1 },
      { type: "remove", content: "removed line", oldLineNo: 2, newLineNo: null },
      { type: "add",    content: "added line",   oldLineNo: null, newLineNo: 2 }
    ]);
  });

  it("tracks line numbers correctly across a hunk", () => {
    const raw = [
      "--- a/f.ts",
      "+++ b/f.ts",
      "@@ -5,4 +5,4 @@",
      " line5",
      "-line6",
      "+newline6",
      " line7",
      " line8"
    ].join("\n");

    const lines = parseUnifiedDiff(raw);
    expect(lines[0]).toMatchObject({ type: "context", oldLineNo: 5, newLineNo: 5 });
    expect(lines[1]).toMatchObject({ type: "remove",  oldLineNo: 6, newLineNo: null });
    expect(lines[2]).toMatchObject({ type: "add",     oldLineNo: null, newLineNo: 6 });
    expect(lines[3]).toMatchObject({ type: "context", oldLineNo: 7, newLineNo: 7 });
    expect(lines[4]).toMatchObject({ type: "context", oldLineNo: 8, newLineNo: 8 });
  });

  it("handles multiple hunks and resets line numbers per hunk", () => {
    const raw = [
      "--- a/f.ts",
      "+++ b/f.ts",
      "@@ -1,2 +1,2 @@",
      " ctx1",
      "-rem1",
      "+add1",
      "@@ -10,2 +10,2 @@",
      " ctx10",
      "-rem10",
      "+add10"
    ].join("\n");

    const lines = parseUnifiedDiff(raw);
    expect(lines).toHaveLength(6);
    expect(lines[0]).toMatchObject({ type: "context", oldLineNo: 1, newLineNo: 1 });
    expect(lines[3]).toMatchObject({ type: "context", oldLineNo: 10, newLineNo: 10 });
    expect(lines[4]).toMatchObject({ type: "remove",  oldLineNo: 11 });
    expect(lines[5]).toMatchObject({ type: "add",     newLineNo: 11 });
  });

  it("ignores lines before the +++ header", () => {
    const raw = [
      "diff --git a/f.ts b/f.ts",
      "index abc..def 100644",
      "--- a/f.ts",
      "+++ b/f.ts",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new"
    ].join("\n");

    const lines = parseUnifiedDiff(raw);
    expect(lines).toHaveLength(2);
  });

  it("skips '\\' no-newline marker lines", () => {
    const raw = [
      "--- a/f.ts",
      "+++ b/f.ts",
      "@@ -1,1 +1,1 @@",
      "-old",
      "\\ No newline at end of file",
      "+new"
    ].join("\n");

    const lines = parseUnifiedDiff(raw);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.content !== "\\ No newline at end of file")).toBe(true);
  });
});
