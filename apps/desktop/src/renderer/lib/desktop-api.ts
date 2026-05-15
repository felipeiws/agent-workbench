import type { AgentWorkbenchWindow } from "@agent-workbench/shared";

export function getDesktopApi(): AgentWorkbenchWindow["agentWorkbench"] {
  return (window as typeof window & AgentWorkbenchWindow).agentWorkbench;
}
