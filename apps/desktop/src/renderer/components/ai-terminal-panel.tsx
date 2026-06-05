import { useEffect, useRef, useState } from "react";

import type { AiTerminalSessionRecord, CommandBlock } from "@agent-workbench/types";
import { ForgeIcon } from "./forge-icons";

const ANSI_RE = /\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07]*\x07|[@-_])/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "").replace(/\r/g, "");
}

export interface AiTerminalPanelProps {
  projectId: string;
  sessions: AiTerminalSessionRecord[];
  activeSessionId: string | null;
  blocks: Record<string, CommandBlock[]>;
  onCreateSession: (name: string, provider: "claude" | "codex") => void;
  onSelectSession: (sessionId: string) => void;
  onTerminateSession: (sessionId: string) => void;
  onSendCommand: (sessionId: string, command: string) => void;
  onQuery: (sessionId: string, prompt: string, provider: "claude" | "codex") => Promise<string>;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onClose: () => void;
}

export function AiTerminalPanel({
  sessions,
  activeSessionId,
  blocks,
  onCreateSession,
  onSelectSession,
  onTerminateSession,
  onSendCommand,
  onQuery,
  onClose
}: AiTerminalPanelProps) {
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [provider, setProvider] = useState<"claude" | "codex">("claude");

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0] ?? null;
  const activeBlocks = activeSession ? (blocks[activeSession.id] ?? []) : [];

  function handleCreate() {
    const name = newName.trim() || "AI Terminal";
    onCreateSession(name, provider);
    setNewName("");
    setNewSessionOpen(false);
  }

  return (
    <section className="fd-panel fd-ai-terminal-panel">
      <div className="fd-panel-head">
        <div className="fd-panel-title">
          AI Terminal <span className="count">{sessions.length}</span>
        </div>
        <div className="fd-panel-actions">
          <button
            className="fd-icon-button"
            title="New AI Terminal"
            type="button"
            onClick={() => setNewSessionOpen((v) => !v)}
          >
            <ForgeIcon name="plus" size={12} />
          </button>
          <button
            className="fd-icon-button"
            title="Back to Terminals"
            type="button"
            onClick={onClose}
          >
            <ForgeIcon name="layout" size={12} />
          </button>
        </div>
      </div>

      {newSessionOpen && (
        <div className="fd-ai-new-session">
          <input
            autoFocus
            className="fd-ai-input-field"
            placeholder="Session name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <div className="fd-ai-provider-toggle">
            <button
              className={`fd-ai-provider-btn ${provider === "claude" ? "active" : ""}`}
              type="button"
              onClick={() => setProvider("claude")}
            >
              Claude
            </button>
            <button
              className={`fd-ai-provider-btn ${provider === "codex" ? "active" : ""}`}
              type="button"
              onClick={() => setProvider("codex")}
            >
              Codex
            </button>
          </div>
          <button
            className="fd-primary-button"
            type="button"
            onClick={handleCreate}
          >
            Create
          </button>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="fd-empty-state">
          <ForgeIcon name="terminal" size={28} />
          <span>No AI terminals. Click + to create one.</span>
        </div>
      ) : (
        <div className="fd-ai-terminal-content">
          {sessions.length > 1 && (
            <div className="fd-terminal-tabs" role="tablist">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={s.id === activeSession?.id}
                  className={`fd-terminal-tab ${s.id === activeSession?.id ? "active" : ""}`}
                  type="button"
                  onClick={() => onSelectSession(s.id)}
                >
                  <span className="fd-ai-provider-dot" data-provider={s.provider} />
                  <span className="fd-terminal-tab-label">{s.name}</span>
                  <span className={`fd-ai-state-dot ${s.state}`} />
                </button>
              ))}
            </div>
          )}

          {activeSession && (
            <AiSessionView
              session={activeSession}
              blocks={activeBlocks}
              onSendCommand={(cmd) => onSendCommand(activeSession.id, cmd)}
              onQuery={(prompt) => onQuery(activeSession.id, prompt, activeSession.provider)}
              onTerminate={() => onTerminateSession(activeSession.id)}
            />
          )}
        </div>
      )}
    </section>
  );
}

interface AiSessionViewProps {
  session: AiTerminalSessionRecord;
  blocks: CommandBlock[];
  onSendCommand: (command: string) => void;
  onQuery: (prompt: string) => Promise<string>;
  onTerminate: () => void;
}

