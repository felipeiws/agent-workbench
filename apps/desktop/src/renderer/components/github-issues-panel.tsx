import { useEffect, useState } from "react";

import type { GitHubIssue, GitHubIssueRecord } from "@agent-workbench/types";

import { dispatchGitHubIssue, fetchDispatchedIssues, fetchGitHubIssues } from "../lib/queries";
import { ForgeIcon } from "./forge-icons";

interface GithubIssuesPanelProps {
  projectId: string;
  onShowChanges: () => void;
  onIssueDispatched: (sessionId: string) => void;
  onShowGitHubConfig: () => void;
}

export function GithubIssuesPanel({
  projectId,
  onShowChanges,
  onIssueDispatched,
  onShowGitHubConfig
}: GithubIssuesPanelProps) {
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [dispatched, setDispatched] = useState<GitHubIssueRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [dispatchingNumber, setDispatchingNumber] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [projectId]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [openIssues, dispatchedIssues] = await Promise.all([
        fetchGitHubIssues(projectId),
        fetchDispatchedIssues(projectId)
      ]);
      setIssues(openIssues);
      setDispatched(dispatchedIssues);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load issues");
    } finally {
      setLoading(false);
    }
  }

  async function handleDispatch(issueNumber: number) {
    setDispatchingNumber(issueNumber);
    setError(null);

    try {
      const event = await dispatchGitHubIssue(projectId, issueNumber);
      const [nextIssues, nextDispatched] = await Promise.all([
        fetchGitHubIssues(projectId),
        fetchDispatchedIssues(projectId)
      ]);
      setIssues(nextIssues);
      setDispatched(nextDispatched);
      onIssueDispatched(event.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setDispatchingNumber(null);
    }
  }

  const dispatchedByNumber = new Map(dispatched.map((d) => [d.issueNumber, d]));
  const pendingCount = issues.filter((i) => !dispatchedByNumber.has(i.number)).length;

  return (
    <section className="fd-panel fd-changes-panel">
      <div className="fd-panel-head">
        <div className="fd-panel-tabs">
          <button className="fd-panel-tab" onClick={onShowChanges} type="button">
            Changes
          </button>
          <button className="fd-panel-tab active" type="button">
            Issues
            {pendingCount > 0 ? <span className="count">{pendingCount}</span> : null}
          </button>
        </div>
        <div className="fd-panel-actions">
          <button
            className="fd-icon-button"
            onClick={onShowGitHubConfig}
            title="GitHub settings"
            type="button"
          >
            <ForgeIcon name="github" size={13} />
          </button>
          <button
            className="fd-icon-button"
            disabled={loading}
            onClick={() => void load()}
            title="Refresh"
            type="button"
          >
            <ForgeIcon name="restart" size={12} />
          </button>
        </div>
      </div>

      <div className="fd-scroll fd-issues-list">
        {loading ? (
          <div className="fd-issues-empty">Loading…</div>
        ) : error ? (
          <div className="fd-git-error">
            <ForgeIcon name="alert" size={11} />
            <span>{error}</span>
          </div>
        ) : issues.length === 0 ? (
          <div className="fd-issues-empty">No open issues with configured labels</div>
        ) : (
          issues.map((issue) => {
            const record = dispatchedByNumber.get(issue.number);
            const isDispatched = record !== undefined;
            const isDispatching = dispatchingNumber === issue.number;

            return (
              <div
                className={`fd-issue-row ${isDispatched ? "dispatched" : ""}`}
                key={issue.number}
              >
                <div className="fd-issue-meta">
                  <span className="fd-issue-number">#{issue.number}</span>
                  {isDispatched ? (
                    <span className="fd-inline-badge info">dispatched</span>
                  ) : null}
                </div>
                <div className="fd-issue-title">{issue.title}</div>
                {issue.labels.length > 0 ? (
                  <div className="fd-issue-labels">
                    {issue.labels.map((label) => (
                      <span className="fd-label-chip" key={label}>
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
                {isDispatched && record?.sessionId ? (
                  <div className="fd-issue-session">
                    <ForgeIcon name="terminal" size={10} />
                    <span className="mono">Issue #{issue.number}</span>
                  </div>
                ) : !isDispatched ? (
                  <button
                    className="fd-secondary-button fd-dispatch-btn"
                    disabled={isDispatching}
                    onClick={() => void handleDispatch(issue.number)}
                    type="button"
                  >
                    <ForgeIcon name="workflow" size={11} />
                    {isDispatching ? "Dispatching…" : "Dispatch"}
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="fd-changes-summary">
        <span>{dispatched.length} dispatched</span>
        <span>{pendingCount} pending</span>
      </div>
    </section>
  );
}
