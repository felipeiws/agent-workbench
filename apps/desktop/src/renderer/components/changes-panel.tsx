import { useRef, useMemo, useState } from "react";

import { ForgeIcon } from "./forge-icons";

export interface ChangeSource {
  agent: string;
  terminal: string;
}

export interface ChangeItemView {
  key: string;
  path: string;
  file: string;
  add: number;
  del: number;
  staged: boolean;
  gtype: "C" | "M" | "U" | "R" | "D";
  multi: boolean;
  sources: ChangeSource[];
  confidence?: number;
}

export interface ChangeGroupView {
  group: string;
  items: ChangeItemView[];
}

interface ChangesPanelProps {
  groups: ChangeGroupView[];
  selectedChangeKey: string;
  gitError?: string | null;
  hasGithub?: boolean;
  onSelectChange: (changeKey: string) => void;
  onStageChange: (filePath: string) => void;
  onUnstageChange: (filePath: string) => void;
  onStageAll: (filePaths: string[]) => void;
  onUnstageAll: (filePaths: string[]) => void;
  onOpenInEditor?: (filePath: string) => void;
  onRefresh?: () => void;
  onShowIssues?: () => void;
  onShowGitHubConfig?: () => void;
  onShowTaskLoop?: () => void;
  onCommit: (message: string) => Promise<void>;
  onCommitAndPush: (message: string) => Promise<void>;
  onGenerateCommitMessage: () => Promise<string>;
}

