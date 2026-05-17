import { ForgeIcon } from "./forge-icons";

export type UiAgentState = "running" | "waiting" | "completed" | "error" | "idle";
export type UiSafeMode = "off" | "audit" | "protect";

export function AgentMonogram({
  agent,
  monogram,
  large = false
}: {
  agent: string;
  monogram: string;
  large?: boolean;
}) {
  return (
    <span className={`fd-agent-chip fd-agent-${agent} ${large ? "large" : ""}`}>
      {monogram}
    </span>
  );
}

export function StateDot({ state }: { state: UiAgentState }) {
  return <span className={`fd-state-dot ${state}`} aria-label={state} />;
}

export function SafeModeIndicator({
  mode,
  onClick
}: {
  mode: UiSafeMode;
  onClick: () => void;
}) {
  return (
    <button className={`fd-safe-mode ${mode}`} onClick={onClick} type="button">
      <ForgeIcon name="shield" size={12} />
      <span className="fd-safe-mode-led" />
      <span>Safe Mode · {mode}</span>
    </button>
  );
}