function AiSessionView({ session, blocks, onSendCommand, onQuery, onTerminate }: AiSessionViewProps) {
  const [input, setInput] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [suggestedCommand, setSuggestedCommand] = useState<string | null>(null);
  const [suggestedExplanation, setSuggestedExplanation] = useState<string | null>(null);
  const blocksEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isRunning = session.state === "running";

  useEffect(() => {
    blocksEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [blocks]);

  async function handleSubmit() {
    const value = input.trim();
    if (!value) return;

    if (aiMode) {
      setQuerying(true);
      setQueryError(null);
      setSuggestedCommand(null);
      setSuggestedExplanation(null);
      try {
        const raw = await onQuery(value);
        const parsed = JSON.parse(raw) as { command: string; explanation: string };
        setSuggestedCommand(parsed.command);
        setSuggestedExplanation(parsed.explanation);
        setInput(parsed.command);
        setAiMode(false);
      } catch (err) {
        setQueryError(err instanceof Error ? err.message : "Query failed.");
      } finally {
        setQuerying(false);
      }
      return;
    }

    setSuggestedCommand(null);
    setSuggestedExplanation(null);
    onSendCommand(value);
    setInput("");
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
    if (e.key === "Escape") {
      setSuggestedCommand(null);
      setSuggestedExplanation(null);
      setAiMode(false);
    }
  }

  return (
    <div className="fd-ai-session">
      <div className="fd-ai-session-meta">
        <span className="mono fd-ai-cwd">{session.cwd}</span>
        <span className={`fd-ai-state ${session.state}`}>
          {session.state === "running" ? "running" : "idle"}
        </span>
        <button
          className="fd-icon-button"
          title="Terminate session"
          type="button"
          onClick={onTerminate}
        >
          <ForgeIcon name="x" size={11} />
        </button>
      </div>

      <div className="fd-ai-blocks">
        {blocks.length === 0 && (
          <div className="fd-ai-blocks-empty">
            Type a command or ask{" "}
            <span className="fd-ai-provider-label">{session.provider}</span> with{" "}
            <kbd>#</kbd>
          </div>
        )}
        {blocks.map((block) => (
          <BlockCard key={block.id} block={block} />
        ))}
        <div ref={blocksEndRef} />
      </div>

      {suggestedExplanation && (
        <div className="fd-ai-suggestion-note">
          <span className="fd-ai-provider-label">{session.provider}</span>: {suggestedExplanation}
        </div>
      )}

      {queryError && (
        <div className="fd-ai-error">{queryError}</div>
      )}

      <div className="fd-ai-input-bar">
        <button
          className={`fd-ai-mode-toggle ${aiMode ? "active" : ""}`}
          title={aiMode ? "AI mode — press Enter to ask" : "Shell mode — press Enter to run"}
          type="button"
          onClick={() => {
            setAiMode((v) => !v);
            inputRef.current?.focus();
          }}
        >
          {aiMode ? "✦" : "$"}
        </button>
        <input
          ref={inputRef}
          className="fd-ai-input-field"
          disabled={isRunning || querying}
          placeholder={
            isRunning
              ? "Running..."
              : querying
              ? "Asking..."
              : aiMode
              ? `Ask ${session.provider}...`
              : "Enter command..."
          }
          value={input}
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("#") && !aiMode) {
              setAiMode(true);
              setInput(v.slice(1));
            } else {
              setInput(v);
            }
          }}
          onKeyDown={handleKeyDown}
        />
        {suggestedCommand && (
          <button
            className="fd-ai-clear-suggestion"
            title="Clear suggestion"
            type="button"
            onClick={() => {
              setSuggestedCommand(null);
              setSuggestedExplanation(null);
              setInput("");
            }}
          >
            <ForgeIcon name="x" size={10} />
          </button>
        )}
        <button
          className="fd-primary-button fd-ai-run-btn"
          disabled={isRunning || querying || !input.trim()}
          type="button"
          onClick={() => void handleSubmit()}
        >
          {aiMode ? "Ask" : "Run"}
        </button>
      </div>
    </div>
  );
}

function BlockCard({ block }: { block: CommandBlock }) {
  const lines = stripAnsi(block.output).split("\n").filter((l) => l !== "");
  const isRunning = block.isRunning;

  return (
    <div className={`fd-ai-block ${isRunning ? "running" : ""} ${block.exitCode !== null && block.exitCode !== 0 ? "error" : ""}`}>
      <div className="fd-ai-block-head">
        <span className="fd-ai-block-prompt">$</span>
        <span className="fd-ai-block-cmd mono">{block.command}</span>
        <div className="fd-ai-block-meta">
          {isRunning ? (
            <span className="fd-ai-block-running">●</span>
          ) : (
            <span className={`fd-ai-block-exit ${block.exitCode === 0 ? "ok" : "err"}`}>
              {block.exitCode ?? "—"}
            </span>
          )}
          <span className="fd-ai-block-cwd muted">{block.cwd.replace(/^.*\//, "")}</span>
        </div>
      </div>
      {lines.length > 0 && (
        <pre className="fd-ai-block-output">{lines.join("\n")}</pre>
      )}
    </div>
  );
}
