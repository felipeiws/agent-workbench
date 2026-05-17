import { useState } from "react";

import type { LoadedProjectConfig, ProjectGitHubConfig } from "@agent-workbench/types";

import { saveGitHubConfig } from "../lib/queries";
import { ForgeIcon } from "./forge-icons";

interface GithubConfigPanelProps {
  projectId: string;
  currentConfig: ProjectGitHubConfig | null;
  onClose: () => void;
  onSaved: (config: LoadedProjectConfig) => void;
}

function labelsToString(labels: string[]): string {
  return labels.join(", ");
}

function stringToLabels(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function GithubConfigPanel({
  projectId,
  currentConfig,
  onClose,
  onSaved
}: GithubConfigPanelProps) {
  const [owner, setOwner] = useState(currentConfig?.owner ?? "");
  const [repo, setRepo] = useState(currentConfig?.repo ?? "");
  const [labelsRaw, setLabelsRaw] = useState(
    currentConfig ? labelsToString(currentConfig.labels) : ""
  );
  const [watchIssues, setWatchIssues] = useState(currentConfig?.watchIssues ?? false);
  const [agentCommand, setAgentCommand] = useState(currentConfig?.agentCommand ?? "");
  const [pollSeconds, setPollSeconds] = useState(
    currentConfig?.pollIntervalMs ? String(currentConfig.pollIntervalMs / 1000) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const labels = stringToLabels(labelsRaw);

    if (!owner.trim()) {
      setError("Owner is required.");
      return;
    }
    if (!repo.trim()) {
      setError("Repository is required.");
      return;
    }
    if (labels.length === 0) {
      setError("At least one label is required.");
      return;
    }

    const pollMs = pollSeconds.trim()
      ? Number(pollSeconds) * 1000
      : undefined;

    if (pollMs !== undefined && (isNaN(pollMs) || pollMs < 10000)) {
      setError("Poll interval must be at least 10 seconds.");
      return;
    }

    const github: ProjectGitHubConfig = {
      owner: owner.trim(),
      repo: repo.trim(),
      labels,
      watchIssues,
      ...(agentCommand.trim() ? { agentCommand: agentCommand.trim() } : {}),
      ...(pollMs !== undefined ? { pollIntervalMs: pollMs } : {})
    };

    setSaving(true);
    setError(null);

    try {
      const loaded = await saveGitHubConfig(projectId, github);
      onSaved(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save configuration.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    setError(null);

    try {
      const loaded = await saveGitHubConfig(projectId, null);
      onSaved(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove configuration.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="fd-panel fd-changes-panel">
      <div className="fd-panel-head">
        <div className="fd-panel-tabs">
          <button className="fd-panel-tab" onClick={onClose} type="button">
            Changes
          </button>
          <button className="fd-panel-tab active" type="button">
            <ForgeIcon name="github" size={11} />
            GitHub
          </button>
        </div>
      </div>

      <div className="fd-scroll fd-config-form">
        <div className="fd-config-section">
          <div className="fd-config-section-title">Repository</div>

          <div className="fd-form-row">
            <div className="fd-form-group">
              <label className="fd-form-label" htmlFor="gh-owner">Owner</label>
              <input
                className="fd-form-input"
                id="gh-owner"
                onChange={(e) => setOwner(e.target.value)}
                placeholder="your-org"
                type="text"
                value={owner}
              />
            </div>
            <div className="fd-form-group">
              <label className="fd-form-label" htmlFor="gh-repo">Repository</label>
              <input
                className="fd-form-input"
                id="gh-repo"
                onChange={(e) => setRepo(e.target.value)}
                placeholder="my-repo"
                type="text"
                value={repo}
              />
            </div>
          </div>

          <div className="fd-form-group">
            <label className="fd-form-label" htmlFor="gh-labels">
              Labels
              <span className="fd-form-hint">comma-separated, e.g. agent, ai-task</span>
            </label>
            <input
              className="fd-form-input"
              id="gh-labels"
              onChange={(e) => setLabelsRaw(e.target.value)}
              placeholder="agent"
              type="text"
              value={labelsRaw}
            />
          </div>
        </div>

        <div className="fd-config-section">
          <div className="fd-config-section-title">Dispatcher</div>

          <div className="fd-form-group">
            <label className="fd-form-label" htmlFor="gh-agent">Agent Command</label>
            <input
              className="fd-form-input"
              id="gh-agent"
              onChange={(e) => setAgentCommand(e.target.value)}
              placeholder="claude"
              type="text"
              value={agentCommand}
            />
          </div>

          <div className="fd-form-group">
            <label className="fd-form-label" htmlFor="gh-poll">
              Poll Interval (seconds)
              <span className="fd-form-hint">minimum 10, default 30</span>
            </label>
            <input
              className="fd-form-input fd-form-input--narrow"
              id="gh-poll"
              min={10}
              onChange={(e) => setPollSeconds(e.target.value)}
              placeholder="30"
              type="number"
              value={pollSeconds}
            />
          </div>

          <div className="fd-form-toggle-row">
            <label className="fd-form-toggle-label" htmlFor="gh-watch">
              <div className="fd-form-toggle-text">
                <span>Watch issues automatically</span>
                <span className="fd-form-hint">
                  Polls GitHub and dispatches matching issues to the agent
                </span>
              </div>
              <button
                className={`fd-toggle ${watchIssues ? "on" : ""}`}
                id="gh-watch"
                onClick={() => setWatchIssues((v) => !v)}
                type="button"
                role="switch"
                aria-checked={watchIssues}
              >
                <span className="fd-toggle-knob" />
              </button>
            </label>
          </div>
        </div>

        <div className="fd-config-section fd-config-token-hint">
          <ForgeIcon name="alert" size={11} />
          <span>
            Token required: set <code>GITHUB_TOKEN</code> env var or write to{" "}
            <code>~/.config/agent-workbench/github-token</code>
          </span>
        </div>

        {error ? (
          <div className="fd-git-error">
            <ForgeIcon name="alert" size={11} />
            <span>{error}</span>
          </div>
        ) : null}
      </div>

      <div className="fd-config-footer">
        {currentConfig ? (
          <button
            className="fd-secondary-button fd-config-remove"
            disabled={saving}
            onClick={() => void handleRemove()}
            type="button"
          >
            Disable
          </button>
        ) : null}
        <button
          className="fd-primary-button"
          disabled={saving}
          onClick={() => void handleSave()}
          type="button"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}
