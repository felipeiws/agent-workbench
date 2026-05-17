import { z } from "zod";

import type {
  LoadedProjectConfig,
  ProjectConfig
} from "../../types/src/index";

export const projectTerminalTemplateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["agent", "shell", "task"]),
  command: z.string().min(1)
});

export const projectGitHubConfigSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  watchIssues: z.boolean().default(false),
  labels: z.array(z.string().min(1)).min(1),
  pollIntervalMs: z.number().int().min(10000).optional(),
  agentCommand: z.string().min(1).optional()
});

export const projectConfigSchema = z.object({
  project: z.string().min(1),
  safeMode: z.enum(["off", "audit", "protect"]).default("audit"),
  ide: z.object({
    command: z.string().min(1)
  }),
  terminals: z.array(projectTerminalTemplateSchema).min(1),
  github: projectGitHubConfigSchema.optional()
});

export const PROJECT_CONFIG_FILE = ".agent-workspace.json";

export function buildDefaultProjectConfig(projectName: string): ProjectConfig {
  return {
    project: projectName,
    safeMode: "audit",
    ide: {
      command: "phpstorm"
    },
    terminals: [
      {
        name: "Shell",
        type: "shell",
        command: "bash"
      },
      {
        name: "Codex",
        type: "agent",
        command: "codex"
      },
      {
        name: "Claude",
        type: "agent",
        command: "claude"
      }
    ]
  };
}

export function parseProjectConfig(
  raw: unknown,
  path: string,
  source: LoadedProjectConfig["source"]
): LoadedProjectConfig {
  return {
    path,
    source,
    config: projectConfigSchema.parse(raw)
  };
}
