import { Bot, Play, SquareTerminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";

import { Badge, Button, Card, CardContent, CardHeader, ScrollArea } from "@agent-workbench/ui";

import { createTerminal, fetchTerminalOutput } from "@/lib/queries";
import { getDesktopApi } from "@/lib/desktop-api";
import { useWorkbenchStore } from "@/lib/store";
import type {
  TerminalExitEvent,
  TerminalOutputEvent
} from "@agent-workbench/shared";

export function TerminalPanel() {
  const snapshot = useWorkbenchStore((state) => state.snapshot);
  const selectedProjectId = useWorkbenchStore((state) => state.selectedProjectId);
  const selectedSessionId = useWorkbenchStore((state) => state.selectedSessionId);
  const setSelectedSession = useWorkbenchStore((state) => state.setSelectedSession);
  const appendChunk = useWorkbenchStore((state) => state.appendChunk);
  const terminalOutput = useWorkbenchStore((state) => state.terminalOutput);
  const setOutput = useWorkbenchStore((state) => state.setOutput);
  const updateSession = useWorkbenchStore((state) => state.updateSession);
  const [isLaunching, setIsLaunching] = useState(false);
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const selectedProject = snapshot?.projects.find(
    (project) => project.project.id === selectedProjectId
  );

  const selectedSession =
    selectedProject?.sessions.find((session) => session.id === selectedSessionId) ??
    selectedProject?.sessions[0] ??
    null;

  useEffect(() => {
    const instance = new Terminal({
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      theme: {
        background: "#06101b",
        foreground: "#d9e5f2",
        cursor: "#28c2a0",
        black: "#0f1729",
        brightBlack: "#2c3b53",
        red: "#ff7a90",
        brightRed: "#ff92a4",
        green: "#28c2a0",
        brightGreen: "#5ae4bf",
        yellow: "#ffcc66",
        brightYellow: "#ffe08a",
        blue: "#67b7ff",
        brightBlue: "#8dcbff",
        magenta: "#d59cff",
        brightMagenta: "#e3bcff",
        cyan: "#43d1ff",
        brightCyan: "#82e0ff",
        white: "#e6edf5",
        brightWhite: "#f8fbff"
      }
    });
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    instance.loadAddon(fitAddon);
    instanceRef.current = instance;

    if (terminalContainerRef.current) {
      instance.open(terminalContainerRef.current);
      fitAddon.fit();
    }

    instance.onData((input) => {
      if (!selectedSession) {
        return;
      }

      void getDesktopApi().terminals.write({
        sessionId: selectedSession.id,
        input
      });
    });

    const removeOutput = getDesktopApi().onTerminalOutput((event: TerminalOutputEvent) => {
      appendChunk(event.sessionId, event.chunk);
      if (event.sessionId === selectedSessionId) {
        instance.write(event.chunk.content);
      }
    });

    const removeExit = getDesktopApi().onTerminalExit((event: TerminalExitEvent) => {
      if (selectedSession && event.sessionId === selectedSession.id) {
        instance.writeln(`\r\n[process exited with code ${event.exitCode}]`);
      }
    });

    return () => {
      removeOutput();
      removeExit();
      instance.dispose();
    };
  }, [appendChunk, selectedSession, selectedSessionId]);

  useEffect(() => {
    if (!selectedSession) {
      return;
    }

    setSelectedSession(selectedSession.id);
    void fetchTerminalOutput(selectedSession.id).then((chunks) => {
      setOutput(selectedSession.id, chunks);
      instanceRef.current?.clear();
      for (const chunk of chunks) {
        instanceRef.current?.write(chunk.content);
      }
      fitAddonRef.current?.fit();
    });
  }, [selectedSession, setOutput, setSelectedSession]);

  const launch = async (name: string, command: string) => {
    if (!selectedProject) {
      return;
    }

    setIsLaunching(true);
    try {
      const session = await createTerminal(selectedProject.project.id, name, command);
      updateSession(session);
      setSelectedSession(session.id);
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <Card className="min-h-[560px]">
      <CardHeader className="border-b border-white/10">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-teal-300/70">Terminals</p>
          <h3 className="mt-1 text-xl font-semibold text-white">Isolated PTY sessions</h3>
        </div>
        {selectedSession ? <Badge>{selectedSession.state}</Badge> : null}
      </CardHeader>
      <CardContent className="grid gap-4 pt-5 xl:grid-cols-[220px,1fr]">
        <div className="space-y-4">
          <div className="grid gap-2">
            {selectedProject?.config.config.terminals.map((terminal) => (
              <Button
                key={`${terminal.name}-${terminal.command}`}
                variant="outline"
                onClick={() => launch(terminal.name, terminal.command)}
                disabled={isLaunching}
              >
                <Play className="mr-2 size-4" />
                {terminal.name}
              </Button>
            ))}
            <Button
              variant="ghost"
              onClick={() => launch("Shell", "bash")}
              disabled={isLaunching}
            >
              <SquareTerminal className="mr-2 size-4" />
              New bash
            </Button>
          </div>
          <ScrollArea className="max-h-[420px] pr-2">
            <div className="space-y-2">
              {selectedProject?.sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedSession?.id === session.id
                      ? "border-teal-400/35 bg-teal-400/10"
                      : "border-white/8 bg-white/[0.03]"
                  }`}
                  onClick={() => setSelectedSession(session.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white">{session.name}</span>
                    <Badge>{session.state}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400">{session.command}</p>
                </button>
              ))}
              {selectedProject?.sessions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
                  Nenhum terminal persistido para este projeto.
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#06101b]">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Bot className="size-4 text-teal-300" />
              {selectedSession ? selectedSession.name : "Select or launch a terminal"}
            </div>
            {selectedSession ? (
              <span className="text-xs text-slate-500">
                {terminalOutput[selectedSession.id]?.length ?? 0} persisted chunks
              </span>
            ) : null}
          </div>
          <div ref={terminalContainerRef} className="h-[500px] w-full p-3" />
        </div>
      </CardContent>
    </Card>
  );
}
