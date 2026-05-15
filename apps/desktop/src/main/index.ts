import { app, BrowserWindow } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createCoreServices } from "../../../../packages/core/src/index";

import { registerIpcHandlers } from "./ipc";
import { logger } from "./logger";

const __dirname = dirname(fileURLToPath(import.meta.url));

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");

const seed = {
  workspaces: ["DadosTech", "Clientes", "IA Lab"],
  projects: [
    {
      workspaceName: "DadosTech",
      name: "bridge",
      path: "/home/felipe/Projetos/DadosTech",
      ideCommand: "phpstorm"
    },
    {
      workspaceName: "Clientes",
      name: "flowisee-app",
      path: "/home/felipe/Projetos/flowisee-app",
      ideCommand: "phpstorm"
    },
    {
      workspaceName: "IA Lab",
      name: "open-design",
      path: "/home/felipe/Projetos/open-design",
      ideCommand: "phpstorm"
    }
  ]
};

function createWindow(): BrowserWindow {
  const services = createCoreServices(join(app.getPath("userData"), "agent-workbench.db"), seed);
  const window = new BrowserWindow({
    width: 1680,
    height: 980,
    minWidth: 1280,
    minHeight: 820,
    title: "Agent Workbench",
    backgroundColor: "#07111f",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  registerIpcHandlers(window, services);

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}

app.whenReady().then(() => {
  logger.info("starting Agent Workbench");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
