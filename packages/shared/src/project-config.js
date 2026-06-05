import { z } from "zod";
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
const CODEX_BASE_COMMAND = "codex";
const CODEX_REQUIRED_FLAGS = [
    "--dangerously-bypass-approvals-and-sandbox",
    "--no-alt-screen"
];
export function buildDefaultProjectConfig(projectName) {
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
                command: buildDefaultCodexCommand()
            },
            {
                name: "Claude",
                type: "agent",
                command: "claude"
            }
        ]
    };
}
export function buildDefaultCodexCommand() {
    return [CODEX_BASE_COMMAND, ...CODEX_REQUIRED_FLAGS].join(" ");
}
export function normalizeTerminalCommand(command) {
    const trimmed = command.trim();
    if (!(trimmed === CODEX_BASE_COMMAND || trimmed.startsWith(`${CODEX_BASE_COMMAND} `))) {
        return trimmed;
    }
    const hasSandboxPolicy = trimmed.includes("--dangerously-bypass-approvals-and-sandbox") ||
        trimmed.includes("--sandbox ") ||
        trimmed.includes("--sandbox=") ||
        trimmed.includes(" -s ") ||
        trimmed.endsWith(" -s") ||
        trimmed.includes("--ask-for-approval ") ||
        trimmed.includes("--ask-for-approval=") ||
        trimmed.includes(" -a ") ||
        trimmed.endsWith(" -a");
    const hasNoAltScreen = trimmed.includes("--no-alt-screen");
    const nextParts = [trimmed];
    if (!hasSandboxPolicy) {
        nextParts.push("--dangerously-bypass-approvals-and-sandbox");
    }
    if (!hasNoAltScreen) {
        nextParts.push("--no-alt-screen");
    }
    return nextParts.join(" ");
}
export function parseProjectConfig(raw, path, source) {
    return {
        path,
        source,
        config: projectConfigSchema.parse(raw)
    };
}
