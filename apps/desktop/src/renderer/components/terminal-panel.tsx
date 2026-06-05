import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "xterm";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AuditEvent, TerminalChunkRecord } from "@agent-workbench/types";

import { ForgeIcon } from "./forge-icons";
import { AgentMonogram, StateDot } from "./status-badge";

export type TerminalMode = "focus" | "grid";

export interface TerminalTemplateView {
  name: string;
  type: "agent" | "shell" | "task";
  command: string;
}

export interface TerminalSessionView {
  id: string;
  projectId: string;
  name: string;
  agent: string;
  monogram: string;
  cmd: string;
  cwd: string;
  state: "running" | "waiting" | "completed" | "error" | "idle";
  previewLines: string[];
}

export function isSigintKeyboardEvent(event: KeyboardEvent): boolean {
  return event.type === "keydown" && event.ctrlKey && !event.altKey && !event.metaKey && event.key === "c";
}

interface TerminalPanelProps {
  terminals: TerminalSessionView[];
  templates: TerminalTemplateView[];
  activeTerminalId: string | null;
  terminalMode: TerminalMode;
  auditEvents: AuditEvent[];
  onTerminalModeChange: (mode: TerminalMode) => void;
  onTerminalSelect: (terminalId: string) => void;
  onCreateTerminal: (template: TerminalTemplateView) => void;
  terminalOutput: Record<string, TerminalChunkRecord[]>;
  onTerminalInput: (sessionId: string, input: string) => void;
  onTerminalResize: (sessionId: string, cols: number, rows: number) => void;
  onTerminateTerminal: (sessionId: string) => void;
  onRestartTerminal: (sessionId: string) => void;
}

