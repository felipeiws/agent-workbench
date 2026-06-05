import Database from "better-sqlite3";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ── Claude — GET https://claude.ai/api/oauth/usage ─────────────────────────

interface ClaudeUsageData {
  pct5h: number;
  pctWeekly: number;
  nextReset5hMs: number;
  nextResetWeeklyMs: number;
}

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken: string;
    expiresAt: number;
  };
}

interface ClaudeApiUsageResponse {
  five_hour?: { utilization?: number; resets_at?: string } | null;
  seven_day?: { utilization?: number; resets_at?: string } | null;
}

async function loadClaudeToken(): Promise<string | null> {
  try {
    const raw = await readFile(join(homedir(), ".claude", ".credentials.json"), "utf-8");
    const creds = JSON.parse(raw) as ClaudeCredentials;
    const oauth = creds.claudeAiOauth;
    if (!oauth?.accessToken) return null;
    // Treat token as valid if it hasn't expired (or expiry is unknown)
    if (oauth.expiresAt && Date.now() > oauth.expiresAt) return null;
    return oauth.accessToken;
  } catch {
    return null;
  }
}

export async function readClaudeUsage(): Promise<ClaudeUsageData | null> {
  const token = await loadClaudeToken();
  if (!token) return null;

  try {
    const res = await fetch("https://claude.ai/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "claude-code/2.1.150"
      }
    });

    if (!res.ok) return null;

    const data = (await res.json()) as ClaudeApiUsageResponse;

    const pct5h = data.five_hour?.utilization ?? 0;
    const pctWeekly = data.seven_day?.utilization ?? 0;
    const nextReset5hMs = data.five_hour?.resets_at
      ? new Date(data.five_hour.resets_at).getTime()
      : Date.now() + FIVE_HOURS_MS;
    const nextResetWeeklyMs = data.seven_day?.resets_at
      ? new Date(data.seven_day.resets_at).getTime()
      : Date.now() + SEVEN_DAYS_MS;

    return { pct5h, pctWeekly, nextReset5hMs, nextResetWeeklyMs };
  } catch {
    return null;
  }
}

// ── Codex — read ~/.codex/state_5.sqlite directly ──────────────────────────

interface CodexUsageData {
  used5h: number;
  usedWeekly: number;
  oldest5hMs: number | null;
  oldestWeeklyMs: number | null;
}

export function readCodexUsage(): CodexUsageData {
  const now = Date.now();
  const dbPath = join(homedir(), ".codex", "state_5.sqlite");

  try {
    const db = new Database(dbPath, { readonly: true });

    const r5h = db
      .prepare(
        "SELECT SUM(tokens_used) AS total, MIN(created_at_ms) AS oldest FROM threads WHERE created_at_ms >= ? AND tokens_used > 0"
      )
      .get(now - FIVE_HOURS_MS) as { total: number | null; oldest: number | null };

    const rWeekly = db
      .prepare(
        "SELECT SUM(tokens_used) AS total, MIN(created_at_ms) AS oldest FROM threads WHERE created_at_ms >= ? AND tokens_used > 0"
      )
      .get(now - SEVEN_DAYS_MS) as { total: number | null; oldest: number | null };

    db.close();
    return {
      used5h: r5h.total ?? 0,
      usedWeekly: rWeekly.total ?? 0,
      oldest5hMs: r5h.oldest ?? null,
      oldestWeeklyMs: rWeekly.oldest ?? null
    };
  } catch {
    return { used5h: 0, usedWeekly: 0, oldest5hMs: null, oldestWeeklyMs: null };
  }
}

// ── Build TokenProviderStats for IPC ───────────────────────────────────────

export function buildClaudeStats(data: ClaudeUsageData | null) {
  const now = Date.now();
  return {
    provider: "claude" as const,
    used5h: data?.pct5h ?? 0,
    usedWeekly: data?.pctWeekly ?? 0,
    limit5h: 100,
    limitWeekly: 100,
    nextReset5hMs: data?.nextReset5hMs ?? now + FIVE_HOURS_MS,
    nextResetWeeklyMs: data?.nextResetWeeklyMs ?? now + SEVEN_DAYS_MS,
    pct5h: data?.pct5h ?? 0,
    pctWeekly: data?.pctWeekly ?? 0
  };
}

export function buildCodexStats(data: CodexUsageData) {
  const now = Date.now();
  const limit5h = Number(process.env["CODEX_5H_LIMIT"] ?? 5_000_000);
  const limitWeekly = Number(process.env["CODEX_WEEKLY_LIMIT"] ?? 200_000_000);

  const nextReset5hMs =
    data.oldest5hMs !== null ? data.oldest5hMs + FIVE_HOURS_MS : now + FIVE_HOURS_MS;
  const nextResetWeeklyMs =
    data.oldestWeeklyMs !== null ? data.oldestWeeklyMs + SEVEN_DAYS_MS : now + SEVEN_DAYS_MS;

  const pct5h = limit5h > 0 ? Math.min(100, (data.used5h / limit5h) * 100) : 0;
  const pctWeekly = limitWeekly > 0 ? Math.min(100, (data.usedWeekly / limitWeekly) * 100) : 0;

  return {
    provider: "codex" as const,
    used5h: data.used5h,
    usedWeekly: data.usedWeekly,
    limit5h,
    limitWeekly,
    nextReset5hMs,
    nextResetWeeklyMs,
    pct5h,
    pctWeekly
  };
}
