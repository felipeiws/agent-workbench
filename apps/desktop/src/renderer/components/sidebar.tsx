import { FolderGit2, Layers3, Sparkles } from "lucide-react";

import { Badge, Button, Card, CardContent, CardHeader, ScrollArea } from "@agent-workbench/ui";

import { useWorkbenchStore } from "@/lib/store";

export function Sidebar() {
  const snapshot = useWorkbenchStore((state) => state.snapshot);
  const selectedProjectId = useWorkbenchStore((state) => state.selectedProjectId);
  const setSelectedProject = useWorkbenchStore((state) => state.setSelectedProject);

  if (!snapshot) {
    return null;
  }

  return (
    <aside className="flex h-full w-[320px] flex-col gap-5">
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-white/10">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-teal-300/70">
              Workspaces
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Agent Workbench</h1>
          </div>
          <Badge className="border-teal-400/30 bg-teal-400/10 text-teal-100">
            Linux-first
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          {snapshot.workspaces.map((workspace) => {
            const projects = snapshot.projects.filter(
              (project) => project.project.workspaceId === workspace.id
            );

            return (
              <div key={workspace.id} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Layers3 className="size-4 text-teal-300" />
                  <span className="text-sm font-medium text-white">{workspace.name}</span>
                </div>
                <div className="space-y-2">
                  {projects.map(({ project }) => (
                    <button
                      key={project.id}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        selectedProjectId === project.id
                          ? "border-teal-400/45 bg-teal-400/12 text-white"
                          : "border-white/8 bg-slate-950/50 text-slate-300 hover:border-white/15 hover:text-white"
                      }`}
                      onClick={() => setSelectedProject(project.id)}
                      type="button"
                    >
                      <p className="text-sm font-medium">{project.name}</p>
                      <p className="mt-1 truncate text-xs text-slate-400">{project.path}</p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="min-h-0 flex-1">
        <CardHeader className="border-b border-white/10">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-300/70">
              Active Agents
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">Global queue</h2>
          </div>
          <Sparkles className="size-4 text-amber-300" />
        </CardHeader>
        <CardContent className="min-h-0 pt-4">
          <ScrollArea className="h-[calc(100vh-27rem)] pr-2">
            <div className="space-y-3">
              {snapshot.activeAgents.map((agent) => (
                <div
                  key={agent.sessionId}
                  className="rounded-xl border border-white/8 bg-white/[0.03] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">{agent.terminalName}</p>
                    <Badge>{agent.state}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{agent.projectName}</p>
                </div>
              ))}
              {snapshot.activeAgents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
                  Nenhum agente ativo ainda. Abra um terminal de projeto.
                </div>
              ) : null}
            </div>
          </ScrollArea>
          <Button
            className="mt-4 w-full"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            <FolderGit2 className="mr-2 size-4" />
            Refresh snapshot
          </Button>
        </CardContent>
      </Card>
    </aside>
  );
}
