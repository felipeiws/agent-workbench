import { GitBranchPlus, GitPullRequestArrow, RefreshCcw } from "lucide-react";

import { Badge, Button, Card, CardContent, CardHeader } from "@agent-workbench/ui";

import { getDesktopApi } from "@/lib/desktop-api";
import { useWorkbenchStore } from "@/lib/store";

export function ChangesPanel() {
  const snapshot = useWorkbenchStore((state) => state.snapshot);
  const selectedProjectId = useWorkbenchStore((state) => state.selectedProjectId);

  const project = snapshot?.projects.find((item) => item.project.id === selectedProjectId);

  if (!project) {
    return null;
  }

  return (
    <Card className="min-h-[340px]">
      <CardHeader className="border-b border-white/10">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-amber-300/70">Git changes</p>
          <h3 className="mt-1 text-xl font-semibold text-white">Watch + CLI status</h3>
        </div>
        <div className="flex items-center gap-2">
          {project.git.suspicion ? (
            <Badge className="border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-100">
              {project.git.suspicion.label} {project.git.suspicion.confidence}
            </Badge>
          ) : null}
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCcw className="mr-2 size-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {project.git.groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-400">
            Nenhuma mudança detectada. O painel continua pronto para stage, unstage e diff.
          </div>
        ) : null}
        {project.git.groups.map((group) => (
          <div key={group.label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">{group.label}</p>
              <Badge>{group.items.length}</Badge>
            </div>
            <div className="space-y-3">
              {group.items.map((item) => (
                <div
                  key={`${group.label}-${item.path}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-slate-950/70 px-3 py-3"
                >
                  <div>
                    <p className="text-sm text-slate-100">{item.path}</p>
                    {item.previousPath ? (
                      <p className="text-xs text-slate-500">{item.previousPath}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {group.label === "Staged" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          getDesktopApi().git.unstage({
                            projectId: project.project.id,
                            filePath: item.path
                          })
                        }
                      >
                        <GitPullRequestArrow className="mr-1 size-3" />
                        Unstage
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          getDesktopApi().git.stage({
                            projectId: project.project.id,
                            filePath: item.path
                          })
                        }
                      >
                        <GitBranchPlus className="mr-1 size-3" />
                        Stage
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
