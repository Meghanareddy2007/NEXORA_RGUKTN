"use client";

import { useEffect, useMemo, useState } from "react";
import { Gantt, Task, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import { fetchBlocks, Block } from "@/lib/api";

const STATUS_COLOR: Record<string, string> = {
  Available: "#22c55e",
  Booked: "#f59e0b",
  Locked: "#ef4444",
};

export default function BlocksPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [view, setView] = useState<ViewMode>(ViewMode.Day);

  useEffect(() => {
    fetchBlocks().then(setBlocks);
  }, []);

  const tasks: Task[] = useMemo(
    () =>
      blocks.slice(0, 40).map((b) => {
        const start = new Date(`${b.date}T${b.start_time}:00`);
        const end = new Date(start.getTime() + b.duration_min * 60000);
        return {
          id: b.block_id,
          name: `${b.block_id} · ${b.corridor_id} (${b.block_type})`,
          start,
          end,
          progress: b.status === "Booked" ? 100 : 0,
          type: "task",
          styles: {
            backgroundColor: STATUS_COLOR[b.status] ?? "#38bdf8",
            backgroundSelectedColor: STATUS_COLOR[b.status] ?? "#38bdf8",
            progressColor: "#0ea5e9",
          },
        } as Task;
      }),
    [blocks]
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Block Schedule</h1>
          <p className="text-sm text-muted-foreground">COA block availability across corridors — drag to inspect, color = status.</p>
        </div>
        <div className="flex gap-2 text-xs">
          {(["Day", "Week", "Month"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(ViewMode[v])}
              className={`px-3 py-1.5 rounded-md border border-border ${view === ViewMode[v] ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      <div className="flex gap-4 text-xs text-muted-foreground">
        {Object.entries(STATUS_COLOR).map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-2 overflow-x-auto">
        {tasks.length > 0 ? (
          <Gantt tasks={tasks} viewMode={view} listCellWidth="155px" columnWidth={view === ViewMode.Month ? 300 : 65} />
        ) : (
          <p className="text-sm text-muted-foreground p-6">Loading block schedule…</p>
        )}
      </div>
    </div>
  );
}
