import { ExternalLink, ShieldCheck, TerminalSquare } from "lucide-react";
import { useEffect } from "react";

import { Badge, Button, Card, CardContent, CardHeader, Separator } from "@agent-workbench/ui";

import { fetchProjectConfig } from "@/lib/queries";
import { getDesktopApi } from "@/lib/desktop-api";
import { useWorkbenchStore } from "@/lib/store";

export function ProjectOverview() {
  const snapshot = useWorkbenchStore((state) => state.snapshot);
  const selectedProjectId = useWorkbenchStore((state) => state.selectedProjectId);
  const projectConfigs = useWorkbenchStore((state) => state.projectConfigs);
  const setProjectConfig = useWorkbenchStore((state) => state.setProjectConfig);

  const selectedProject = snapshot?.projects.find(
    (project) => project.project.id === selectedProjectId
  );

  useEffect(() => {
    if (!selectedProjectId || projectConfigs[selectedProjectId]) {
      return;
    }

    void fetchProjectConfig(selectedProjectId).then((config) => {
      setProjectConfig(selectedProjectId, config);
    });
  }, [projectConfigs, selectedProjectId, setProjectConfig]);

  if (!selectedProject) {
    return null;
  }

  const loadedConfig = projectConfigs[selectedProject.project.id] ?? selectedProject.config;

  return (
    <Card>
      <CardHeader className="border-b border-white/10">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-sky-300/70">Project</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">
            {selectedProject.project.name}
          </h2>
          <p className="mt-2 text-sm text-slate-400">{selectedProject.project.path}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="border-emerald-400/25 bg-emerald-400/10 text-emerald-100">
            <ShieldCheck className="mr-1 size-3" />
            {selectedProject.project.safeMode}
          </Badge>
          <Button
            variant="outline"
            onClick={() =>
              getDesktopApi().projects.openIde({
                projectId: selectedProject.project.id
              })
            }
          >
            <ExternalLink className="mr-2 size-4" />
            Open in IDE
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5 lg:grid-cols-[1.6fr,1fr]">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Runtime config</p>
          <pre className="mt-3 overflow-auto rounded-xl bg-slate-950/80 p-4 text-xs text-slate-200">
            {JSON.stringify(loadedConfig.config, null, 2)}
          </pre>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2">
            <TerminalSquare className="size-4 text-teal-300" />
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
              Terminal templates
            </p>
          </div>
          <Separator className="my-4" />
          <div className="space-y-3">
            {loadedConfig.config.terminals.map((terminal) => (
              <div
                key={`${terminal.name}-${terminal.command}`}
                className="rounded-xl border border-white/8 bg-slate-950/70 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{terminal.name}</p>
                    <p className="mt-1 text-xs text-slate-400">{terminal.command}</p>
                  </div>
                  <Badge>{terminal.type}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
