import { useEffect, useMemo, useRef, useState } from "react";

import { ChangesPanel, type ChangeGroupView } from "../components/changes-panel";
import { DiffPanel, type DiffMode } from "../components/diff-panel";
import { GithubConfigPanel } from "../components/github-config-panel";
import { GithubIssuesPanel } from "../components/github-issues-panel";
import { TaskLoopPanel } from "../components/task-loop-panel";
import {
  Sidebar,
  type SidebarProjectItem,
  type WorkspaceTab
} from "../components/sidebar";
import {
  TerminalPanel,
  type TerminalMode,
  type TerminalSessionView,
  type TerminalTemplateView
} from "../components/terminal-panel";
import { Topbar, type ActiveAgentPill } from "../components/topbar";
import { type UiAgentState, type UiSafeMode } from "../components/status-badge";
import { getDesktopApi } from "../lib/desktop-api";
import {
  addToGitIgnore,
  commitFiles,
  createTerminal,
  fetchAuditEvents,
  fetchCommitDiff,
  fetchDiff,
  fetchHistory,
  generateCommitMessage,
  importProject,
  removeProject,
  fetchSnapshot,
  fetchTerminalOutput,
  openProjectInIde,
  renameWorkspace,
  resizeTerminal,
  restartTerminal,
  saveProjectLayout,
  stageFile,
  terminateTerminal,
  unstageFile,
  writeTerminal
} from "../lib/queries";
import type {
  AgentSuspicion,
  AuditEvent,
  DiffPreview,
  FileHistoryEntry,
  GitFileChange,
  ProjectSnapshot,
  TerminalChunkRecord,
  WorkspaceSnapshot
} from "@agent-workbench/types";
import type { SystemStatsEvent } from "@agent-workbench/shared";

