import { create } from "zustand";

import type {
  DiffPreview,
  LoadedProjectConfig,
  ProjectSnapshot,
  TerminalChunkRecord,
  TerminalSessionRecord,
  WorkspaceSnapshot
} from "@agent-workbench/types";

interface WorkbenchState {
  snapshot: WorkspaceSnapshot | null;
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  diffMode: DiffPreview["mode"];
  terminalOutput: Record<string, TerminalChunkRecord[]>;
  projectConfigs: Record<string, LoadedProjectConfig>;
  setSnapshot: (snapshot: WorkspaceSnapshot) => void;
  setSelectedProject: (projectId: string) => void;
  setSelectedSession: (sessionId: string | null) => void;
  setDiffMode: (mode: DiffPreview["mode"]) => void;
  appendChunk: (sessionId: string, chunk: TerminalChunkRecord) => void;
  setOutput: (sessionId: string, chunks: TerminalChunkRecord[]) => void;
  setProjectConfig: (projectId: string, config: LoadedProjectConfig) => void;
  updateSession: (session: TerminalSessionRecord) => void;
}

function upsertSession(project: ProjectSnapshot, session: TerminalSessionRecord): ProjectSnapshot {
  const sessions = project.sessions.some((item) => item.id === session.id)
    ? project.sessions.map((item) => (item.id === session.id ? session : item))
    : [session, ...project.sessions];

  return {
    ...project,
    sessions
  };
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  snapshot: null,
  selectedProjectId: null,
  selectedSessionId: null,
  diffMode: "side-by-side",
  terminalOutput: {},
  projectConfigs: {},
  setSnapshot: (snapshot) =>
    set((state) => ({
      snapshot,
      selectedProjectId: state.selectedProjectId ?? snapshot.projects[0]?.project.id ?? null
    })),
  setSelectedProject: (selectedProjectId) =>
    set({
      selectedProjectId,
      selectedSessionId: null
    }),
  setSelectedSession: (selectedSessionId) => set({ selectedSessionId }),
  setDiffMode: (diffMode) => set({ diffMode }),
  appendChunk: (sessionId, chunk) =>
    set((state) => ({
      terminalOutput: {
        ...state.terminalOutput,
        [sessionId]: [...(state.terminalOutput[sessionId] ?? []), chunk]
      }
    })),
  setOutput: (sessionId, chunks) =>
    set((state) => ({
      terminalOutput: {
        ...state.terminalOutput,
        [sessionId]: chunks
      }
    })),
  setProjectConfig: (projectId, config) =>
    set((state) => ({
      projectConfigs: {
        ...state.projectConfigs,
        [projectId]: config
      }
    })),
  updateSession: (session) =>
    set((state) => {
      if (!state.snapshot) {
        return state;
      }

      return {
        snapshot: {
          ...state.snapshot,
          projects: state.snapshot.projects.map((project) =>
            project.project.id === session.projectId ? upsertSession(project, session) : project
          )
        },
        selectedSessionId: state.selectedSessionId ?? session.id
      };
    })
}));
