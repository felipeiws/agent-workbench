import { useMemo, useRef, useState } from "react";

import { ForgeIcon } from "./forge-icons";
import { StateDot } from "./status-badge";

export interface WorkspaceTab {
  id: string;
  name: string;
  count: number;
}

export interface SidebarProjectItem {
  id: string;
  name: string;
  path: string;
  branch: string;
  changed: number;
  waiting: number;
  errors: number;
  terminals: number;
}

interface SidebarProps {
  workspaces: WorkspaceTab[];
  workspaceId: string;
  projectId: string;
  onWorkspaceChange: (workspaceId: string) => void;
  onWorkspaceRename: (workspaceId: string, name: string) => void;
  onProjectChange: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
  onAddProject: () => void;
  projects: SidebarProjectItem[];
  importError: string | null;
}

export function Sidebar({
  workspaces,
  workspaceId,
  projectId,
  onWorkspaceChange,
  onWorkspaceRename,
  onProjectChange,
  onRemoveProject,
  onAddProject,
  projects,
  importError
}: SidebarProps) {
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({
    [projectId]: true
  });
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const activeProject = useMemo(() => {
    return projects.find((project) => project.id === projectId) ?? null;
  }, [projectId, projects]);

  return (
    <aside className="fd-panel fd-sidebar">
      <div className="fd-workspace-tabs" role="tablist" aria-label="Workspaces">
        {workspaces.map((workspace) => {
          const isEditing = editingWorkspaceId === workspace.id;

          function startEditing() {
            setEditingWorkspaceId(workspace.id);
            setEditingName(workspace.name);
            setTimeout(() => {
              inputRef.current?.select();
            }, 0);
          }

          function commitRename() {
            const trimmed = editingName.trim();
            if (trimmed && trimmed !== workspace.name) {
              onWorkspaceRename(workspace.id, trimmed);
            }
            setEditingWorkspaceId(null);
          }

          if (isEditing) {
            return (
              <div
                className={`fd-workspace-tab active fd-workspace-tab--editing`}
                key={workspace.id}
                role="tab"
                aria-selected
              >
                <input
                  ref={inputRef}
                  className="fd-workspace-tab-input"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditingWorkspaceId(null);
                  }}
                />
              </div>
            );
          }

          return (
            <button
              aria-selected={workspace.id === workspaceId}
              className={`fd-workspace-tab ${workspace.id === workspaceId ? "active" : ""}`}
              key={workspace.id}
              onClick={() => onWorkspaceChange(workspace.id)}
              onDoubleClick={startEditing}
              role="tab"
              type="button"
            >
              <span>{workspace.name}</span>
              <span className="count">{workspace.count}</span>
            </button>
          );
        })}
      </div>

      <div className="fd-scroll fd-sidebar-body">
        <div className="fd-section-header">
          <span className="label">Projects</span>
          <span className="value">{projects.length}</span>
        </div>

        <div className="fd-project-list">
          {projects.map((project) => {
            const isActive = project.id === projectId;
            const isExpanded = expandedProjects[project.id] ?? isActive;

            return (
              <div className="fd-project-block" key={project.id}>
                <div className={`fd-project-row ${isActive ? "active" : ""}`}>
                  <button
                    className="fd-project-row-main"
                    onClick={() => {
                      onProjectChange(project.id);
                      setExpandedProjects((current) => ({
                        ...current,
                        [project.id]: !current[project.id]
                      }));
                    }}
                    type="button"
                  >
                    <ForgeIcon
                      name={isExpanded ? "folderOpen" : "folder"}
                      size={12}
                    />
                    <span className="fd-project-name">{project.name}</span>
                    <span className="fd-project-badges">
                      {project.errors > 0 ? (
                        <span className="fd-inline-badge error">
                          <StateDot state="error" />
                          {project.errors}
                        </span>
                      ) : null}
                      {project.waiting > 0 ? (
                        <span className="fd-inline-badge waiting">
                          <StateDot state="waiting" />
                          {project.waiting}
                        </span>
                      ) : null}
                      {project.changed > 0 ? (
                        <span className="fd-inline-badge changed">{project.changed}</span>
                      ) : null}
                    </span>
                  </button>
                  <button
                    className="fd-project-remove"
                    onClick={() => {
                      if (window.confirm(`Remover "${project.name}" do workspace?\n\nEsta ação não pode ser desfeita.`)) {
                        onRemoveProject(project.id);
                      }
                    }}
                    title="Remover projeto"
                    type="button"
                  >
                    ×
                  </button>
                </div>

                {isExpanded ? (
                  <div className="fd-project-submenu">
                    <div className="fd-project-subrow">
                      <ForgeIcon name="terminal" size={11} />
                      <span>Terminals</span>
                      <span className="count">{project.terminals}</span>
                    </div>
                    <div className="fd-project-subrow">
                      <ForgeIcon name="diff" size={11} />
                      <span>Changes</span>
                      <span className="count">{project.changed}</span>
                    </div>
                    <div className="fd-project-subrow">
                      <ForgeIcon name="history" size={11} />
                      <span>History</span>
                      <span className="branch">{project.branch}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="fd-sidebar-footer">
        <button className="fd-secondary-button" onClick={onAddProject} type="button">
          <ForgeIcon name="plus" size={12} />
          Add project
        </button>

        {importError ? <div className="fd-sidebar-hint">{importError}</div> : null}

        {activeProject ? (
          <div className="fd-sidebar-hint">
            <span className="mono">{activeProject.path}</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
