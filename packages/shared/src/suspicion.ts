import type {
  AgentSuspicion,
  ProjectRecord,
  TerminalSessionRecord
} from "../../types/src/index";

const FIVE_MINUTES = 5 * 60 * 1000;

export function inferMultiAgentSuspicion(
  project: ProjectRecord,
  sessions: TerminalSessionRecord[]
): AgentSuspicion | null {
  const active = sessions.filter((session) => {
    if (session.projectId !== project.id) {
      return false;
    }

    return session.state === "running" || session.state === "waiting-input";
  });

  if (active.length < 2) {
    return null;
  }

  const now = Date.now();
  const recent = active.filter((session) => {
    return now - new Date(session.startedAt).getTime() <= FIVE_MINUTES;
  });

  if (recent.length < 2) {
    return null;
  }

  const confidence = Math.min(0.95, 0.5 + recent.length * 0.15);

  return {
    label: "Multi-agent",
    suspectedSource: recent.map((session) => session.name),
    confidence: Number(confidence.toFixed(2))
  };
}
