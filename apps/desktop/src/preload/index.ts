import { contextBridge, ipcRenderer } from "electron";

import {
  ipcChannels,
  type AgentWorkbenchWindow
} from "../../../../packages/shared/src/index";

const api: AgentWorkbenchWindow["agentWorkbench"] = {
  app: {
    getSnapshot: () => ipcRenderer.invoke(ipcChannels.appSnapshot)
  },
  terminals: {
    create: (payload) => ipcRenderer.invoke(ipcChannels.terminalCreate, payload),
    write: (payload) => ipcRenderer.invoke(ipcChannels.terminalWrite, payload),
    resize: (payload) => ipcRenderer.invoke(ipcChannels.terminalResize, payload),
    terminate: (sessionId) => ipcRenderer.invoke(ipcChannels.terminalTerminate, sessionId),
    getOutput: (sessionId) => ipcRenderer.invoke(ipcChannels.terminalOutput, sessionId)
  },
  projects: {
    getConfig: (payload) => ipcRenderer.invoke(ipcChannels.projectConfig, payload),
    openIde: (payload) => ipcRenderer.invoke(ipcChannels.projectOpenIde, payload),
    listActiveAgents: () => ipcRenderer.invoke(ipcChannels.projectActiveAgents)
  },
  git: {
    getStatus: (projectId) => ipcRenderer.invoke(ipcChannels.gitStatus, projectId),
    stage: (payload) => ipcRenderer.invoke(ipcChannels.gitStage, payload),
    unstage: (payload) => ipcRenderer.invoke(ipcChannels.gitUnstage, payload),
    getDiff: (payload) => ipcRenderer.invoke(ipcChannels.gitDiff, payload),
    getHistory: (payload) => ipcRenderer.invoke(ipcChannels.gitHistory, payload)
  },
  onTerminalOutput: (listener) => {
    const subscription = (_event: unknown, payload: Parameters<typeof listener>[0]) =>
      listener(payload);
    ipcRenderer.on(ipcChannels.terminalOutputEvent, subscription);
    return () => ipcRenderer.removeListener(ipcChannels.terminalOutputEvent, subscription);
  },
  onTerminalExit: (listener) => {
    const subscription = (_event: unknown, payload: Parameters<typeof listener>[0]) =>
      listener(payload);
    ipcRenderer.on(ipcChannels.terminalExitEvent, subscription);
    return () => ipcRenderer.removeListener(ipcChannels.terminalExitEvent, subscription);
  }
};

contextBridge.exposeInMainWorld("agentWorkbench", api);
