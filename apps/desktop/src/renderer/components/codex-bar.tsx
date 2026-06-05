import { useEffect, useState } from "react";

import type { TokenProviderStats, TokenStatsEvent } from "@agent-workbench/shared";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function formatCountdown(targetMs: number): string {
  const remaining = Math.max(0, targetMs - Date.now());
  const h = Math.floor(remaining / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  const s = Math.floor((remaining % 60_000) / 1_000);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function barColor(pct: number): string {
  if (pct >= 90) return "var(--state-err)";
  if (pct >= 70) return "var(--state-run)";
  return "var(--state-ok)";
}

interface ProviderMeterProps {
  stats: TokenProviderStats;
  label: string;
}

function ProviderMeter({ stats, label }: ProviderMeterProps) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const pct5h = stats.pct5h ?? Math.min(100, stats.limit5h > 0 ? (stats.used5h / stats.limit5h) * 100 : 0);
  const pctWk = stats.pctWeekly ?? Math.min(100, stats.limitWeekly > 0 ? (stats.usedWeekly / stats.limitWeekly) * 100 : 0);

  return (
    <div className="fd-codex-provider">
      <span className="fd-codex-label">{label}</span>

      <div
        className="fd-codex-meter"
        title={`5h: ${stats.provider === "claude" ? `${Math.round(pct5h)}%` : `${formatTokens(stats.used5h)} tokens`}`}
      >
        <span className="fd-codex-window-label">5H</span>
        <div className="fd-sys-bar fd-codex-bar">
          <div
            className="fd-sys-bar-fill"
            style={{ width: `${pct5h}%`, backgroundColor: barColor(pct5h) }}
          />
        </div>
        <span className="fd-codex-pct">
          {stats.provider === "claude"
            ? `${Math.round(pct5h)}%`
            : formatTokens(stats.used5h)}
        </span>
      </div>

      <div
        className="fd-codex-meter"
        title={`Weekly: ${stats.provider === "claude" ? `${Math.round(pctWk)}%` : `${formatTokens(stats.usedWeekly)} tokens`}`}
      >
        <span className="fd-codex-window-label">WK</span>
        <div className="fd-sys-bar fd-codex-bar">
          <div
            className="fd-sys-bar-fill"
            style={{ width: `${pctWk}%`, backgroundColor: barColor(pctWk) }}
          />
        </div>
        <span className="fd-codex-pct">
          {stats.provider === "claude"
            ? `${Math.round(pctWk)}%`
            : formatTokens(stats.usedWeekly)}
        </span>
      </div>

      <span className="fd-codex-reset" title="Time until 5h window resets">
        ↺{formatCountdown(stats.nextReset5hMs)}
      </span>
    </div>
  );
}

interface CodexBarProps {
  stats: TokenStatsEvent | null;
}

export function CodexBar({ stats }: CodexBarProps) {
  if (!stats) return null;

  return (
    <div className="fd-codex-bar-group">
      <ProviderMeter stats={stats.claude} label="CLAUDE" />
      <span className="fd-codex-divider">·</span>
      <ProviderMeter stats={stats.codex} label="CODEX" />
    </div>
  );
}
