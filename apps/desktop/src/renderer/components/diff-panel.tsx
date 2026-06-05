import { useMemo } from "react";

import { ForgeIcon } from "./forge-icons";
import type { DiffLine, DiffPreview, FileHistoryEntry } from "@agent-workbench/types";

export type DiffMode = "side" | "inline";

interface SideBySideRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

interface DiffPanelProps {
  diffMode: DiffMode;
  diff: DiffPreview | undefined;
  absoluteFilePath?: string;
  filePath: string;
  ideError?: string | null;
  ideName: string;
  commits: FileHistoryEntry[];
  selectedCommitHash?: string | null;
  onDiffModeChange: (mode: DiffMode) => void;
  onOpenFileInIde: () => void;
  onOpenProjectInIde: () => void;
  onSelectCommit?: (hash: string | null) => void;
}

export function DiffPanel({
  diffMode,
  diff,
  absoluteFilePath,
  filePath,
  ideError,
  ideName,
  commits,
  selectedCommitHash,
  onDiffModeChange,
  onOpenFileInIde,
  onOpenProjectInIde,
  onSelectCommit
}: DiffPanelProps) {
  const hasSelectedFile = filePath.length > 0;
  const stats = useMemo(() => {
    if (!diff) return { add: 0, del: 0 };
    return {
      add: diff.lines.filter((l) => l.type === "add").length,
      del: diff.lines.filter((l) => l.type === "remove").length
    };
  }, [diff]);

  const [directory, fileName] = splitPath(filePath);

  return (
    <section className="fd-panel fd-diff-panel">
      <div className="fd-diff-head">
        <div className="fd-diff-title">
          <ForgeIcon name="diff" size={12} />
          {hasSelectedFile ? (
            <>
              <span className="dir">{directory}</span>
              <span className="file">{fileName}</span>
            </>
          ) : (
            <span className="file">Diff</span>
          )}
          {diff?.isNewFile && (
            <span className="fd-new-file-badge">NEW</span>
          )}
          {hasSelectedFile && !diff?.isBinary && (
            <span className="fd-diff-stats">
              <span className="add">+{stats.add}</span>
              <span className="del">−{stats.del}</span>
            </span>
          )}
        </div>

        <div className="fd-diff-modes">
          {hasSelectedFile && selectedCommitHash && onSelectCommit && (
            <button
              className="fd-commit-back-btn"
              onClick={() => onSelectCommit(null)}
              type="button"
            >
              ← Current
            </button>
          )}
          <button
            className={diffMode === "side" ? "active" : ""}
            disabled={!hasSelectedFile}
            onClick={() => onDiffModeChange("side")}
            type="button"
          >
            Side-by-side
          </button>
          <button
            className={diffMode === "inline" ? "active" : ""}
            disabled={!hasSelectedFile}
            onClick={() => onDiffModeChange("inline")}
            type="button"
          >
            Inline
          </button>
        </div>
      </div>

      <div className="fd-scroll fd-diff-body">
        {diff ? (
          <DiffBody diff={diff} mode={diffMode} absoluteFilePath={absoluteFilePath} />
        ) : (
          <div className="fd-empty-state">
            <ForgeIcon name="diff" size={24} />
            <span>Selecione um arquivo para ver o que foi modificado.</span>
          </div>
        )}
      </div>

      <HistoryPanel
        commits={commits}
        hasSelectedFile={hasSelectedFile}
        ideError={ideError}
        ideName={ideName}
        selectedCommitHash={selectedCommitHash}
        onOpenFileInIde={onOpenFileInIde}
        onOpenProjectInIde={onOpenProjectInIde}
        onSelectCommit={onSelectCommit}
      />
    </section>
  );
}

function DiffBody({
  diff,
  mode,
  absoluteFilePath
}: {
  diff: DiffPreview;
  mode: DiffMode;
  absoluteFilePath?: string;
}) {
  if (diff.isImage && absoluteFilePath) {
    return (
      <div className="fd-diff-image-preview">
        <img
          alt={diff.filePath}
          src={`file://${absoluteFilePath}`}
        />
      </div>
    );
  }

  if (diff.isBinary) {
    return (
      <div className="fd-diff-binary">
        <ForgeIcon name="binary" size={20} />
        <span>Binary file – cannot display</span>
      </div>
    );
  }

  if (diff.isTruncated && diff.lines.length === 0) {
    return (
      <div className="fd-diff-binary">
        <ForgeIcon name="fileLarge" size={20} />
        <span>File is too large to display</span>
      </div>
    );
  }

  if (diff.lines.length === 0) {
    return (
      <div className="fd-empty-state">
        <ForgeIcon name="diff" size={24} />
        <span>No changes.</span>
      </div>
    );
  }

  return (
    <>
      <DiffLinesView lines={diff.lines} mode={mode} />
      {diff.isTruncated && diff.totalLines !== undefined && (
        <div className="fd-diff-truncated">
          Showing first 2 000 of {diff.totalLines.toLocaleString()} lines
        </div>
      )}
    </>
  );
}