export function ChangesPanel({
  groups,
  selectedChangeKey,
  gitError,
  hasGithub,
  onSelectChange,
  onStageChange,
  onUnstageChange,
  onStageAll,
  onUnstageAll,
  onOpenInEditor,
  onRefresh,
  onShowIssues,
  onShowGitHubConfig,
  onShowTaskLoop,
  onCommit,
  onCommitAndPush,
  onGenerateCommitMessage
}: ChangesPanelProps) {
  const [filter, setFilter] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const metrics = useMemo(() => {
    const totalFiles = groups.reduce((sum, group) => sum + group.items.length, 0);
    const totalAdd = groups.reduce(
      (sum, group) => sum + group.items.reduce((inner, item) => inner + item.add, 0),
      0
    );
    const totalDel = groups.reduce(
      (sum, group) => sum + group.items.reduce((inner, item) => inner + item.del, 0),
      0
    );
    const stagedCount = groups.reduce(
      (sum, group) => sum + group.items.filter((item) => item.staged).length,
      0
    );

    return { stagedCount, totalAdd, totalDel, totalFiles };
  }, [groups]);
  const canCommit = metrics.stagedCount > 0;

  async function handleGenerate() {
    if (!canCommit) {
      setCommitError("Marque ao menos um arquivo para incluir no commit.");
      return;
    }

    setIsGenerating(true);
    setCommitError(null);
    try {
      const message = await onGenerateCommitMessage();
      setCommitMessage(message);
      setTimeout(() => textareaRef.current?.focus(), 50);
    } catch (error) {
      setCommitError(error instanceof Error ? error.message : "Failed to generate message.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCommit() {
    if (!commitMessage.trim()) return;
    setIsCommitting(true);
    setCommitError(null);
    try {
      await onCommit(commitMessage.trim());
      setCommitMessage("");
    } catch (error) {
      setCommitError(error instanceof Error ? error.message : "Commit failed.");
    } finally {
      setIsCommitting(false);
    }
  }

  async function handleCommitAndPush() {
    if (!commitMessage.trim()) return;
    setIsCommitting(true);
    setCommitError(null);
    try {
      await onCommitAndPush(commitMessage.trim());
      setCommitMessage("");
    } catch (error) {
      setCommitError(error instanceof Error ? error.message : "Commit & push failed.");
    } finally {
      setIsCommitting(false);
    }
  }

  return (
    <section className="fd-panel fd-changes-panel">
      <div className="fd-panel-head">
        <div className="fd-panel-tabs">
          <button className="fd-panel-tab active" type="button">
            Changes
            {metrics.totalFiles > 0 ? (
              <span className="count">{metrics.totalFiles}</span>
            ) : null}
          </button>
          {hasGithub ? (
            <button className="fd-panel-tab" onClick={onShowIssues} type="button">
              Issues
            </button>
          ) : null}
        </div>
        <div className="fd-panel-actions">
          {onRefresh ? (
            <button
              className="fd-icon-button"
              onClick={onRefresh}
              title="Atualizar arquivos"
              type="button"
            >
              <ForgeIcon name="restart" size={12} />
            </button>
          ) : null}
          <button
            className="fd-icon-button"
            onClick={onShowTaskLoop}
            title="Task Loop"
            type="button"
          >
            <ForgeIcon name="loop" size={13} />
          </button>
          <button
            className="fd-icon-button"
            onClick={onShowGitHubConfig}
            title={hasGithub ? "GitHub settings" : "Set up GitHub"}
            type="button"
          >
            <ForgeIcon name="github" size={13} />
          </button>
          <button className="fd-icon-button" type="button">
            <ForgeIcon name="history" size={12} />
          </button>
        </div>
      </div>

      <div className="fd-search">
        <ForgeIcon name="search" size={12} />
        <input
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter files…"
          value={filter}
        />
        <span className="fd-kbd">⌘P</span>
      </div>

      <div className="fd-scroll fd-changes-list">
        <SelectAllRow
          items={groups.flatMap((group) => group.items).filter((item) =>
            item.key.toLowerCase().includes(filter.toLowerCase())
          )}
          onStageAll={onStageAll}
          onUnstageAll={onUnstageAll}
        />
        {groups
          .flatMap((group) => group.items)
          .filter((item) => item.key.toLowerCase().includes(filter.toLowerCase()))
          .map((item) => (
            <ChangeRow
              item={item}
              key={item.key}
              onOpenInEditor={onOpenInEditor}
              onSelectChange={onSelectChange}
              onStageChange={onStageChange}
              onUnstageChange={onUnstageChange}
              selected={selectedChangeKey === item.key}
            />
          ))}
      </div>

      {gitError ? (
        <div className="fd-git-error">
          <ForgeIcon name="alert" size={11} />
          <span>{gitError}</span>
        </div>
      ) : null}

      <div className="fd-commit-form">
        <div className="fd-changes-summary">
          <span className="add">+{metrics.totalAdd}</span>
          <span className="del">−{metrics.totalDel}</span>
          <span>{metrics.stagedCount}/{metrics.totalFiles} staged</span>
        </div>
        <textarea
          className="fd-commit-textarea"
          disabled={isCommitting}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message…"
          ref={textareaRef}
          rows={3}
          value={commitMessage}
        />
        <div className="fd-commit-ai-row">
          <button
            className={`fd-generate-button ${isGenerating ? "spinning" : ""}`}
            disabled={!canCommit || isGenerating || isCommitting}
            onClick={handleGenerate}
            title={isGenerating ? "Gerando…" : "Gerar mensagem com IA"}
            type="button"
          >
            <ForgeIcon name="sparkles" size={13} />
          </button>
        </div>
        {commitError ? (
          <div className="fd-commit-error">
            <ForgeIcon name="alert" size={11} />
            <span>{commitError}</span>
          </div>
        ) : null}
        <div className="fd-commit-actions">
          <button
            className="fd-secondary-button"
            disabled={!commitMessage.trim() || isCommitting}
            onClick={handleCommit}
            type="button"
          >
            Commit
          </button>
          <button
            className="fd-primary-button"
            disabled={!canCommit || !commitMessage.trim() || isCommitting}
            onClick={handleCommitAndPush}
            title="Commit e enviar para o remote"
            type="button"
          >
            {isCommitting ? "Enviando…" : "Commit & Push"}
          </button>
        </div>
      </div>
    </section>
  );
}

function SelectAllRow({
  items,
  onStageAll,
  onUnstageAll
}: {
  items: ChangeItemView[];
  onStageAll: (filePaths: string[]) => void;
  onUnstageAll: (filePaths: string[]) => void;
}) {
  if (items.length === 0) return null;

  const stagedCount = items.filter((item) => item.staged).length;
  const allStaged = stagedCount === items.length;
  const someStaged = stagedCount > 0 && !allStaged;

  function handleToggle() {
    const paths = items.map((item) => item.key);
    if (allStaged) {
      onUnstageAll(paths);
    } else {
      onStageAll(paths.filter((_, i) => !items[i]!.staged));
    }
  }

  return (
    <div className="fd-change-row fd-select-all-row">
      <button
        className={`fd-stage-toggle ${allStaged ? "staged" : ""}`}
        onClick={handleToggle}
        title={allStaged ? "Desmarcar todos" : "Marcar todos"}
        type="button"
      >
        <span className={`fd-stage-indicator ${someStaged ? "indeterminate" : ""}`} />
      </button>
      <span className="fd-select-all-label">Todos</span>
      <span className="fd-select-all-count">{stagedCount}/{items.length}</span>
    </div>
  );
}

function ChangeRow({
  item,
  selected,
  onOpenInEditor,
  onSelectChange,
  onStageChange,
  onUnstageChange
}: {
  item: ChangeItemView;
  selected: boolean;
  onOpenInEditor?: (filePath: string) => void;
  onSelectChange: (changeKey: string) => void;
  onStageChange: (filePath: string) => void;
  onUnstageChange: (filePath: string) => void;
}) {
  const changeKey = item.key;

  return (
    <div
      className={`fd-change-row ${selected ? "selected" : ""}`}
      onClick={() => onSelectChange(changeKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onSelectChange(changeKey);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <button
        className={`fd-stage-toggle ${item.staged ? "staged" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (item.staged) {
            onUnstageChange(changeKey);
          } else {
            onStageChange(changeKey);
          }
        }}
        title={item.staged ? "Remover do commit" : "Adicionar ao commit"}
        type="button"
      >
        <span className="fd-stage-indicator" />
      </button>
      {onOpenInEditor ? (
        <button
          className="fd-ignore-toggle"
          onClick={(e) => {
            e.stopPropagation();
            onOpenInEditor(changeKey);
          }}
          title="Abrir no editor"
          type="button"
        >
          <ForgeIcon name="external" size={11} />
        </button>
      ) : null}
      <span className="fd-change-path" style={{ color: fileColor(item.gtype) }}>
        {item.key}
      </span>
    </div>
  );
}

function fileColor(gtype: ChangeItemView["gtype"]): string {
  if (gtype === "U") return "#6b9a4e"; // new/untracked → green
  if (gtype === "D") return "#c0533c"; // deleted → red
  return "#6b8fb0";                    // modified/staged/renamed/conflicted → blue
}
