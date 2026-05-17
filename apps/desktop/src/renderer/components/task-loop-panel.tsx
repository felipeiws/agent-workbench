import { useEffect, useState } from "react";

import type { TaskLoopDefinition, TaskLoopRecord, TaskLoopTaskRecord } from "@agent-workbench/types";
import type { TaskLoopProgressEvent } from "@agent-workbench/shared";
import { getDesktopApi } from "../lib/desktop-api";
import {
  deleteTaskLoop,
  getTaskLoopTasks,
  importTaskLoopDefinition,
  listTaskLoops,
  pauseTaskLoop,
  resumeTaskLoop,
  startTaskLoop,
  stopTaskLoop
} from "../lib/queries";
import { ForgeIcon } from "./forge-icons";

type AgentChoice = "claude" | "codex";

interface TaskLoopPanelProps {
  projectId: string;
  onShowChanges: () => void;
  onShowTerminal: (sessionId: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  idle: "Aguardando",
  running: "Executando",
  paused: "Pausado",
  completed: "Concluído",
  failed: "Falhou",
  stopped: "Parado"
};

const TASK_STATUS_COLOR: Record<string, string> = {
  pending: "var(--fg-3)",
  running: "var(--state-run)",
  completed: "var(--state-ok)",
  failed: "var(--state-err)"
};

export function TaskLoopPanel({ projectId, onShowChanges, onShowTerminal }: TaskLoopPanelProps) {
  const [loops, setLoops] = useState<TaskLoopRecord[]>([]);
  const [selectedLoopId, setSelectedLoopId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskLoopTaskRecord[]>([]);
  const [pendingDefinition, setPendingDefinition] = useState<TaskLoopDefinition | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentChoice>("claude");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLoop = loops.find((l) => l.id === selectedLoopId) ?? null;

  useEffect(() => {
    void listTaskLoops(projectId).then(setLoops);
  }, [projectId]);

  useEffect(() => {
    if (!selectedLoopId) return;
    void getTaskLoopTasks(selectedLoopId).then(setTasks);
  }, [selectedLoopId]);

  useEffect(() => {
    return getDesktopApi().onTaskLoopProgress((event: TaskLoopProgressEvent) => {
      setLoops((current) =>
        current.map((loop) =>
          loop.id === event.loopId
            ? { ...loop, status: event.status, currentTaskIndex: event.currentTaskIndex }
            : loop
        )
      );

      if (event.loopId === selectedLoopId) {
        setTasks((current) =>
          current.map((task) =>
            task.taskIndex === event.currentTaskIndex
              ? { ...task, status: event.taskStatus }
              : task
          )
        );
      }
    });
  }, [selectedLoopId]);

  async function handleImport() {
    setError(null);
    try {
      const def = await importTaskLoopDefinition(projectId);
      if (def) setPendingDefinition(def);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao importar.");
    }
  }

  async function handleStart() {
    if (!pendingDefinition) return;
    setLoading(true);
    setError(null);
    try {
      const loop = await startTaskLoop(projectId, selectedAgent, pendingDefinition);
      setLoops((current) => [loop, ...current]);
      setSelectedLoopId(loop.id);
      setPendingDefinition(null);
      const loopTasks = await getTaskLoopTasks(loop.id);
      setTasks(loopTasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao iniciar loop.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePause() {
    if (!selectedLoopId) return;
    await pauseTaskLoop(selectedLoopId);
    setLoops((current) =>
      current.map((l) => (l.id === selectedLoopId ? { ...l, status: "paused" } : l))
    );
  }

  async function handleResume() {
    if (!selectedLoopId) return;
    await resumeTaskLoop(selectedLoopId);
    setLoops((current) =>
      current.map((l) => (l.id === selectedLoopId ? { ...l, status: "running" } : l))
    );
  }

  async function handleStop() {
    if (!selectedLoopId) return;
    await stopTaskLoop(selectedLoopId);
    setLoops((current) =>
      current.map((l) =>
        l.id === selectedLoopId ? { ...l, status: "stopped" } : l
      )
    );
  }

  async function handleDelete(loopId: string) {
    await deleteTaskLoop(loopId);
    setLoops((current) => current.filter((l) => l.id !== loopId));
    if (selectedLoopId === loopId) {
      setSelectedLoopId(null);
      setTasks([]);
    }
  }

  return (
    <aside className="fd-panel fd-taskloop-panel">
      <header className="fd-panel-head">
        <span className="fd-panel-title">Task Loop</span>
        <div className="fd-panel-actions">
          <button className="fd-icon-btn" title="Voltar para Changes" onClick={onShowChanges}>
            <ForgeIcon name="x" size={14} />
          </button>
        </div>
      </header>

      <div className="fd-taskloop-body">
        {pendingDefinition ? (
          <div className="fd-taskloop-import-confirm">
            <div className="fd-taskloop-def-name">{pendingDefinition.name}</div>
            <div className="fd-taskloop-def-meta">
              {pendingDefinition.tasks.length} tarefas
              {pendingDefinition.prePrompt ? ` · pre: ${pendingDefinition.prePrompt}` : ""}
              {pendingDefinition.postPrompt ? ` · post: ${pendingDefinition.postPrompt}` : ""}
            </div>

            <div className="fd-taskloop-agent-row">
              <span className="fd-taskloop-label">Agente</span>
              <div className="fd-taskloop-agent-btns">
                <button
                  className={`fd-taskloop-agent-btn${selectedAgent === "claude" ? " active" : ""}`}
                  onClick={() => setSelectedAgent("claude")}
                >
                  Claude
                </button>
                <button
                  className={`fd-taskloop-agent-btn${selectedAgent === "codex" ? " active" : ""}`}
                  onClick={() => setSelectedAgent("codex")}
                >
                  Codex
                </button>
              </div>
            </div>

            <div className="fd-taskloop-confirm-actions">
              <button
                className="fd-btn fd-btn-primary"
                onClick={() => void handleStart()}
                disabled={loading}
              >
                {loading ? "Iniciando…" : "Iniciar Loop"}
              </button>
              <button className="fd-btn" onClick={() => setPendingDefinition(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="fd-taskloop-actions-row">
            <button className="fd-btn fd-btn-primary" onClick={() => void handleImport()}>
              Importar JSON
            </button>
          </div>
        )}

        {error && <div className="fd-taskloop-error">{error}</div>}

        {selectedLoop && (
          <div className="fd-taskloop-active">
            <div className="fd-taskloop-loop-head">
              <span className="fd-taskloop-loop-name">{selectedLoop.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  className="fd-taskloop-status"
                  style={{ color: statusColor(selectedLoop.status) }}
                >
                  {STATUS_LABEL[selectedLoop.status] ?? selectedLoop.status}
                </span>
                {selectedLoop.sessionId && (
                  <button
                    className="fd-icon-btn"
                    title="Ver terminal do agente"
                    onClick={() => onShowTerminal(selectedLoop.sessionId!)}
                  >
                    <ForgeIcon name="terminal" size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="fd-taskloop-progress-bar">
              <div
                className="fd-taskloop-progress-fill"
                style={{
                  width: `${Math.round(
                    (completedCount(tasks) / Math.max(selectedLoop.totalTasks, 1)) * 100
                  )}%`
                }}
              />
            </div>
            <div className="fd-taskloop-progress-label">
              {completedCount(tasks)} / {selectedLoop.totalTasks} tarefas
            </div>

            {(selectedLoop.status === "running" || selectedLoop.status === "paused") && (
              <div className="fd-taskloop-controls">
                {selectedLoop.status === "running" ? (
                  <button className="fd-btn" onClick={() => void handlePause()}>
                    Pausar
                  </button>
                ) : (
                  <button className="fd-btn fd-btn-primary" onClick={() => void handleResume()}>
                    Retomar
                  </button>
                )}
                <button className="fd-btn fd-btn-danger" onClick={() => void handleStop()}>
                  Parar
                </button>
              </div>
            )}

            <ul className="fd-taskloop-task-list">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className={`fd-taskloop-task${task.taskIndex === selectedLoop.currentTaskIndex && selectedLoop.status === "running" ? " active" : ""}`}
                >
                  <span
                    className="fd-taskloop-task-dot"
                    style={{ background: TASK_STATUS_COLOR[task.status] ?? "var(--fg-3)" }}
                  />
                  <span className="fd-taskloop-task-title">{task.title}</span>
                  <span className="fd-taskloop-task-status">
                    {task.status === "running" ? "…" : task.status === "completed" ? "✓" : task.status === "failed" ? "✗" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loops.length > 0 && (
          <div className="fd-taskloop-history">
            <div className="fd-taskloop-section-label">Loops</div>
            <ul className="fd-taskloop-loop-list">
              {loops.map((loop) => (
                <li
                  key={loop.id}
                  className={`fd-taskloop-loop-item${loop.id === selectedLoopId ? " selected" : ""}`}
                  onClick={() => setSelectedLoopId(loop.id)}
                >
                  <span className="fd-taskloop-loop-item-name">{loop.name}</span>
                  <span
                    className="fd-taskloop-loop-item-status"
                    style={{ color: statusColor(loop.status) }}
                  >
                    {STATUS_LABEL[loop.status] ?? loop.status}
                  </span>
                  <button
                    className="fd-icon-btn fd-taskloop-delete-btn"
                    title="Deletar loop"
                    onClick={(e) => { e.stopPropagation(); void handleDelete(loop.id); }}
                  >
                    <ForgeIcon name="trash" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}

function completedCount(tasks: TaskLoopTaskRecord[]): number {
  return tasks.filter((t) => t.status === "completed").length;
}

function statusColor(status: string): string {
  if (status === "running") return "var(--state-run)";
  if (status === "completed") return "var(--state-ok)";
  if (status === "failed" || status === "stopped") return "var(--state-err)";
  if (status === "paused") return "var(--state-wait)";
  return "var(--fg-2)";
}
