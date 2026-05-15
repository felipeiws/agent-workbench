import { useEffect } from "react";

import { fetchSnapshot } from "@/lib/queries";
import { useWorkbenchStore } from "@/lib/store";

import { ChangesPanel } from "../components/changes-panel";
import { DiffPanel } from "../components/diff-panel";
import { HistoryPanel } from "../components/history-panel";
import { ProjectOverview } from "../components/project-overview";
import { Sidebar } from "../components/sidebar";
import { TerminalPanel } from "../components/terminal-panel";

export function AppShell() {
  const setSnapshot = useWorkbenchStore((state) => state.setSnapshot);

  useEffect(() => {
    void fetchSnapshot().then(setSnapshot);
  }, [setSnapshot]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(40,194,160,0.16),transparent_26%),radial-gradient(circle_at_top_right,rgba(103,183,255,0.18),transparent_24%),linear-gradient(180deg,#050c15_0%,#091321_100%)] px-5 py-5 text-slate-100">
      <div className="mx-auto flex max-w-[1800px] gap-5">
        <Sidebar />
        <main className="flex min-h-[calc(100vh-2.5rem)] flex-1 flex-col gap-5">
          <ProjectOverview />
          <div className="grid gap-5 2xl:grid-cols-[1.35fr,0.85fr]">
            <TerminalPanel />
            <ChangesPanel />
          </div>
          <div className="grid gap-5 2xl:grid-cols-[1.35fr,0.85fr]">
            <DiffPanel />
            <HistoryPanel />
          </div>
        </main>
      </div>
    </div>
  );
}
