import { EventEmitter } from "node:events";
import { createRequire } from "node:module";

import type { IPty, spawn as PtySpawn } from "node-pty";

const require = createRequire(import.meta.url);
const pty = require("node-pty") as {
  spawn: typeof PtySpawn;
};

export interface SpawnTerminalInput {
  id: string;
  name: string;
  cwd: string;
  command: string;
  env?: NodeJS.ProcessEnv;
}

export interface TerminalOutputMessage {
  sessionId: string;
  stream: "stdout" | "stderr" | "system";
  content: string;
}

export interface TerminalExitMessage {
  sessionId: string;
  exitCode: number;
}

interface ManagedTerminal {
  pty: IPty;
  name: string;
  terminatedByUser: boolean;
}

export class TerminalManager extends EventEmitter {
  private readonly sessions = new Map<string, ManagedTerminal>();

  spawn(input: SpawnTerminalInput): void {
    const shell = "bash";
    const args =
      input.command === shell ? ["-l"] : ["-lc", input.command];

    const instance = pty.spawn(shell, args, {
      name: "xterm-256color",
      cwd: input.cwd,
      cols: 120,
      rows: 32,
      env: {
        ...process.env,
        ...input.env
      }
    });

    instance.onData((content) => {
      this.emit("output", {
        sessionId: input.id,
        stream: "stdout",
        content
      } satisfies TerminalOutputMessage);
    });

    instance.onExit(({ exitCode }) => {
      const managed = this.sessions.get(input.id);
      this.sessions.delete(input.id);
      this.emit("exit", {
        sessionId: input.id,
        exitCode: managed?.terminatedByUser ? -1 : exitCode
      } satisfies TerminalExitMessage);
    });

    this.sessions.set(input.id, {
      pty: instance,
      name: input.name,
      terminatedByUser: false
    });
  }

  write(sessionId: string, input: string): void {
    this.sessions.get(sessionId)?.pty.write(input);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.pty.resize(cols, rows);
  }

  terminate(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return;
    }

    session.terminatedByUser = true;
    session.pty.kill();
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
}
