import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import {
  ipcChannels,
  type AgentWorkbenchWindow,
  type IpcEventMap,
  type IpcRequestMap
} from "../../../../packages/shared/src/index";

function invoke<C extends keyof IpcRequestMap>(
  channel: C,
  payload: IpcRequestMap[C][0]
): Promise<IpcRequestMap[C][1]> {
  const request = payload !== undefined
    ? ipcRenderer.invoke(channel as string, payload)
    : ipcRenderer.invoke(channel as string);

  return request.catch((error: unknown) => {
    if (!(error instanceof Error)) {
      throw error;
    }

    const prefix = `Error invoking remote method '${channel as string}': Error: `;
    if (error.message.startsWith(prefix)) {
      throw new Error(error.message.slice(prefix.length));
    }

    throw error;
  });
}

function on<C extends keyof IpcEventMap>(
  channel: C,
  listener: (payload: IpcEventMap[C]) => void
): () => void {
  const subscription = (_event: IpcRendererEvent, payload: IpcEventMap[C]) => listener(payload);
  ipcRenderer.on(channel as string, subscription as Parameters<typeof ipcRenderer.on>[1]);
  return () => ipcRenderer.removeListener(channel as string, subscription as Parameters<typeof ipcRenderer.on>[1]);
}

const api: AgentWorkbenchWindow["agentWorkbench"] = {
  app: {
    getSnapshot: () => invoke(ipcChannels.appSnapshot, undefined),
    getUpdateStatus: () => invoke(ipcChannels.appUpdateStatus, undefined),
    installManualUpdate: () => invoke(ipcChannels.appInstallManualUpdate, undefined),
    relaunch: () => invoke(ipcChannels.appRelaunch, undefined),
    getSettings: () => invoke(ipcChannels.appGetSettings, undefined),
    saveSettings: (settings) => invoke(ipcChannels.appSaveSettings, settings),
    testApiKey: () => invoke(ipcChannels.appTestApiKey, undefined)
  },
  audit: {
    listEvents: (projectId) => invoke(ipcChannels.auditListEvents, projectId)
  },
  workspaces: {
    rename: (payload) => invoke(ipcChannels.workspaceRename, payload)
  },
  terminals: {
    create: (payload) => invoke(ipcChannels.terminalCreate, payload),
    write: (payload) => invoke(ipcChannels.terminalWrite, payload),
    resize: (payload) => invoke(ipcChannels.terminalResize, payload),
    restart: (payload) => invoke(ipcChannels.terminalRestart, payload),
    terminate: (sessionId) => invoke(ipcChannels.terminalTerminate, sessionId),
    getOutput: (sessionId) => invoke(ipcChannels.terminalOutput, sessionId)
  },
  projects: {
    getConfig: (payload) => invoke(ipcChannels.projectConfig, payload),
    getLayout: (payload) => invoke(ipcChannels.projectLayout, payload),
    saveLayout: (payload) => invoke(ipcChannels.projectSaveLayout, payload),
    importProject: (payload) => invoke(ipcChannels.projectImport, payload),
    removeProject: (projectId) => invoke(ipcChannels.projectRemove, projectId),
    openIde: (payload) => invoke(ipcChannels.projectOpenIde, payload),
    openFileInEditor: (payload) => invoke(ipcChannels.projectOpenFileInEditor, payload),
    listActiveAgents: () => invoke(ipcChannels.projectActiveAgents, undefined)
  },
  git: {
    getStatus: (projectId) => invoke(ipcChannels.gitStatus, projectId),
    stage: (payload) => invoke(ipcChannels.gitStage, payload),
    unstage: (payload) => invoke(ipcChannels.gitUnstage, payload),
    getDiff: (payload) => invoke(ipcChannels.gitDiff, payload),
    getHistory: (payload) => invoke(ipcChannels.gitHistory, payload),
    getCommitDiff: (payload) => invoke(ipcChannels.gitCommitDiff, payload),
    addToGitIgnore: (payload) => invoke(ipcChannels.gitIgnoreAdd, payload),
    commit: (payload) => invoke(ipcChannels.gitCommit, payload),
    push: (projectId) => invoke(ipcChannels.gitPush, projectId),
    generateCommitMessage: (projectId) => invoke(ipcChannels.gitGenerateCommitMessage, projectId)
  },
  github: {
    listIssues: (payload) => invoke(ipcChannels.githubListIssues, payload),
    dispatchIssue: (payload) => invoke(ipcChannels.githubDispatchIssue, payload),
    listDispatched: (payload) => invoke(ipcChannels.githubListDispatched, payload),
    saveConfig: (payload) => invoke(ipcChannels.projectSaveGitHubConfig, payload)
  },
  taskloop: {
    import: (payload) => invoke(ipcChannels.taskloopImport, payload),
    start: (payload) => invoke(ipcChannels.taskloopStart, payload),
    pause: (payload) => invoke(ipcChannels.taskloopPause, payload),
    resume: (payload) => invoke(ipcChannels.taskloopResume, payload),
    stop: (payload) => invoke(ipcChannels.taskloopStop, payload),
    delete: (payload) => invoke(ipcChannels.taskloopDelete, payload),
    list: (payload) => invoke(ipcChannels.taskloopList, payload),
    getTasks: (loopId) => invoke(ipcChannels.taskloopGetTasks, loopId)
  },
  aiTerminal: {
    create: (payload) => invoke(ipcChannels.aiTerminalCreate, payload),
    send: (payload) => invoke(ipcChannels.aiTerminalSend, payload),
    resize: (payload) => invoke(ipcChannels.aiTerminalResize, payload),
    terminate: (sessionId) => invoke(ipcChannels.aiTerminalTerminate, sessionId),
    getBlocks: (sessionId) => invoke(ipcChannels.aiTerminalGetBlocks, sessionId),
    listSessions: (projectId) => invoke(ipcChannels.aiTerminalListSessions, projectId),
    query: (payload) => invoke(ipcChannels.aiTerminalQuery, payload)
  },
  onTerminalOutput: (listener) => on(ipcChannels.terminalOutputEvent, listener),
  onTerminalExit: (listener) => on(ipcChannels.terminalExitEvent, listener),
  onTerminalStateChange: (listener) => on(ipcChannels.terminalStateChangeEvent, listener),
  onGitStatusChanged: (listener) => on(ipcChannels.gitStatusChangedEvent, listener),
  onAuditEventDetected: (listener) => on(ipcChannels.auditEventDetectedEvent, listener),
  onGithubIssueDispatched: (listener) => on(ipcChannels.githubIssueDispatchedEvent, listener),
  onSystemStats: (listener) => on(ipcChannels.systemStatsEvent, listener),
  onTaskLoopProgress: (listener) => on(ipcChannels.taskloopProgressEvent, listener),
  onAiTerminalBlockStart: (listener) => on(ipcChannels.aiTerminalBlockStartEvent, listener),
  onAiTerminalBlockChunk: (listener) => on(ipcChannels.aiTerminalBlockChunkEvent, listener),
  onAiTerminalBlockEnd: (listener) => on(ipcChannels.aiTerminalBlockEndEvent, listener),
  onAiTerminalPrompt: (listener) => on(ipcChannels.aiTerminalPromptEvent, listener),
  onAiTerminalExit: (listener) => on(ipcChannels.aiTerminalExitEvent, listener),
  onTokenStats: (listener) => on(ipcChannels.tokenStatsEvent, listener)
};

contextBridge.exposeInMainWorld("agentWorkbench", api);
