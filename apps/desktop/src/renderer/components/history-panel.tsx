import { History } from "lucide-react";

import { Badge, Card, CardContent, CardHeader } from "@agent-workbench/ui";

import { useWorkbenchStore } from "@/lib/store";

export function HistoryPanel() {
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
          <p className="text-xs uppercase tracking-[0.28em] text-fuchsia-300/70">
            History
          </p>
          <h3 className="mt-1 text-xl font-semibold text-white">Recent file commits</h3>
        </div>
        <History className="size-4 text-fuchsia-300" />
      </CardHeader>
      <CardContent className="space-y-3 pt-5">
        {project.git.history.map((entry) => (
          <div
            key={`${entry.hash}-${entry.date}`}
            className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white">{entry.message}</p>
              <Badge>{entry.hash}</Badge>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {entry.author} • {entry.date}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
