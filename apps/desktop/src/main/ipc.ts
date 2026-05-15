import { ipcMain, type BrowserWindow } from "electron";

import {
  ipcChannels,
  type CoreServices
} from "../../../../packages/shared/src/index";

export function registerIpcHandlers(
  window: BrowserWindow,
  services: CoreServices
): void {
  ipcMain.handle(ipcChannels.appSnapshot, () => services.projectService.getSnapshot());
  ipcMain.handle(ipcChannels.terminalCreate, (_event, payload) =>
    services.terminalService.createSession(payload)
  );
  ipcMain.handle(ipcChannels.terminalWrite, (_event, payload) =>
    services.terminalService.write(payload)
  );
  ipcMain.handle(ipcChannels.terminalResize, (_event, payload) =>
    services.terminalService.resize(payload)
  );
  ipcMain.handle(ipcChannels.terminalTerminate, (_event, sessionId) =>
    services.terminalService.terminate(sessionId)
  );
  ipcMain.handle(ipcChannels.terminalOutput, (_event, sessionId) =>
    services.terminalService.getOutput(sessionId)
  );
  ipcMain.handle(ipcChannels.projectConfig, (_event, payload) =>
    services.projectService.getProjectConfig(payload.projectId)
  );
  ipcMain.handle(ipcChannels.projectOpenIde, (_event, payload) =>
    services.projectService.openIde(payload)
  );
  ipcMain.handle(ipcChannels.projectActiveAgents, () =>
    services.projectService.listActiveAgents()
  );
  ipcMain.handle(ipcChannels.gitStatus, (_event, projectId) =>
    services.gitService.getStatus(projectId)
  );
  ipcMain.handle(ipcChannels.gitStage, (_event, payload) =>
    services.gitService.stage(payload)
  );
  ipcMain.handle(ipcChannels.gitUnstage, (_event, payload) =>
    services.gitService.unstage(payload)
  );
  ipcMain.handle(ipcChannels.gitDiff, (_event, payload) =>
    services.gitService.getDiff(payload)
  );
  ipcMain.handle(ipcChannels.gitHistory, (_event, payload) =>
    services.gitService.getHistory(payload)
  );

  services.terminalService.onOutput((payload) => {
    window.webContents.send(ipcChannels.terminalOutputEvent, payload);
  });

  services.terminalService.onExit((payload) => {
    window.webContents.send(ipcChannels.terminalExitEvent, payload);
  });
}
