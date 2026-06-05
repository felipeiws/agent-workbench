import Anthropic from "@anthropic-ai/sdk";
import { app, dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { buildClaudeStats, buildCodexStats, readClaudeUsage, readCodexUsage } from "./usage-reader";
import { chmod, copyFile, readFile, rename, rm } from "node:fs/promises";
import os from "node:os";
import { extname } from "node:path";

import {
  type AppUpdateStatus,
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
  handle(ipcChannels.appUpdateStatus, () => getAppUpdateStatus());
  handle(ipcChannels.appInstallManualUpdate, async () => {
    const status = getAppUpdateStatus();

    if (!status.canInstallUpdate) {
      throw new Error(status.reason ?? "Manual update is not available in this runtime.");
    }

    const result = await dialog.showOpenDialog(window, {
      title: "Select replacement AppImage",
      filters: [{ name: "AppImage", extensions: ["AppImage", "appimage"] }],
      properties: ["openFile"]
    });

    const sourcePath = result.filePaths[0];

    if (result.canceled || !sourcePath) {
      return null;
    }

    if (sourcePath === status.executablePath) {
      throw new Error("Select a different AppImage file to replace the current installation.");
    }

    if (extname(sourcePath).toLowerCase() !== ".appimage") {
      throw new Error("The selected file is not an AppImage.");
    }

    const tempPath = `${status.executablePath}.updating`;

    try {
      await copyFile(sourcePath, tempPath);
      await chmod(tempPath, 0o755);
      await rename(tempPath, status.executablePath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }

    return {
      version: status.version,
      executablePath: status.executablePath,
      sourcePath,
      replacedAt: new Date().toISOString()
    };
  });
  handle(ipcChannels.appRelaunch, () => {
    app.relaunch();
    app.quit();
  });
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
  handle(ipcChannels.projectOpenFileInEditor, async (_event, payload) => {
    const settings = services.settingsService.getSettings();
    const editorCommand = settings.editorCommand ?? "";
    await services.projectService.openFileInEditor(payload.projectId, payload.filePath, editorCommand, payload.line);
  });
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
  handle(ipcChannels.gitPush, async (_event, projectId) => {
    const settings = services.settingsService.getSettings();
    return services.gitService.push(projectId, settings.gitToken || undefined);
  });
  handle(ipcChannels.appGetSettings, () =>
    services.settingsService.getSettings()
  );
  handle(ipcChannels.appSaveSettings, (_event, settings) =>
    services.settingsService.saveSettings(settings)
  );
  handle(ipcChannels.appTestApiKey, async () => {
    const settings = services.settingsService.getSettings();
    const key = settings.aiApiKey.trim();
    const keyPreview = key.length > 12
      ? `${key.slice(0, 10)}...${key.slice(-4)}`
      : key.length > 0 ? `${key.slice(0, 4)}...` : "(vazio)";
    const keyLength = key.length;

    if (!key) {
      return { ok: false, keyPreview, keyLength, error: "API key não configurada." };
    }

    try {
      if (settings.aiProvider === "openai") {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${key}` }
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`OpenAI ${res.status}: ${body}`);
        }
      } else {
        const client = new Anthropic({ apiKey: key });
        await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }]
        });
      }
      return { ok: true, keyPreview, keyLength };
    } catch (error) {
      return {
        ok: false,
        keyPreview,
        keyLength,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  handle(ipcChannels.gitGenerateCommitMessage, async (_event, projectId) => {
    const diff = await services.gitService.getStagedDiff(projectId);

    if (!diff) {
      throw new Error("Não há mudanças staged para gerar uma mensagem de commit.");
    }

    const settings = services.settingsService.getSettings();
    const apiKey = settings.aiApiKey.trim();

    if (!apiKey) {
      throw new Error("API key não configurada. Acesse Configurações > IA para configurar.");
    }

    const model = settings.aiModel;
    const prompt = settings.commitPrompt ||
      "Generate a concise git commit message for these staged changes. Use conventional commits format (feat:, fix:, refactor:, chore:, docs:, style:, test:, etc.). Reply with ONLY the commit message, nothing else.";
    const userContent = `${prompt}\n\n${diff.slice(0, 8000)}`;

    if (settings.aiProvider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          max_tokens: 256,
          messages: [{ role: "user", content: userContent }]
        })
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${body}`);
      }
      const data = await res.json() as { choices: Array<{ message: { content: string } }> };
      return (data.choices[0]?.message.content ?? "").trim();
    }

    // Anthropic (default)
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: model || "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: userContent }]
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Falha ao gerar mensagem de commit.");
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

    const raw = JSON.parse(await readFile(result.filePaths[0], "utf8")) as unknown;
    return raw as import("@agent-workbench/types").TaskLoopDefinition;
  });
  handle(ipcChannels.taskloopStart, (_event, payload) =>
    services.taskLoopService.start(payload.projectId, payload.agent, payload.definition)
  );
  handle(ipcChannels.taskloopPause, (_event, payload) => {
    services.taskLoopService.pause(payload.loopId);
  });
  handle(ipcChannels.taskloopResume, (_event, payload) =>
    services.taskLoopService.resume(payload.loopId, payload.agent)
  );
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

  handle(ipcChannels.aiTerminalCreate, (_event, payload) =>
    Promise.resolve(services.aiTerminalService.create(payload.projectId, payload.name, payload.provider))
  );
  handle(ipcChannels.aiTerminalSend, (_event, payload) =>
    Promise.resolve(services.aiTerminalService.send(payload.sessionId, payload.command))
  );
  handle(ipcChannels.aiTerminalResize, (_event, payload) => {
    services.aiTerminalService.resize(payload.sessionId, payload.cols, payload.rows);
  });
  handle(ipcChannels.aiTerminalTerminate, (_event, sessionId) => {
    services.aiTerminalService.terminate(sessionId);
  });
  handle(ipcChannels.aiTerminalGetBlocks, (_event, sessionId) =>
    Promise.resolve(services.aiTerminalService.getBlocks(sessionId))
  );
  handle(ipcChannels.aiTerminalListSessions, (_event, projectId) =>
    Promise.resolve(services.aiTerminalService.listSessions(projectId))
  );
  handle(ipcChannels.aiTerminalQuery, async (_event, payload) => {
    const blocks = services.aiTerminalService.getBlocks(payload.sessionId);
    const recentContext = blocks
      .slice(-5)
      .map((b) => `$ ${b.command}\n${b.output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").slice(0, 800)}`)
      .join("\n---\n");

    const systemPrompt =
      "You are a terminal assistant. The user wants to run a shell command. " +
      "Respond with a JSON object: {\"command\": \"<shell command>\", \"explanation\": \"<one line explanation>\"}. " +
      "Output ONLY valid JSON, nothing else.";
    const userMsg = `Recent terminal context:\n${recentContext || "(empty)"}\n\nUser request: ${payload.prompt}`;

    if (payload.provider === "claude") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set.");
      const client = new Anthropic({ apiKey });
      const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }]
      });
      void emitTokenStats(window);
      const textBlock = res.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude.");
      const parsed = JSON.parse(textBlock.text.trim()) as { command: string; explanation: string };
      return parsed;
    }

    // Codex via OpenAI API
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set.");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 256,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg }
        ]
      })
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    void emitTokenStats(window);
    const text = data.choices[0]?.message.content ?? "";
    const parsed = JSON.parse(text.trim()) as { command: string; explanation: string };
    return parsed;
  });

  services.aiTerminalService.onBlockStart((e) => {
    send(window, ipcChannels.aiTerminalBlockStartEvent, e);
  });
  services.aiTerminalService.onBlockChunk((e) => {
    send(window, ipcChannels.aiTerminalBlockChunkEvent, e);
  });
  services.aiTerminalService.onBlockEnd((e) => {
    send(window, ipcChannels.aiTerminalBlockEndEvent, e);
  });
  services.aiTerminalService.onPrompt((e) => {
    send(window, ipcChannels.aiTerminalPromptEvent, e);
  });
  services.aiTerminalService.onExit((e) => {
    send(window, ipcChannels.aiTerminalExitEvent, e);
  });

  let tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  services.taskLoopService.onProgress((payload) => {
    send(window, ipcChannels.taskloopProgressEvent, payload);
    // Re-read usage after each task completes — debounced so burst events coalesce
    if (payload.taskStatus === "completed" || payload.taskStatus === "failed") {
      if (tokenRefreshTimer !== null) clearTimeout(tokenRefreshTimer);
      tokenRefreshTimer = setTimeout(() => {
        tokenRefreshTimer = null;
        if (!window.isDestroyed()) void emitTokenStats(window);
      }, 3_000);
    }
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

  // Re-read every 60s — fast HTTP API call now, no PTY overhead
  const tokenInterval = setInterval(() => {
    if (!window.isDestroyed()) {
      void emitTokenStats(window);
    }
  }, 60_000);

  void emitTokenStats(window);

  window.on("closed", () => {
    clearInterval(statsInterval);
    clearInterval(tokenInterval);
  });
}

async function emitTokenStats(window: BrowserWindow): Promise<void> {
  const [claudeData, codexData] = await Promise.all([
    readClaudeUsage(),
    Promise.resolve(readCodexUsage())
  ]);

  if (window.isDestroyed()) return;

  send(window, ipcChannels.tokenStatsEvent, {
    claude: buildClaudeStats(claudeData),
    codex: buildCodexStats(codexData)
  });
}

function getAppUpdateStatus(): AppUpdateStatus {
  const appImagePath = resolveCurrentAppImagePath();

  if (!appImagePath) {
    return {
      version: app.getVersion(),
      executablePath: process.execPath,
      canInstallUpdate: false,
      reason: "Manual update is available only when the packaged AppImage is running."
    };
  }

  return {
    version: app.getVersion(),
    executablePath: appImagePath,
    canInstallUpdate: true,
    reason: null
  };
}

function resolveCurrentAppImagePath(): string | null {
  const candidate = process.env.APPIMAGE;

  if (!candidate) {
    return null;
  }

  if (extname(candidate).toLowerCase() !== ".appimage") {
    return null;
  }

  return candidate;
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
