import { Columns2, Rows3 } from "lucide-react";

import { Badge, Button, Card, CardContent, CardHeader } from "@agent-workbench/ui";

import { useWorkbenchStore } from "@/lib/store";

export function DiffPanel() {
  const snapshot = useWorkbenchStore((state) => state.snapshot);
  const selectedProjectId = useWorkbenchStore((state) => state.selectedProjectId);
  const diffMode = useWorkbenchStore((state) => state.diffMode);
  const setDiffMode = useWorkbenchStore((state) => state.setDiffMode);

  const project = snapshot?.projects.find((item) => item.project.id === selectedProjectId);
  const diff = project?.git.diff;

  if (!project || !diff) {
    return null;
  }

  const rows = Math.max(diff.original.length, diff.updated.length);

  return (
    <Card className="min-h-[340px]">
      <CardHeader className="border-b border-white/10">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-sky-300/70">Diff</p>
          <h3 className="mt-1 text-xl font-semibold text-white">{diff.filePath}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={diffMode === "side-by-side" ? "default" : "outline"}
            size="sm"
            onClick={() => setDiffMode("side-by-side")}
          >
            <Columns2 className="mr-2 size-4" />
            Side by side
          </Button>
          <Button
            variant={diffMode === "inline" ? "default" : "outline"}
            size="sm"
            onClick={() => setDiffMode("inline")}
          >
            <Rows3 className="mr-2 size-4" />
            Inline
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5">
        {diffMode === "side-by-side" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-rose-400/18 bg-rose-400/6 p-4">
              <Badge className="mb-3 border-rose-400/25 bg-rose-400/10 text-rose-100">
                Before
              </Badge>
              <div className="space-y-2 font-mono text-xs text-rose-50/90">
                {Array.from({ length: rows }).map((_, index) => (
                  <p key={`before-${index}`}>{diff.original[index] ?? ""}</p>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-400/18 bg-emerald-400/6 p-4">
              <Badge className="mb-3 border-emerald-400/25 bg-emerald-400/10 text-emerald-100">
                After
              </Badge>
              <div className="space-y-2 font-mono text-xs text-emerald-50/90">
                {Array.from({ length: rows }).map((_, index) => (
                  <p key={`after-${index}`}>{diff.updated[index] ?? ""}</p>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/8 bg-slate-950/75 p-4 font-mono text-xs">
            {diff.updated.map((line, index) => (
              <p key={`inline-${index}`} className="text-emerald-50/90">
                + {line}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
