import { ForgeIcon } from "./forge-icons";
import {
  AgentMonogram,
  SafeModeIndicator,
  StateDot,
  type UiAgentState,
  type UiSafeMode
} from "./status-badge";

export interface ActiveAgentPill {
  id: string;
  projectId: string;
  project: string;
  name: string;
  state: UiAgentState;
}

interface TopbarProps {
  workspace: string;
  project: string;
  branch: string;
  activeAgents: ActiveAgentPill[];
  safeMode: UiSafeMode;
  onToggleSafeMode: () => void;
  onAgentClick: (sessionId: string, projectId: string) => void;
}

const stateOrder = {
  waiting: 0,
  error: 1,
  running: 2,
  completed: 3,
  idle: 4
} satisfies Record<ActiveAgentPill["state"], number>;

export function Topbar({
  workspace,
  project,
  branch,
  activeAgents,
  safeMode,
  onToggleSafeMode,
  onAgentClick
}: TopbarProps) {
  const sortedAgents = [...activeAgents].sort(
    (left, right) => stateOrder[left.state] - stateOrder[right.state]
  );

  return (
    <header className="fd-topbar">
      <div className="fd-brand">
        <ForgeIcon name="forge" size={16} />
        <span className="fd-brand-name">Forgedesk</span>
        <span className="fd-brand-sub">Workbench</span>
      </div>

      <div className="fd-breadcrumb">
        <span className="muted">{workspace}</span>
        <span>/</span>
        <span className="current">{project}</span>
        <span>·</span>
        <span className="branch">
          <ForgeIcon name="branch" size={12} />
          {branch}
        </span>
      </div>

      <div className="fd-active-agents">
        <span className="fd-active-agents-label">Active Agents</span>
        {sortedAgents.map((agent) => (
          <button
            className={`fd-agent-pill ${agent.state}`}
            key={agent.id}
            type="button"
            onClick={() => onAgentClick(agent.id, agent.projectId)}
          >
            <AgentMonogram
              agent={agent.name.toLowerCase()}
              monogram={agent.name.charAt(0).toUpperCase()}
            />
            <span className="mono">{agent.project}</span>
            <span>{agent.name}</span>
            <StateDot state={agent.state} />
          </button>
        ))}
      </div>

      <div className="fd-topbar-actions">
        <SafeModeIndicator mode={safeMode} onClick={onToggleSafeMode} />
        <button className="fd-icon-button" type="button" aria-label="Layout options">
          <ForgeIcon name="layout" size={13} />
        </button>
        <button className="fd-icon-button" type="button" aria-label="Settings">
          <ForgeIcon name="settings" size={13} />
        </button>
      </div>
    </header>
  );
}