export function TerminalPanel({
  terminals,
  templates,
  activeTerminalId,
  terminalMode,
  auditEvents,
  onTerminalModeChange,
  onTerminalSelect,
  onCreateTerminal,
  terminalOutput,
  onTerminalInput,
  onTerminalResize,
  onTerminateTerminal,
  onRestartTerminal
}: TerminalPanelProps) {
  const [auditOpen, setAuditOpen] = useState(false);
  const activeTerminal = useMemo(
    () => terminals.find((terminal) => terminal.id === activeTerminalId) ?? terminals[0],
    [activeTerminalId, terminals]
  );

  return (
    <section className="fd-panel fd-terminal-panel">
      <div className="fd-panel-head">
        <div className="fd-panel-title">
          Terminals <span className="count">{terminals.length}</span>
        </div>

        <div className="fd-panel-actions">
          {auditEvents.length > 0 && (
            <button
              className={`fd-audit-badge ${auditOpen ? "open" : ""}`}
              onClick={() => setAuditOpen((v) => !v)}
              title={`${auditEvents.length} audit event${auditEvents.length !== 1 ? "s" : ""} detected`}
              type="button"
            >
              <ForgeIcon name="shield" size={11} />
              <span>{auditEvents.length}</span>
            </button>
          )}
          <button
            className={`fd-icon-button ${terminalMode === "focus" ? "active" : ""}`}
            onClick={() => onTerminalModeChange("focus")}
            type="button"
          >
            <ForgeIcon name="layout" size={12} />
          </button>
          <button
            className={`fd-icon-button ${terminalMode === "grid" ? "active" : ""}`}
            onClick={() => onTerminalModeChange("grid")}
            type="button"
          >
            <ForgeIcon name="grid" size={12} />
          </button>
          <button className="fd-icon-button" type="button">
            <ForgeIcon name="more" size={12} />
          </button>
        </div>
      </div>

      {auditOpen && auditEvents.length > 0 && (
        <AuditLog events={auditEvents} terminals={terminals} />
      )}

      {templates.length > 0 ? (
        <div className="fd-template-list">
          {templates.map((template) => (
            <button
              className="fd-secondary-button"
              key={`${template.name}-${template.command}`}
              onClick={() => onCreateTerminal(template)}
              type="button"
            >
              <ForgeIcon name="plus" size={12} />
              {template.name}
            </button>
          ))}
        </div>
      ) : null}

      {terminals.length === 0 ? (
        <div className="fd-empty-state">
          <ForgeIcon name="terminal" size={28} />
          <span>No terminals in this project.</span>
        </div>
      ) : terminalMode === "focus" ? (
        <div className="fd-terminal-content">
          <div className="fd-terminal-tabs" role="tablist" aria-label="Terminal tabs">
            {terminals.map((terminal) => (
              <button
                aria-selected={terminal.id === activeTerminal?.id}
                className={`fd-terminal-tab ${terminal.id === activeTerminal?.id ? "active" : ""}`}
                key={terminal.id}
                onClick={() => onTerminalSelect(terminal.id)}
                role="tab"
                title={terminal.name}
                type="button"
              >
                <AgentMonogram agent={terminal.agent} monogram={terminal.monogram} />
                <span className="fd-terminal-tab-label">{terminal.name}</span>
                <StateDot state={terminal.state} />
              </button>
            ))}
          </div>

          {activeTerminal ? (
            <>
              <div className="fd-terminal-meta">
                <div className="left">
                  <AgentMonogram
                    agent={activeTerminal.agent}
                    monogram={activeTerminal.monogram}
                  />
                  <StateDot state={activeTerminal.state} />
                  <span className="mono">{activeTerminal.name}</span>
                  <span>{activeTerminal.cmd}</span>
                </div>
                <div className="right">
                  <button
                    className="fd-icon-button"
                    onClick={() => onRestartTerminal(activeTerminal.id)}
                    title="Restart terminal"
                    type="button"
                  >
                    <ForgeIcon name="restart" size={12} />
                  </button>
                  <button
                    className="fd-icon-button"
                    onClick={() => onTerminateTerminal(activeTerminal.id)}
                    title="Kill terminal"
                    type="button"
                  >
                    <ForgeIcon name="x" size={12} />
                  </button>
                  <span>{activeTerminal.cwd}</span>
                </div>
              </div>
              <TerminalCanvas
                chunks={terminalOutput[activeTerminal.id] ?? []}
                terminal={activeTerminal}
                onInput={onTerminalInput}
                onResize={onTerminalResize}
              />
            </>
          ) : null}
        </div>
      ) : (
        <div className="fd-terminal-grid">
          {terminals.map((terminal) => (
            <button
              className={`fd-terminal-cell ${terminal.id === activeTerminal?.id ? "active" : ""}`}
              key={terminal.id}
              onClick={() => onTerminalSelect(terminal.id)}
              type="button"
            >
              <div className="fd-terminal-cell-head">
                <AgentMonogram agent={terminal.agent} monogram={terminal.monogram} />
                <span>{terminal.name}</span>
                <StateDot state={terminal.state} />
              </div>
              <TerminalPreview terminal={terminal} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function TerminalCanvas({
  terminal,
  chunks,
  onInput,
  onResize
}: {
  terminal: TerminalSessionView;
  chunks: TerminalChunkRecord[];
  onInput: (sessionId: string, input: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const lastChunkIdsRef = useRef<string[]>([]);
  const onInputRef = useRef(onInput);
  const onResizeRef = useRef(onResize);
  const terminalStateRef = useRef(terminal.state);

  onInputRef.current = onInput;
  onResizeRef.current = onResize;
  terminalStateRef.current = terminal.state;

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const xterm = new Terminal({
      cursorBlink: true,
      fontFamily: "var(--mono)",
      fontSize: 12,
      lineHeight: 1.4,
      scrollback: 5000,
      theme: {
        background: "#0a0907",
        foreground: "#f4ede0",
        cursor: "#d49b5b",
        cursorAccent: "#0a0907"
      }
    });
    const fitAddon = new FitAddon();

    xterm.loadAddon(fitAddon);
    xterm.open(hostRef.current);
    xterm.focus();
    fitAddon.fit();
    onResizeRef.current(terminal.id, xterm.cols, xterm.rows);

    xterm.attachCustomKeyEventHandler((event) => {
      if (isSigintKeyboardEvent(event) && !xterm.hasSelection()) {
        onInputRef.current(terminal.id, "\u0003");
        event.preventDefault();
        return false;
      }

      return true;
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      onResizeRef.current(terminal.id, xterm.cols, xterm.rows);
    });

    resizeObserver.observe(hostRef.current);

    const focusTerminal = () => {
      xterm.focus();
    };

    hostRef.current.addEventListener("mousedown", focusTerminal);

    const subscription = xterm.onData((data) => {
      if (terminalStateRef.current === "completed" || terminalStateRef.current === "error") {
        return;
      }

      onInputRef.current(terminal.id, data);
    });

    xtermRef.current = xterm;
    lastChunkIdsRef.current = [];

    return () => {
      subscription.dispose();
      resizeObserver.disconnect();
      hostRef.current?.removeEventListener("mousedown", focusTerminal);
      xterm.dispose();
      xtermRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal.id]);

  useEffect(() => {
    const xterm = xtermRef.current;

    if (!xterm) {
      return;
    }

    const currentChunkIds = chunks.map((chunk) => chunk.id);
    const previousChunkIds = lastChunkIdsRef.current;
    const canAppendOnly =
      previousChunkIds.length <= currentChunkIds.length &&
      previousChunkIds.every((chunkId, index) => chunkId === currentChunkIds[index]);

    if (!canAppendOnly) {
      xterm.reset();
      xterm.write(chunks.map((chunk) => chunk.content).join(""));
      lastChunkIdsRef.current = currentChunkIds;
      return;
    }

    const nextChunks = chunks.slice(previousChunkIds.length);

    if (nextChunks.length > 0) {
      xterm.write(nextChunks.map((chunk) => chunk.content).join(""));
      lastChunkIdsRef.current = currentChunkIds;
    }
  }, [chunks]);

  return <div className="fd-xterm-host" ref={hostRef} />;
}

function TerminalPreview({ terminal }: { terminal: TerminalSessionView }) {
  return (
    <div className="fd-terminal-canvas compact">
      {terminal.previewLines.length > 0 ? (
        terminal.previewLines.map((line, index) => (
          <div className="fd-terminal-line" key={`${terminal.id}-${index}`}>
            {line || " "}
          </div>
        ))
      ) : (
        <div className="fd-terminal-line dim">No output yet.</div>
      )}
    </div>
  );
}

function AuditLog({
  events,
  terminals
}: {
  events: AuditEvent[];
  terminals: TerminalSessionView[];
}) {
  const sessionName = (sessionId: string) =>
    terminals.find((t) => t.id === sessionId)?.name ?? sessionId.slice(0, 8);

  return (
    <div className="fd-audit-log">
      <div className="fd-audit-log-title">
        <ForgeIcon name="shield" size={11} />
        Audit Log
      </div>
      <div className="fd-audit-log-list">
        {events.map((event) => (
          <div className={`fd-audit-row risk-${event.risk}`} key={event.id}>
            <div className="fd-audit-row-head">
              <span className={`fd-audit-risk risk-${event.risk}`}>{event.risk}</span>
              <span className="fd-audit-session mono">{sessionName(event.sessionId)}</span>
              <span className="fd-audit-reason">{event.reason}</span>
              <span className="fd-audit-time muted">
                {new Date(event.detectedAt).toLocaleTimeString()}
              </span>
            </div>
            <code className="fd-audit-cmd">{event.command}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
