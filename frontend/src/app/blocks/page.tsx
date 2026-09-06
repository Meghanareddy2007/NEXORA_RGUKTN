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
  const [statusFilter, setStatusFilter] = useState("All");
  const [corridorFilter, setCorridorFilter] = useState("All");

  useEffect(() => {
    fetchBlocks().then(setBlocks);
  }, []);

  /* -------------------- FILTER OPTIONS -------------------- */

  const corridors = useMemo(() => {
    return Array.from(new Set(blocks.map((b) => b.corridor_id))).sort();
  }, [blocks]);

  const filteredBlocks = useMemo(() => {
    return blocks.filter((b) => {
      const statusMatch =
        statusFilter === "All" || b.status === statusFilter;

      const corridorMatch =
        corridorFilter === "All" || b.corridor_id === corridorFilter;

      return statusMatch && corridorMatch;
    });
  }, [blocks, statusFilter, corridorFilter]);

  /* -------------------- SUMMARY -------------------- */

  const summary = useMemo(() => {
    return {
      total: blocks.length,
      available: blocks.filter((b) => b.status === "Available").length,
      booked: blocks.filter((b) => b.status === "Booked").length,
      locked: blocks.filter((b) => b.status === "Locked").length,
    };
  }, [blocks]);

  /* -------------------- GANTT TASKS -------------------- */

  const tasks: Task[] = useMemo(
    () =>
      filteredBlocks.slice(0, 60).map((b) => {
        const start = new Date(`${b.date}T${b.start_time}:00`);
        const end = new Date(
          start.getTime() + b.duration_min * 60000
        );

        const color = STATUS_COLOR[b.status] ?? "#38bdf8";

        return {
          id: b.block_id,
          name: `${b.block_id} · ${b.corridor_id}`,
          start,
          end,
          progress: b.status === "Booked" ? 100 : 0,
          type: "task",
          styles: {
            backgroundColor: color,
            backgroundSelectedColor: color,
            progressColor: "#0ea5e9",
            progressSelectedColor: "#0284c7",
          },
        } as Task;
      }),
    [filteredBlocks]
  );

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* ================= HEADER ================= */}

      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary" />

            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Operations
            </span>
          </div>

          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Block Schedule
          </h1>

          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            View and monitor railway block availability across corridors.
            Use the timeline to inspect scheduled maintenance windows.
          </p>
        </div>

        {/* View controls */}
        <div className="flex rounded-lg border border-border bg-card p-1">
          {[
            { label: "Day", value: ViewMode.Day },
            { label: "Week", value: ViewMode.Week },
            { label: "Month", value: ViewMode.Month },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => setView(item.value)}
              className={`rounded-md px-4 py-2 text-xs font-medium transition ${
                view === item.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* ================= SUMMARY CARDS ================= */}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            Total Blocks
          </p>

          <p className="mt-2 text-2xl font-semibold">
            {summary.total}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Scheduled windows
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Available
            </p>

            <span className="h-2 w-2 rounded-full bg-green-500" />
          </div>

          <p className="mt-2 text-2xl font-semibold text-green-500">
            {summary.available}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Open for planning
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Booked
            </p>

            <span className="h-2 w-2 rounded-full bg-amber-500" />
          </div>

          <p className="mt-2 text-2xl font-semibold text-amber-500">
            {summary.booked}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Currently reserved
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Locked
            </p>

            <span className="h-2 w-2 rounded-full bg-red-500" />
          </div>

          <p className="mt-2 text-2xl font-semibold text-red-500">
            {summary.locked}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Not available
          </p>
        </div>

      </section>

      {/* ================= FILTER BAR ================= */}

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">

        <div>
          <h2 className="text-sm font-semibold">
            Schedule Overview
          </h2>

          <p className="mt-0.5 text-xs text-muted-foreground">
            Showing {filteredBlocks.length} block
            {filteredBlocks.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="All">All Status</option>
            <option value="Available">Available</option>
            <option value="Booked">Booked</option>
            <option value="Locked">Locked</option>
          </select>

          {/* Corridor */}
          <select
            value={corridorFilter}
            onChange={(e) => setCorridorFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="All">All Corridors</option>

            {corridors.map((corridor) => (
              <option key={corridor} value={corridor}>
                {corridor}
              </option>
            ))}
          </select>

        </div>
      </section>

      {/* ================= LEGEND ================= */}

      <div className="flex flex-wrap items-center gap-5 px-1 text-xs text-muted-foreground">

        <span className="font-medium text-foreground">
          Status
        </span>

        {Object.entries(STATUS_COLOR).map(([label, color]) => (
          <span
            key={label}
            className="flex items-center gap-2"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />

            {label}
          </span>
        ))}

      </div>

      {/* ================= GANTT ================= */}

      <section className="overflow-hidden rounded-xl border border-border bg-card">

        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">

            <div>
              <h2 className="text-sm font-semibold">
                Block Timeline
              </h2>

              <p className="text-xs text-muted-foreground">
                {view === ViewMode.Day
                  ? "Daily block allocation"
                  : view === ViewMode.Week
                  ? "Weekly block allocation"
                  : "Monthly block allocation"}
              </p>
            </div>

            <span className="rounded-md bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
              {Math.min(filteredBlocks.length, 60)} shown
            </span>

          </div>
        </div>

        <div className="overflow-x-auto p-3">

          {tasks.length > 0 ? (
            <Gantt
              tasks={tasks}
              viewMode={view}
              listCellWidth="180px"
              columnWidth={
                view === ViewMode.Month
                  ? 300
                  : view === ViewMode.Week
                  ? 100
                  : 65
              }
              rowHeight={46}
              barCornerRadius={5}
              todayColor="rgba(14, 165, 233, 0.08)"
            />
          ) : (
            <div className="flex min-h-[300px] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <span className="text-lg">—</span>
                </div>

                <p className="text-sm font-medium">
                  No blocks found
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Try changing the selected filters.
                </p>
              </div>
            </div>
          )}

        </div>
      </section>

      {/* ================= FOOTER INFO ================= */}

      <div className="flex flex-col gap-1 px-1 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
        <span>
          Data source: COA Block Availability
        </span>

        <span>
          Timeline displays up to 60 blocks
        </span>
      </div>

    </div>
  );
}