export function AppShell() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [selectedChangeKey, setSelectedChangeKey] = useState("");
  const [terminalMode, setTerminalMode] = useState<TerminalMode>("focus");
  const [diffMode, setDiffMode] = useState<DiffMode>("side");
  const [safeMode, setSafeMode] = useState<UiSafeMode>("audit");
  const [terminalOutput, setTerminalOutput] = useState<Record<string, TerminalChunkRecord[]>>({});
  const [selectedDiff, setSelectedDiff] = useState<DiffPreview | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<FileHistoryEntry[]>([]);
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [changesPanelView, setChangesPanelView] = useState<"changes" | "issues" | "github-config" | "taskloop">("changes");
  const [importError, setImportError] = useState<string | null>(null);
  const [gitError, setGitError] = useState<string | null>(null);
  const [ideError, setIdeError] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStatsEvent | null>(null);
  const loadedProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    void refreshSnapshot();
  }, []);

  useEffect(() => {
    const unsubscribeOutput = getDesktopApi().onTerminalOutput((event) => {
      setTerminalOutput((current) => ({
        ...current,
        [event.sessionId]: [...(current[event.sessionId] ?? []), event.chunk]
      }));
    });

    const unsubscribeExit = getDesktopApi().onTerminalExit(() => {
      void refreshSnapshot();
    });

    const unsubscribeStateChange = getDesktopApi().onTerminalStateChange((event) => {
      setSnapshot((current) => {
        if (!current) {
          return current;
        }

        const updatedProjects = current.projects.map((project) => ({
          ...project,
          sessions: project.sessions.map((session) =>
            session.id === event.sessionId ? { ...session, state: event.state } : session
          )
        }));

        const activeAgents = updatedProjects
          .flatMap((p) =>
            p.sessions
              .filter((s) => !(s.state === "failed" && s.exitCode === -1))
              .map((s) => ({
                sessionId: s.id,
                projectId: s.projectId,
                projectName: p.project.name,
                terminalName: s.name,
                state: s.state,
                startedAt: s.startedAt
              }))
          )
          .sort((left, right) => {
            const rank: Record<string, number> = { "waiting-input": 0, failed: 1, running: 2, completed: 3 };
            return (rank[left.state] ?? 4) - (rank[right.state] ?? 4);
          });

        return { ...current, projects: updatedProjects, activeAgents };
      });
    });

    const unsubscribeGitStatus = getDesktopApi().onGitStatusChanged((event) => {
      setSnapshot((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          projects: current.projects.map((project) =>
            project.project.id === event.projectId
              ? {
                  ...project,
                  git: {
                    ...project.git,
                    groups: event.groups,
                    suspicion: event.suspicion
                  }
                }
              : project
          )
        };
      });
    });

    const unsubscribeAudit = getDesktopApi().onAuditEventDetected((event) => {
      setAuditEvents((current) => [event.event, ...current]);
    });

    const unsubscribeIssueDispatched = getDesktopApi().onGithubIssueDispatched((event) => {
      void refreshSnapshot().then(() => {
        setActiveTerminalId(event.sessionId);
      });
    });

    const unsubscribeSystemStats = getDesktopApi().onSystemStats((event) => {
      setSystemStats(event);
    });

    return () => {
      unsubscribeOutput();
      unsubscribeExit();
      unsubscribeStateChange();
      unsubscribeGitStatus();
      unsubscribeAudit();
      unsubscribeIssueDispatched();
      unsubscribeSystemStats();
    };
  }, []);

  const workspaceTabs = useMemo<WorkspaceTab[]>(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      count: snapshot.projects.filter((project) => project.project.workspaceId === workspace.id)
        .length
    }));
  }, [snapshot]);

  const projects = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.projects.filter((project) => project.project.workspaceId === workspaceId);
  }, [snapshot, workspaceId]);

  const selectedProject = useMemo(() => {
    return projects.find((project) => project.project.id === projectId) ?? projects[0] ?? null;
  }, [projectId, projects]);

  const sidebarProjects = useMemo<SidebarProjectItem[]>(() => {
    return projects.map((project) => ({
      id: project.project.id,
      name: project.project.name,
      path: project.project.path,
      branch: "—",
      changed: countChanges(project),
      waiting: project.sessions.filter((session) => session.state === "waiting-input").length,
      errors: project.sessions.filter(
        (session) => session.state === "failed" && session.exitCode !== -1
      ).length,
      terminals: getVisibleSessions(project).length
    }));
  }, [projects]);

  const activeAgents = useMemo<ActiveAgentPill[]>(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.activeAgents.map((agent) => ({
      id: agent.sessionId,
      projectId: agent.projectId,
      project: agent.projectName,
      name: agent.terminalName,
      state: mapSessionState(agent.state)
    }));
  }, [snapshot]);

  const templates = useMemo<TerminalTemplateView[]>(() => {
    return selectedProject?.config.config.terminals.map((terminal) => ({
      name: terminal.name,
      type: terminal.type,
      command: terminal.command
    })) ?? [];
  }, [selectedProject]);

  const terminalViews = useMemo<TerminalSessionView[]>(() => {
    if (!selectedProject) {
      return [];
    }

    return getVisibleSessions(selectedProject).map((session) => ({
      id: session.id,
      projectId: session.projectId,
      name: session.name,
      agent: normalizeAgentName(session.name),
      monogram: session.name.charAt(0).toUpperCase(),
      cmd: session.command,
      cwd: session.cwd,
      state: mapSessionState(session.state),
      previewLines: buildTerminalPreview(terminalOutput[session.id] ?? [])
    }));
  }, [selectedProject, terminalOutput]);

  const changeGroups = useMemo<ChangeGroupView[]>(() => {
    if (!selectedProject) {
      return [];
    }

    return selectedProject.git.groups.map((group) => ({
      group: group.label,
      items: group.items.map((item) => mapChangeItem(item, selectedProject.git.suspicion))
    }));
  }, [selectedProject]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    if (!workspaceId) {
      setWorkspaceId(snapshot.workspaces[0]?.id ?? "");
      return;
    }

    if (!snapshot.workspaces.some((workspace) => workspace.id === workspaceId)) {
      setWorkspaceId(snapshot.workspaces[0]?.id ?? "");
    }
  }, [snapshot, workspaceId]);

  useEffect(() => {
    if (!selectedProject) {
      loadedProjectIdRef.current = null;
      setAuditEvents([]);
      return;
    }

    void fetchAuditEvents(selectedProject.project.id).then(setAuditEvents);

    loadedProjectIdRef.current = selectedProject.project.id;
    setSafeMode(selectedProject.config.config.safeMode);
    setTerminalMode(selectedProject.layout.terminalMode);
    setDiffMode(selectedProject.layout.diffMode === "inline" ? "inline" : "side");
    const visibleSessions = getVisibleSessions(selectedProject);
    const hasStoredActiveSession =
      selectedProject.layout.activeSessionId !== null &&
      visibleSessions.some((session) => session.id === selectedProject.layout.activeSessionId);

    setActiveTerminalId(
      hasStoredActiveSession
        ? selectedProject.layout.activeSessionId
        : visibleSessions[0]?.id ?? null
    );

    const nextSelectedFile =
      selectedProject.layout.selectedFilePath ??
      selectedProject.git.groups[0]?.items[0]?.path ??
      selectedProject.git.diff.filePath;

    setSelectedChangeKey(nextSelectedFile);
    setSelectedCommitHash(null);
    setSelectedDiff(
      selectedProject.git.diff.filePath === nextSelectedFile ? selectedProject.git.diff : null
    );
    setSelectedHistory(
      selectedProject.git.diff.filePath === nextSelectedFile ? selectedProject.git.history : []
    );
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject) {
      return;
    }

    for (const session of selectedProject.sessions) {
      if (terminalOutput[session.id]) {
        continue;
      }

      void fetchTerminalOutput(session.id).then((chunks) => {
        setTerminalOutput((current) => ({
          ...current,
          [session.id]: chunks
        }));
      });
    }
  }, [selectedProject, terminalOutput]);

  useEffect(() => {
    if (!selectedProject || !selectedChangeKey) {
      return;
    }

    setSelectedCommitHash(null);

    const isStaged = selectedProject.git.groups
      .flatMap((g) => g.items)
      .find((item) => item.path === selectedChangeKey)?.status === "staged";

    if (selectedProject.git.diff.filePath === selectedChangeKey) {
      setSelectedDiff(selectedProject.git.diff);
      setSelectedHistory(selectedProject.git.history);
      return;
    }

    let cancelled = false;

    void Promise.all([
      fetchDiff(
        selectedProject.project.id,
        selectedChangeKey,
        diffMode === "inline" ? "inline" : "side-by-side",
        isStaged
      ),
      fetchHistory(selectedProject.project.id, selectedChangeKey)
    ]).then(([diff, history]) => {
      if (cancelled) {
        return;
      }

      setSelectedDiff(diff);
      setSelectedHistory(history);
    });

    return () => {
      cancelled = true;
    };
  }, [diffMode, selectedChangeKey, selectedProject]);

  useEffect(() => {
    if (!selectedProject || loadedProjectIdRef.current !== selectedProject.project.id) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void saveProjectLayout({
        projectId: selectedProject.project.id,
        activeSessionId: activeTerminalId,
        terminalMode,
        diffMode: diffMode === "inline" ? "inline" : "side-by-side",
        selectedFilePath: selectedChangeKey || null
      });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    activeTerminalId,
    diffMode,
    selectedChangeKey,
    selectedProject,
    terminalMode
  ]);

  async function refreshSnapshot() {
    const nextSnapshot = await fetchSnapshot();
    setSnapshot(nextSnapshot);
  }

  async function handleRemoveProject(projectId: string) {
    await removeProject(projectId);
    if (projectId === selectedProject?.project.id) {
      setProjectId("");
    }
    await refreshSnapshot();
  }

  async function handleRenameWorkspace(workspaceId: string, name: string) {
    await renameWorkspace(workspaceId, name);
    await refreshSnapshot();
  }

  async function handleAddProject() {
    try {
      setImportError(null);
      const result = await importProject(workspaceId || undefined);

      if (result.status === "error") {
        setImportError(result.message);
        return;
      }

      if (result.status !== "imported") {
        return;
      }

      await refreshSnapshot();
      setWorkspaceId(result.workspaceId);
      setProjectId(result.projectId);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Failed to import project.");
    }
  }

  async function handleCreateTerminal(template: TerminalTemplateView) {
    if (!selectedProject) {
      return;
    }

    const session = await createTerminal(
      selectedProject.project.id,
      template.name,
      template.command
    );

    setActiveTerminalId(session.id);
    await refreshSnapshot();
  }

  async function handleTerminalInput(sessionId: string, input: string) {
    if (!input) {
      return;
    }

    await writeTerminal(sessionId, input);
  }

  async function handleTerminalResize(sessionId: string, cols: number, rows: number) {
    if (cols <= 0 || rows <= 0) {
      return;
    }

    await resizeTerminal(sessionId, cols, rows);
  }

  async function handleTerminateTerminal(sessionId: string) {
    await terminateTerminal(sessionId);
    await refreshSnapshot();
  }

  async function handleRestartTerminal(sessionId: string) {
    const session = await restartTerminal(sessionId);
    setActiveTerminalId(session.id);
    await refreshSnapshot();
  }

  async function handleStageFile(filePath: string) {
    if (!selectedProject) {
      return;
    }

    try {
      setGitError(null);
      const groups = await stageFile(selectedProject.project.id, filePath);
      setSnapshot((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          projects: current.projects.map((project) =>
            project.project.id === selectedProject.project.id
              ? { ...project, git: { ...project.git, groups } }
              : project
          )
        };
      });
    } catch (error) {
      setGitError(error instanceof Error ? error.message : "Git stage failed.");
    }
  }

  async function handleGitIgnore(filePath: string) {
    if (!selectedProject) {
      return;
    }

    try {
      setGitError(null);
      await addToGitIgnore(selectedProject.project.id, filePath);
    } catch (error) {
      setGitError(error instanceof Error ? error.message : "Failed to add to .gitignore.");
    }
  }

  async function handleSelectCommit(hash: string | null) {
    if (!selectedProject || !selectedChangeKey) {
      return;
    }

    setSelectedCommitHash(hash);

    if (!hash) {
      const isStaged = selectedProject.git.groups
        .flatMap((g) => g.items)
        .find((item) => item.path === selectedChangeKey)?.status === "staged";

      const diff = await fetchDiff(
        selectedProject.project.id,
        selectedChangeKey,
        diffMode === "inline" ? "inline" : "side-by-side",
        isStaged
      );
      setSelectedDiff(diff);
      return;
    }

    const diff = await fetchCommitDiff(
      selectedProject.project.id,
      hash,
      selectedChangeKey,
      diffMode === "inline" ? "inline" : "side-by-side"
    );
    setSelectedDiff(diff);
  }

  async function handleIssueDispatched(sessionId: string) {
    await refreshSnapshot();
    setActiveTerminalId(sessionId);
    setChangesPanelView("changes");
  }

  async function handleGitHubConfigSaved() {
    await refreshSnapshot();
    setChangesPanelView("changes");
  }

  function handleAgentClick(sessionId: string, targetProjectId: string) {
    if (!snapshot) {
      return;
    }

    const target = snapshot.projects.find((p) => p.project.id === targetProjectId);
    if (!target) {
      return;
    }

    setWorkspaceId(target.project.workspaceId);
    setProjectId(targetProjectId);
    setActiveTerminalId(sessionId);
  }

  async function handleCommit(message: string) {
    if (!selectedProject) {
      return;
    }

    const groups = await commitFiles(selectedProject.project.id, message);
    setSnapshot((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        projects: current.projects.map((project) =>
          project.project.id === selectedProject.project.id
            ? { ...project, git: { ...project.git, groups } }
            : project
        )
      };
    });
  }

  async function handleGenerateCommitMessage(): Promise<string> {
    if (!selectedProject) {
      throw new Error("No project selected.");
    }

    return generateCommitMessage(selectedProject.project.id);
  }

  async function handleUnstageFile(filePath: string) {
    if (!selectedProject) {
      return;
    }

    try {
      setGitError(null);
      const groups = await unstageFile(selectedProject.project.id, filePath);
      setSnapshot((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          projects: current.projects.map((project) =>
            project.project.id === selectedProject.project.id
              ? { ...project, git: { ...project.git, groups } }
              : project
          )
        };
      });
    } catch (error) {
      setGitError(error instanceof Error ? error.message : "Git unstage failed.");
    }
  }

  if (!snapshot) {
    return <div className="fd-app-shell" />;
  }

  const workspaceName =
    snapshot.workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? "—";

  return (
    <div className="fd-app-shell">
      <Topbar
        activeAgents={activeAgents}
        branch={selectedProject?.project.name ? "—" : ""}
        onAgentClick={handleAgentClick}
        onToggleSafeMode={() =>
          setSafeMode((current) =>
            current === "off" ? "audit" : current === "audit" ? "protect" : "off"
          )
        }
        project={selectedProject?.project.name ?? ""}
        safeMode={safeMode}
        workspace={workspaceName}
      />

      <main className="fd-main-grid">
        <Sidebar
          importError={importError}
          onAddProject={() => void handleAddProject()}
          onProjectChange={setProjectId}
          onWorkspaceChange={(nextWorkspace) => {
            setWorkspaceId(nextWorkspace);
            setProjectId(
              snapshot.projects.find((project) => project.project.workspaceId === nextWorkspace)
                ?.project.id ?? ""
            );
          }}
          onRemoveProject={(id) => void handleRemoveProject(id)}
          onWorkspaceRename={(id, name) => void handleRenameWorkspace(id, name)}
          projectId={selectedProject?.project.id ?? projectId}
          projects={sidebarProjects}
          workspaceId={workspaceId}
          workspaces={workspaceTabs}
        />
        {selectedProject ? (
          <>
            <TerminalPanel
              activeTerminalId={activeTerminalId}
              auditEvents={auditEvents.filter(
                (e) => e.projectId === selectedProject.project.id
              )}
              onCreateTerminal={handleCreateTerminal}
              onRestartTerminal={(sessionId) => void handleRestartTerminal(sessionId)}
              onTerminalInput={(sessionId, input) => void handleTerminalInput(sessionId, input)}
              onTerminalModeChange={setTerminalMode}
              onTerminalResize={(sessionId, cols, rows) =>
                void handleTerminalResize(sessionId, cols, rows)
              }
              onTerminalSelect={setActiveTerminalId}
              onTerminateTerminal={(sessionId) => void handleTerminateTerminal(sessionId)}
              terminalOutput={terminalOutput}
              templates={templates}
              terminalMode={terminalMode}
              terminals={terminalViews}
            />
            {changesPanelView === "github-config" ? (
              <GithubConfigPanel
                currentConfig={selectedProject.config.config.github ?? null}
                onClose={() => setChangesPanelView("changes")}
                onSaved={() => void handleGitHubConfigSaved()}
                projectId={selectedProject.project.id}
              />
            ) : changesPanelView === "issues" && selectedProject.config.config.github ? (
              <GithubIssuesPanel
                projectId={selectedProject.project.id}
                onShowChanges={() => setChangesPanelView("changes")}
                onShowGitHubConfig={() => setChangesPanelView("github-config")}
                onIssueDispatched={(sessionId) => void handleIssueDispatched(sessionId)}
              />
            ) : changesPanelView === "taskloop" ? (
              <TaskLoopPanel
                projectId={selectedProject.project.id}
                onShowChanges={() => setChangesPanelView("changes")}
                onShowTerminal={(sessionId) => {
                  void refreshSnapshot().then(() => setActiveTerminalId(sessionId));
                }}
              />
            ) : (
              <ChangesPanel
                gitError={gitError}
                groups={changeGroups}
                hasGithub={!!selectedProject.config.config.github}
                onCommit={(message) => handleCommit(message)}
                onGenerateCommitMessage={() => handleGenerateCommitMessage()}
                onGitIgnore={(filePath) => void handleGitIgnore(filePath)}
                onSelectChange={setSelectedChangeKey}
                onShowGitHubConfig={() => setChangesPanelView("github-config")}
                onShowIssues={() => setChangesPanelView("issues")}
                onShowTaskLoop={() => setChangesPanelView("taskloop")}
                onStageChange={(filePath) => void handleStageFile(filePath)}
                onUnstageChange={(filePath) => void handleUnstageFile(filePath)}
                selectedChangeKey={selectedChangeKey}
              />
            )}
            <DiffPanel
              absoluteFilePath={`${selectedProject.project.path}/${selectedChangeKey}`}
              commits={selectedHistory}
              diff={selectedDiff ?? undefined}
              diffMode={diffMode}
              filePath={selectedChangeKey}
              ideError={ideError}
              ideName={selectedProject.config.config.ide.command}
              selectedCommitHash={selectedCommitHash}
              onDiffModeChange={setDiffMode}
              onOpenFileInIde={() => {
                setIdeError(null);
                void openProjectInIde(selectedProject.project.id, selectedChangeKey).catch(
                  (error) => setIdeError(error instanceof Error ? error.message : "Failed to open file in IDE.")
                );
              }}
              onOpenProjectInIde={() => {
                setIdeError(null);
                void openProjectInIde(selectedProject.project.id).catch(
                  (error) => setIdeError(error instanceof Error ? error.message : "Failed to open project in IDE.")
                );
              }}
              onSelectCommit={(hash) => void handleSelectCommit(hash)}
            />
          </>
        ) : null}
      </main>

      <footer className="fd-statusbar">
        {selectedProject ? (
          <>
            <span className="mono">{selectedProject.project.path}</span>
            <span>{terminalViews.length} terminals</span>
            <span>{changeGroups.reduce((sum, group) => sum + group.items.length, 0)} changes</span>
          </>
        ) : null}
        {systemStats ? (
          <div className="fd-sys-stats">
            <div className="fd-sys-stat">
              <span className="fd-sys-stat-label">CPU</span>
              <div className="fd-sys-bar">
                <div
                  className="fd-sys-bar-fill"
                  style={{ width: `${systemStats.cpuPercent}%`, backgroundColor: cpuColor(systemStats.cpuPercent) }}
                />
              </div>
              <span className="fd-sys-stat-value">{systemStats.cpuPercent}%</span>
            </div>
            <div className="fd-sys-stat">
              <span className="fd-sys-stat-label">MEM</span>
              <div className="fd-sys-bar">
                <div
                  className="fd-sys-bar-fill"
                  style={{ width: `${Math.round(systemStats.memUsedMb / systemStats.memTotalMb * 100)}%`, backgroundColor: cpuColor(Math.round(systemStats.memUsedMb / systemStats.memTotalMb * 100)) }}
                />
              </div>
              <span className="fd-sys-stat-value">{(systemStats.memUsedMb / 1024).toFixed(1)}/{(systemStats.memTotalMb / 1024).toFixed(0)} GB</span>
            </div>
          </div>
        ) : null}
      </footer>
    </div>
  );
}

