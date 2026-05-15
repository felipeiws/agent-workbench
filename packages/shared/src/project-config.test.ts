import { describe, expect, it } from "vitest";

import {
  PROJECT_CONFIG_FILE,
  buildDefaultProjectConfig,
  parseProjectConfig
} from "./project-config";

describe("project-config", () => {
  it("builds a default agent workspace config", () => {
    const config = buildDefaultProjectConfig("bridge");

    expect(config.project).toBe("bridge");
    expect(config.safeMode).toBe("audit");
    expect(config.terminals).toHaveLength(3);
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
});
