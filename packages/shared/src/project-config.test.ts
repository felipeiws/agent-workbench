import { describe, expect, it } from "vitest";

import {
  PROJECT_CONFIG_FILE,
  buildDefaultCodexCommand,
  buildDefaultProjectConfig,
  normalizeTerminalCommand,
  parseProjectConfig
} from "./project-config";

describe("project-config", () => {
  it("builds a default agent workspace config", () => {
    const config = buildDefaultProjectConfig("bridge");

    expect(config.project).toBe("bridge");
    expect(config.safeMode).toBe("audit");
    expect(config.terminals).toHaveLength(3);
    expect(config.terminals[1]?.command).toBe(buildDefaultCodexCommand());
  });

  it("parses a valid config payload", () => {
    const loaded = parseProjectConfig(
      {
        project: "bridge",
        safeMode: "audit",
        ide: { command: "phpstorm" },
        terminals: [{ name: "Codex", type: "agent", command: "codex" }]
      },
      `/tmp/${PROJECT_CONFIG_FILE}`,
      "file"
    );

    expect(loaded.source).toBe("file");
    expect(loaded.config.terminals[0]?.name).toBe("Codex");
  });

  it("normalizes codex terminals for the desktop runtime", () => {
    expect(normalizeTerminalCommand("codex")).toBe(buildDefaultCodexCommand());
    expect(normalizeTerminalCommand("codex exec")).toBe(
      "codex exec --dangerously-bypass-approvals-and-sandbox --no-alt-screen"
    );
  });

  it("preserves explicit codex sandbox choices", () => {
    expect(normalizeTerminalCommand("codex --sandbox workspace-write")).toBe(
      "codex --sandbox workspace-write --no-alt-screen"
    );
  });
});
