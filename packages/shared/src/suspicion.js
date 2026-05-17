const RECENT_THRESHOLD_MS = 60 * 1_000;
const MODERATE_THRESHOLD_MS = 5 * 60 * 1_000;
export function inferMultiAgentSuspicion(sessions, recentActivityAt = new Map()) {
    const active = sessions.filter((s) => s.state === "running" || s.state === "waiting-input");
    if (active.length === 0) {
        return null;
    }
    const now = Date.now();
    const recentSessions = active.filter((s) => {
        const lastAt = recentActivityAt.get(s.id) ?? 0;
        return now - lastAt <= RECENT_THRESHOLD_MS;
    });
    const moderateSessions = active.filter((s) => {
        const lastAt = recentActivityAt.get(s.id) ?? new Date(s.startedAt).getTime();
        return now - lastAt <= MODERATE_THRESHOLD_MS;
    });
    const candidates = recentSessions.length > 0 ? recentSessions : moderateSessions;
    if (candidates.length === 0) {
        return null;
    }
    let confidence;
    if (recentSessions.length > 0) {
        confidence = Math.min(0.95, 0.8 + recentSessions.length * 0.05);
    }
    else {
        confidence = Math.min(0.75, 0.5 + moderateSessions.length * 0.1);
    }
    return {
        label: "Multi-agent",
        suspectedSource: candidates.map((s) => s.name),
        confidence: Number(confidence.toFixed(2))
    };
}