function DiffLinesView({ lines, mode }: { lines: DiffLine[]; mode: DiffMode }) {
  if (mode === "inline") {
    return (
      <table className="fd-diff-table inline">
        <tbody>
          {lines.map((line, index) => (
            <tr className={`row ${line.type}`} key={index}>
              <td className="no">{line.oldLineNo ?? ""}</td>
              <td className="no">{line.newLineNo ?? ""}</td>
              <td className="marker">
                {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
              </td>
              <td className={`code ${line.type}`}>{line.content}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const rows = toSideBySideRows(lines);

  return (
    <table className="fd-diff-table side">
      <tbody>
        {rows.map((row, index) => (
          <tr className="row" key={index}>
            <td className={`no ${row.left?.type === "remove" ? "del" : ""}`}>
              {row.left?.oldLineNo ?? ""}
            </td>
            <td className={`marker ${row.left?.type === "remove" ? "del" : ""}`}>
              {row.left?.type === "remove" ? "−" : " "}
            </td>
            <td className={`code ${row.left?.type === "remove" ? "del" : ""}`}>
              {row.left?.content ?? ""}
            </td>
            <td className={`no ${row.right?.type === "add" ? "add" : ""}`}>
              {row.right?.newLineNo ?? ""}
            </td>
            <td className={`marker ${row.right?.type === "add" ? "add" : ""}`}>
              {row.right?.type === "add" ? "+" : " "}
            </td>
            <td className={`code ${row.right?.type === "add" ? "add" : ""}`}>
              {row.right?.content ?? ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function toSideBySideRows(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line) break;

    if (line.type === "context") {
      rows.push({ left: line, right: line });
      i++;
      continue;
    }

    const removes: DiffLine[] = [];
    const adds: DiffLine[] = [];

    while (i < lines.length) {
      const current = lines[i];
      if (!current || current.type === "context") break;
      if (current.type === "remove") {
        removes.push(current);
      } else {
        adds.push(current);
      }
      i++;
    }

    const maxLen = Math.max(removes.length, adds.length);
    for (let j = 0; j < maxLen; j++) {
      rows.push({ left: removes[j] ?? null, right: adds[j] ?? null });
    }
  }

  return rows;
}

function HistoryPanel({
  commits,
  hasSelectedFile,
  ideError,
  ideName,
  selectedCommitHash,
  onOpenFileInIde,
  onOpenProjectInIde,
  onSelectCommit
}: {
  commits: FileHistoryEntry[];
  hasSelectedFile: boolean;
  ideError?: string | null;
  ideName: string;
  selectedCommitHash?: string | null;
  onOpenFileInIde: () => void;
  onOpenProjectInIde: () => void;
  onSelectCommit?: (hash: string | null) => void;
}) {
  return (
    <div className="fd-history-panel">
      <div className="fd-history-head">
        <div className="fd-panel-title">
          Quick history <span className="count">{commits.length}</span>
        </div>
        <div className="fd-history-actions">
          <button
            className="fd-secondary-button"
            disabled={!hasSelectedFile}
            onClick={onOpenFileInIde}
            type="button"
          >
            <ForgeIcon name="external" size={11} />
            Open in {ideName}
          </button>
          <button className="fd-secondary-button" onClick={onOpenProjectInIde} type="button">
            Open project
          </button>
        </div>
      </div>
      {ideError ? (
        <div className="fd-git-error">
          <ForgeIcon name="alert" size={11} />
          <span>{ideError}</span>
        </div>
      ) : null}

      <div className="fd-scroll fd-history-list">
        {commits.map((commit, index) => {
          const isSelected = commit.hash === selectedCommitHash;
          return (
            <button
              className={`fd-commit-row ${index === 0 ? "head" : ""} ${isSelected ? "selected" : ""}`}
              key={commit.hash}
              onClick={() => onSelectCommit?.(isSelected ? null : commit.hash)}
              type="button"
            >
              <span className="graph-dot" />
              <span className="hash">{commit.hash}</span>
              <span className="message">
                <span className="author">{commit.author}</span>
                {commit.message}
              </span>
              <span className="time">{commit.date}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function splitPath(filePath: string) {
  const index = filePath.lastIndexOf("/");
  if (index === -1) {
    return ["", filePath];
  }

  return [filePath.slice(0, index + 1), filePath.slice(index + 1)];
}
