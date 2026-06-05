import { EventEmitter } from "node:events";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import type { IPty, spawn as PtySpawn } from "node-pty";
import type { AiTerminalSessionRecord, CommandBlock } from "../../types/src/index";

const require = createRequire(import.meta.url);
const pty = require("node-pty") as { spawn: typeof PtySpawn };

// Shell init: sources user's bashrc then hooks PROMPT_COMMAND to emit an OSC marker.
// \x1b]9001;forge_prompt;{exitcode};{base64(cwd)}\x07 fires before each new prompt.
const SHELL_INIT = `\
if [ -f /etc/bash.bashrc ]; then . /etc/bash.bashrc 2>/dev/null; fi
if [ -f ~/.bashrc ]; then . ~/.bashrc 2>/dev/null; fi

# Disable bracketed paste to prevent \e[?2004l artifacts in commands
bind 'set enable-bracketed-paste off' 2>/dev/null || true

__forge_precmd() {
  local code=$?
  printf '\\x1b]9001;forge_prompt;%d;%s\\x07' "$code" "$(pwd | base64 -w0)"
}

if [[ -n "$PROMPT_COMMAND" ]]; then
  PROMPT_COMMAND="__forge_precmd; $PROMPT_COMMAND"
else
  PROMPT_COMMAND="__forge_precmd"
fi
`;

const FORGE_PROMPT_RE = /\x1b\]9001;forge_prompt;(\d+);([A-Za-z0-9+/=]*)\x07/g;

interface ManagedSession {
  pty: IPty;
  record: AiTerminalSessionRecord;
  blocks: CommandBlock[];
  runningBlock: CommandBlock | null;
  rcFile: string;
}

export interface AiTerminalBlockStartEvent {
  sessionId: string;
  block: CommandBlock;
}

export interface AiTerminalBlockChunkEvent {
  sessionId: string;
  blockId: string;
  chunk: string;
}

export interface AiTerminalBlockEndEvent {
  sessionId: string;
  blockId: string;
  exitCode: number;
  cwd: string;
  completedAt: string;
}

export interface AiTerminalPromptEvent {
  sessionId: string;
  cwd: string;
  exitCode: number;
}

export interface AiTerminalExitEvent {
  sessionId: string;
}

export class AiTerminalManager extends EventEmitter {
  private readonly sessions = new Map<string, ManagedSession>();

  create(record: AiTerminalSessionRecord): void {
    const rcFile = join(tmpdir(), `forge-ai-${record.id}.bashrc`);
    writeFileSync(rcFile, SHELL_INIT, "utf8");

    const instance = pty.spawn("bash", ["--rcfile", rcFile], {
      name: "xterm-256color",
      cwd: record.cwd,
      cols: 220,
      rows: 50,
      env: { ...process.env }
    });

    const managed: ManagedSession = {
      pty: instance,
      record,
      blocks: [],
      runningBlock: null,
      rcFile
    };

    instance.onData((data) => this.handleData(record.id, managed, data));

    instance.onExit(() => {
      this.sessions.delete(record.id);
      try { unlinkSync(rcFile); } catch { /* ignore */ }
      this.emit("exit", { sessionId: record.id } satisfies AiTerminalExitEvent);
    });

    this.sessions.set(record.id, managed);
  }

  private handleData(sessionId: string, managed: ManagedSession, data: string): void {
    // Strip OSC markers from display output and process them
    let clean = "";
    let last = 0;

    FORGE_PROMPT_RE.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = FORGE_PROMPT_RE.exec(data)) !== null) {
      clean += data.slice(last, match.index);
      last = match.index + match[0].length;

      const exitCode = parseInt(match[1] ?? "0", 10);
      const cwdRaw = match[2] ?? "";
      let cwd = managed.record.cwd;
      try {
        cwd = Buffer.from(cwdRaw, "base64").toString("utf8").trim() || cwd;
      } catch { /* ignore */ }

      this.handlePrompt(sessionId, managed, exitCode, cwd);
    }

    clean += data.slice(last);

    if (managed.runningBlock && clean) {
      managed.runningBlock.output += clean;
      this.emit("blockChunk", {
        sessionId,
        blockId: managed.runningBlock.id,
        chunk: clean
      } satisfies AiTerminalBlockChunkEvent);
    }
  }

  private handlePrompt(
    sessionId: string,
    managed: ManagedSession,
    exitCode: number,
    cwd: string
  ): void {
    if (managed.runningBlock) {
      const completedAt = new Date().toISOString();
      managed.runningBlock.exitCode = exitCode;
      managed.runningBlock.cwd = cwd;
      managed.runningBlock.completedAt = completedAt;
      managed.runningBlock.isRunning = false;
      managed.blocks.push({ ...managed.runningBlock });

      this.emit("blockEnd", {
        sessionId,
        blockId: managed.runningBlock.id,
        exitCode,
        cwd,
        completedAt
      } satisfies AiTerminalBlockEndEvent);

      managed.runningBlock = null;
      managed.record.state = "idle";
    }

    managed.record.cwd = cwd;
    this.emit("prompt", { sessionId, cwd, exitCode } satisfies AiTerminalPromptEvent);
  }

  sendCommand(sessionId: string, command: string): CommandBlock | null {
    const managed = this.sessions.get(sessionId);
    if (!managed || managed.runningBlock) return null;

    const block: CommandBlock = {
      id: randomUUID(),
      sessionId,
      command,
      cwd: managed.record.cwd,
      output: "",
      exitCode: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      isRunning: true
    };

    managed.runningBlock = block;
    managed.record.state = "running";
    managed.pty.write(`${command}\r`);

    this.emit("blockStart", {
      sessionId,
      block: { ...block }
    } satisfies AiTerminalBlockStartEvent);

    return { ...block };
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.pty.resize(cols, rows);
  }

  terminate(sessionId: string): void {
    const managed = this.sessions.get(sessionId);
    if (!managed) return;
    managed.pty.kill();
    try { unlinkSync(managed.rcFile); } catch { /* ignore */ }
    this.sessions.delete(sessionId);
  }

  getBlocks(sessionId: string): CommandBlock[] {
    const managed = this.sessions.get(sessionId);
    if (!managed) return [];
    const blocks = [...managed.blocks];
    if (managed.runningBlock) blocks.push({ ...managed.runningBlock });
    return blocks;
  }

  getRecord(sessionId: string): AiTerminalSessionRecord | undefined {
    return this.sessions.get(sessionId)?.record;
  }

  listSessions(projectId: string): AiTerminalSessionRecord[] {
    return [...this.sessions.values()]
      .filter((s) => s.record.projectId === projectId)
      .map((s) => ({ ...s.record }));
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
}