function countChanges(project: ProjectSnapshot): number {
  return project.git.groups.reduce((sum, group) => sum + group.items.length, 0);
}

function mapSessionState(
  state: "running" | "waiting-input" | "completed" | "failed"
): UiAgentState {
  if (state === "waiting-input") {
    return "waiting";
  }

  if (state === "failed") {
    return "error";
  }

  return state;
}

function normalizeAgentName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function buildTerminalPreview(chunks: TerminalChunkRecord[]): string[] {
  return chunks
    .flatMap((chunk) => chunk.content.split(/\r?\n/))
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-8);
}

function getVisibleSessions(project: ProjectSnapshot) {
  return project.sessions.filter((session) => {
    return !(session.state === "failed" && session.exitCode === -1);
  });
}

function mapChangeItem(
  item: GitFileChange,
  suspicion: AgentSuspicion | null
): ChangeGroupView["items"][number] {
  const [directory, file] = splitPath(item.path);

  return {
    key: item.path,
    path: directory,
    file,
    add: 0,
    del: 0,
    staged: item.status === "staged",
    gtype: mapGitType(item.status),
    multi: (suspicion?.suspectedSource.length ?? 0) >= 2,
    sources:
      suspicion?.suspectedSource.map((source) => ({
        agent: source,
        terminal: source
      })) ?? [],
    confidence: suspicion?.confidence
  };
}

function mapGitType(status: GitFileChange["status"]): "C" | "M" | "U" | "R" | "D" {
  if (status === "conflicted") {
    return "C";
  }

  if (status === "renamed") {
    return "R";
  }

  if (status === "deleted") {
    return "D";
  }

  if (status === "untracked") {
    return "U";
  }

  return "M";
}

function cpuColor(percent: number): string {
  if (percent >= 80) return "var(--state-err)";
  if (percent >= 50) return "var(--state-run)";
  return "var(--state-ok)";
}

function splitPath(filePath: string): [string, string] {
  const index = filePath.lastIndexOf("/");

  if (index === -1) {
    return ["", filePath];
  }

  return [filePath.slice(0, index + 1), filePath.slice(index + 1)];
}
