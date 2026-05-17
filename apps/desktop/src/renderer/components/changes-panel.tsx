import { useRef, useMemo, useState } from "react";

import { ForgeIcon } from "./forge-icons";
import { AgentMonogram } from "./status-badge";

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
  onGitIgnore: (filePath: string) => void;
  onShowIssues?: () => void;
  onShowGitHubConfig?: () => void;
  onShowTaskLoop?: () => void;
  onCommit: (message: string) => Promise<void>;
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
  onGitIgnore,
  onShowIssues,
  onShowGitHubConfig,
  onShowTaskLoop,
  onCommit,
  onGenerateCommitMessage
}: ChangesPanelProps) {
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showCommitForm, setShowCommitForm] = useState(false);
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
    if (!commitMessage.trim()) {
      return;
    }
    setIsCommitting(true);
    setCommitError(null);
    try {
      await onCommit(commitMessage.trim());
      setCommitMessage("");
      setShowCommitForm(false);
    } catch (error) {
      setCommitError(error instanceof Error ? error.message : "Commit failed.");
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
        {groups.map((group) => {
          const filteredItems = group.items.filter((item) =>
            item.key.toLowerCase().includes(filter.toLowerCase())
          );

          if (filteredItems.length === 0) {
            return null;
          }

          return (
            <div key={group.group}>
              <button
                className={`fd-group-header ${group.group === "Conflicted" ? "conflicted" : ""}`}
                onClick={() =>
                  setCollapsed((current) => ({
                    ...current,
                    [group.group]: !current[group.group]
                  }))
                }
                type="button"
              >
                <ForgeIcon
                  name={collapsed[group.group] ? "chevronRight" : "chevronDown"}
                  size={10}
                />
                {group.group === "Conflicted" ? (
                  <ForgeIcon name="alert" size={11} />
                ) : null}
                <span>{group.group}</span>
                <span className="count">{filteredItems.length}</span>
              </button>

              {collapsed[group.group]
                ? null
                : filteredItems.map((item) => (
                    <ChangeRow
                      item={item}
                      key={item.key}
                      onGitIgnore={onGitIgnore}
                      onSelectChange={onSelectChange}
                      onStageChange={onStageChange}
                      onUnstageChange={onUnstageChange}
                      selected={selectedChangeKey === item.key}
                    />
                  ))}
            </div>
          );
        })}
      </div>

      {gitError ? (
        <div className="fd-git-error">
          <ForgeIcon name="alert" size={11} />
          <span>{gitError}</span>
        </div>
      ) : null}

      {showCommitForm ? (
        <div className="fd-commit-form">
          <textarea
            className="fd-commit-textarea"
            disabled={isCommitting}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message…"
            ref={textareaRef}
            rows={4}
            value={commitMessage}
          />
          <button
            className="fd-generate-button"
            disabled={!canCommit || isGenerating || isCommitting}
            onClick={handleGenerate}
            type="button"
          >
            {isGenerating ? "Generating…" : "Generate with AI"}
          </button>
          {commitError ? (
            <div className="fd-commit-error">
              <ForgeIcon name="alert" size={11} />
              <span>{commitError}</span>
            </div>
          ) : null}
          <div className="fd-commit-actions">
            <button
              className="fd-secondary-button"
              disabled={isCommitting}
              onClick={() => { setShowCommitForm(false); setCommitError(null); }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="fd-primary-button"
              disabled={!commitMessage.trim() || isCommitting}
              onClick={handleCommit}
              type="button"
            >
              {isCommitting ? "Committing…" : "Commit"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="fd-changes-summary">
        <span className="add">+{metrics.totalAdd}</span>
        <span className="del">−{metrics.totalDel}</span>
        <span>{metrics.stagedCount}/{metrics.totalFiles} staged</span>
        {!canCommit ? (
          <span className="fd-stage-hint">Marque arquivos na coluna esquerda para montar o commit.</span>
        ) : null}
        <div className="actions">
          <button className="fd-secondary-button" type="button">
            Reset
          </button>
          <button
            className="fd-primary-button"
            disabled={!canCommit}
            onClick={() => {
              setCommitError(null);
              setShowCommitForm(true);
            }}
            title={canCommit ? "Commit staged files" : "Marque arquivos para incluir no commit"}
            type="button"
          >
            Commit
          </button>
        </div>
      </div>
    </section>
  );
}

function ChangeRow({
  item,
  selected,
  onGitIgnore,
  onSelectChange,
  onStageChange,
  onUnstageChange
}: {
  item: ChangeItemView;
  selected: boolean;
  onGitIgnore: (filePath: string) => void;
  onSelectChange: (changeKey: string) => void;
  onStageChange: (filePath: string) => void;
  onUnstageChange: (filePath: string) => void;
}) {
  const changeKey = item.key;

  return (
    <>
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
          <span className="fd-stage-label">{item.staged ? "Staged" : "Stage"}</span>
        </button>
        <button
          className="fd-ignore-toggle"
          onClick={(e) => {
            e.stopPropagation();
            onGitIgnore(changeKey);
          }}
          title="Add to .gitignore"
          type="button"
        >
          <ForgeIcon name="ignore" size={11} />
        </button>
        <span className={`fd-git-type ${item.gtype}`}>{item.gtype}</span>
        <span className="fd-change-path">
          <span className="dir">{item.path}</span>
          <span className="file">{item.file}</span>
        </span>
        <span className="fd-change-stats">
          {item.add > 0 ? <span className="add">+{item.add}</span> : null}
          {item.del > 0 ? <span className="del">−{item.del}</span> : null}
        </span>
      </div>

      {item.sources.length > 0 ? (
        <div className="fd-change-source">
          <span className={`fd-inline-badge ${item.multi ? "warn" : "info"}`}>
            <ForgeIcon name="alert" size={9} />
            {item.multi ? "Multi-agent" : "Source"}
          </span>
          {item.confidence !== undefined ? (
            <span className={`fd-confidence ${toConfidenceClass(item.confidence)}`}>
              {toConfidenceLabel(item.confidence)}
            </span>
          ) : null}
          <span>suspected:</span>
          {item.sources.map((source) => (
            <span className="fd-source-pill" key={`${changeKey}-${source.agent}-${source.terminal}`}>
              <AgentMonogram
                agent={source.agent}
                monogram={source.agent.charAt(0).toUpperCase()}
              />
              <span>{source.agent}</span>
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

function toConfidenceLabel(c: number): string {
  if (c >= 0.8) return "High";
  if (c >= 0.5) return "Medium";
  return "Low";
}

function toConfidenceClass(c: number): string {
  if (c >= 0.8) return "high";
  if (c >= 0.5) return "medium";
  return "low";
}
