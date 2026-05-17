import Anthropic from "@anthropic-ai/sdk";
import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { readFileSync } from "node:fs";
import os from "node:os";

import {
  ipcChannels,
  type CoreServices,
  type IpcEventMap,
  type IpcRequestMap
} from "../../../../packages/shared/src/index";

function handle<C extends keyof IpcRequestMap>(
  channel: C,
  fn: (event: IpcMainInvokeEvent, payload: IpcRequestMap[C][0]) => Promise<IpcRequestMap[C][1]> | IpcRequestMap[C][1]
): void {
  ipcMain.handle(channel as string, fn as Parameters<typeof ipcMain.handle>[1]);
}

function send<C extends keyof IpcEventMap>(
  window: BrowserWindow,
  channel: C,
  payload: IpcEventMap[C]
): void {
  window.webContents.send(channel as string, payload);
}

export function registerIpcHandlers(
  window: BrowserWindow,
  services: CoreServices
): void {
  handle(ipcChannels.appSnapshot, () =>
    services.projectService.getSnapshot()
  );
  handle(ipcChannels.auditListEvents, (_event, projectId) =>
    services.auditService.listEvents(projectId)
  );
  handle(ipcChannels.workspaceRename, (_event, payload) =>
    services.projectService.renameWorkspace(payload)
  );
  handle(ipcChannels.terminalCreate, (_event, payload) =>
    services.terminalService.createSession(payload)
  );
  handle(ipcChannels.terminalWrite, (_event, payload) =>
    services.terminalService.write(payload)
  );
  handle(ipcChannels.terminalResize, (_event, payload) =>
    services.terminalService.resize(payload)
  );
  handle(ipcChannels.terminalRestart, (_event, payload) =>
    services.terminalService.restart(payload)
  );
  handle(ipcChannels.terminalTerminate, (_event, sessionId) =>
    services.terminalService.terminate(sessionId)
  );
  handle(ipcChannels.terminalOutput, (_event, sessionId) =>
    services.terminalService.getOutput(sessionId)
  );
  handle(ipcChannels.projectConfig, (_event, payload) =>
    services.projectService.getProjectConfig(payload.projectId)
  );
  handle(ipcChannels.projectLayout, (_event, payload) =>
    services.projectService.getProjectLayout(payload.projectId)
  );
  handle(ipcChannels.projectSaveLayout, (_event, payload) =>
    services.projectService.saveProjectLayout(payload)
  );
  handle(ipcChannels.projectImport, async (_event, payload) => {
    const result = await dialog.showOpenDialog(window, {
      title: "Select Git project",
      properties: ["openDirectory"]
    });

    const projectPath = result.filePaths[0];

    if (result.canceled || !projectPath) {
      return { status: "cancelled" } as const;
    }

    let importResult;
    try {
      importResult = await services.projectService.importProject(projectPath, payload.workspaceId);
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to import project."
      } as const;
    }

    if (importResult.status === "imported" && importResult.projectId) {
      void services.projectService
        .getProjectConfig(importResult.projectId)
        .then((loaded) => {
          if (loaded.config.github?.watchIssues) {
            services.githubService.startWatchingProject(importResult.projectId!, loaded.config.github);
          }
        });
    }

    return importResult;
  });
  handle(ipcChannels.projectOpenIde, (_event, payload) =>
    services.projectService.openIde(payload)
  );
  handle(ipcChannels.projectActiveAgents, () =>
    services.projectService.listActiveAgents()
  );
  handle(ipcChannels.projectRemove, (_event, projectId) =>
    services.projectService.removeProject(projectId)
  );
  handle(ipcChannels.gitStatus, (_event, projectId) =>
    services.gitService.getStatus(projectId)
  );
  handle(ipcChannels.gitStage, (_event, payload) =>
    services.gitService.stage(payload)
  );
  handle(ipcChannels.gitUnstage, (_event, payload) =>
    services.gitService.unstage(payload)
  );
  handle(ipcChannels.gitDiff, (_event, payload) =>
    services.gitService.getDiff(payload)
  );
  handle(ipcChannels.gitHistory, (_event, payload) =>
    services.gitService.getHistory(payload)
  );
  handle(ipcChannels.gitCommitDiff, (_event, payload) =>
    services.gitService.getCommitDiff(payload)
  );
  handle(ipcChannels.gitIgnoreAdd, (_event, payload) =>
    services.gitService.addToGitIgnore(payload)
  );
  handle(ipcChannels.gitCommit, (_event, payload) =>
    services.gitService.commit(payload)
  );
  handle(ipcChannels.gitGenerateCommitMessage, async (_event, projectId) => {
    const diff = await services.gitService.getStagedDiff(projectId);

    if (!diff) {
      throw new Error("Não há mudanças staged para gerar uma mensagem de commit.");
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: `Generate a concise git commit message for these staged changes. Use conventional commits format (feat:, fix:, refactor:, chore:, docs:, style:, test:, etc.). Reply with ONLY the commit message, nothing else.\n\n${diff.slice(0, 8000)}`
      }]
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Failed to generate commit message.");
    }

    return textBlock.text.trim();
  });
  handle(ipcChannels.githubListIssues, (_event, payload) =>
    services.githubService.listIssues(payload.projectId)
  );
  handle(ipcChannels.githubDispatchIssue, (_event, payload) =>
    services.githubService.dispatchIssue(payload.projectId, payload.issueNumber)
  );
  handle(ipcChannels.githubListDispatched, (_event, payload) =>
    Promise.resolve(services.githubService.listDispatched(payload.projectId))
  );
  handle(ipcChannels.projectSaveGitHubConfig, async (_event, payload) => {
    const loaded = await services.projectService.saveGitHubConfig(payload.projectId, payload.github);
    if (payload.github?.watchIssues) {
      services.githubService.startWatchingProject(payload.projectId, payload.github);
    } else {
      services.githubService.stopWatchingProject(payload.projectId);
    }
    return loaded;
  });

  handle(ipcChannels.taskloopImport, async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Select Task Loop JSON",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"]
    });

    if (result.canceled || !result.filePaths[0]) return null;

    const raw = JSON.parse(readFileSync(result.filePaths[0], "utf8")) as unknown;
    return raw as import("@agent-workbench/types").TaskLoopDefinition;
  });
  handle(ipcChannels.taskloopStart, (_event, payload) =>
    services.taskLoopService.start(payload.projectId, payload.agent, payload.definition)
  );
  handle(ipcChannels.taskloopPause, (_event, payload) => {
    services.taskLoopService.pause(payload.loopId);
  });
  handle(ipcChannels.taskloopResume, (_event, payload) => {
    services.taskLoopService.resume(payload.loopId);
  });
  handle(ipcChannels.taskloopStop, (_event, payload) =>
    services.taskLoopService.stop(payload.loopId)
  );
  handle(ipcChannels.taskloopDelete, (_event, payload) =>
    services.taskLoopService.delete(payload.loopId)
  );
  handle(ipcChannels.taskloopList, (_event, payload) =>
    Promise.resolve(services.taskLoopService.list(payload.projectId))
  );
  handle(ipcChannels.taskloopGetTasks, (_event, loopId) =>
    Promise.resolve(services.taskLoopService.getTasks(loopId))
  );

  services.taskLoopService.onProgress((payload) => {
    send(window, ipcChannels.taskloopProgressEvent, payload);
  });

  services.terminalService.onOutput((payload) => {
    send(window, ipcChannels.terminalOutputEvent, payload);
  });
  services.terminalService.onExit((payload) => {
    send(window, ipcChannels.terminalExitEvent, payload);
  });
  services.terminalService.onStateChange((payload) => {
    send(window, ipcChannels.terminalStateChangeEvent, payload);
  });
  services.watcherService.onGitStatusChanged((payload) => {
    send(window, ipcChannels.gitStatusChangedEvent, payload);
  });
  services.auditService.onAuditEvent((payload) => {
    send(window, ipcChannels.auditEventDetectedEvent, payload);
  });
  services.githubService.onIssueDispatched((payload) => {
    send(window, ipcChannels.githubIssueDispatchedEvent, payload);
  });

  let prevCpuTimes = sampleCpuTimes();
  const statsInterval = setInterval(() => {
    if (window.isDestroyed()) {
      return;
    }

    const currCpuTimes = sampleCpuTimes();
    const totalDelta = currCpuTimes.total - prevCpuTimes.total;
    const idleDelta = currCpuTimes.idle - prevCpuTimes.idle;
    prevCpuTimes = currCpuTimes;

    const cpuPercent = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
    const memTotalMb = Math.round(os.totalmem() / 1024 / 1024);
    const memUsedMb = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024);

    send(window, ipcChannels.systemStatsEvent, { cpuPercent, memUsedMb, memTotalMb });
  }, 2000);

  window.on("closed", () => clearInterval(statsInterval));
}

function sampleCpuTimes(): { total: number; idle: number } {
  const cpus = os.cpus();
  let total = 0;
  let idle = 0;
  for (const cpu of cpus) {
    for (const time of Object.values(cpu.times)) {
      total += time;
    }
    idle += cpu.times.idle;
  }
  return { total, idle };
}
