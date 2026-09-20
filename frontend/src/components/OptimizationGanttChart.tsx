"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, CalendarRange, Calendar } from "lucide-react";
import { ScheduledTask } from "@/lib/api";

type Scale = "daily" | "weekly" | "monthly";

const TRAFFIC_COLOR: Record<string, string> = {
  Low: "from-emerald-600 to-emerald-700 border-emerald-400",
  Med: "from-amber-600 to-amber-700 border-amber-400",
  High: "from-red-600 to-rose-700 border-red-400",
};

function parseDateTime(dateStr: string, timeStr: string): Date {
  const [h, m] = (timeStr || "00:00").split(":").map(Number);
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function startOfWeek(d: Date) {
  const c = startOfDay(d);
  const day = (c.getDay() + 6) % 7; // Monday = 0
  c.setDate(c.getDate() - day);
  return c;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function fmtRangeLabel(scale: Scale, anchor: Date) {
  if (scale === "daily") {
    return anchor.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  if (scale === "weekly") {
    const s = startOfWeek(anchor);
    const e = addDays(s, 6);
    return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} \u2013 ${e.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/**
 * Gantt-style view of the CP-SAT optimization engine's scheduled tasks.
 * Rows = corridors, bars = individual scheduled maintenance tasks placed
 * along a Daily / Weekly / Monthly time axis. Purely a read-only
 * visualization on top of `OptimizeResult.scheduled` — does not mutate
 * or refetch anything.
 */
export function OptimizationGanttChart({ tasks }: { tasks: ScheduledTask[] }) {
  const [scale, setScale] = useState<Scale>("weekly");
  const [anchor, setAnchor] = useState<Date>(() => {
    const first = tasks.find((t) => t.date)?.date;
    return first ? new Date(`${first}T00:00:00`) : new Date();
  });

  const { rangeStart, rangeEnd, ticks } = useMemo(() => {
    if (scale === "daily") {
      const start = startOfDay(anchor);
      const end = addDays(start, 1);
      const ticks = Array.from({ length: 13 }, (_, i) => {
        const t = addHours(start, i * 2);
        return { pct: pctOf(t, start, end), label: t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
      });
      return { rangeStart: start, rangeEnd: end, ticks };
    }
    if (scale === "weekly") {
      const start = startOfWeek(anchor);
      const end = addDays(start, 7);
      const ticks = Array.from({ length: 7 }, (_, i) => {
        const t = addDays(start, i);
        return { pct: pctOf(t, start, end), label: t.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }) };
      });
      return { rangeStart: start, rangeEnd: end, ticks };
    }
    const start = startOfMonth(anchor);
    const end = addMonths(start, 1);
    const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86400000);
    const step = daysInMonth > 20 ? 2 : 1;
    const ticks = [];
    for (let i = 0; i < daysInMonth; i += step) {
      const t = addDays(start, i);
      ticks.push({ pct: pctOf(t, start, end), label: String(t.getDate()) });
    }
    return { rangeStart: start, rangeEnd: end, ticks };
  }, [scale, anchor]);

  const now = new Date();
  const nowPct = now >= rangeStart && now < rangeEnd ? pctOf(now, rangeStart, rangeEnd) : null;

  const rows = useMemo(() => {
    const byCorridor = new Map<string, ScheduledTask[]>();
    for (const t of tasks) {
      const taskStart = parseDateTime(t.date, t.start_time);
      const taskEnd = parseDateTime(t.date, t.end_time);
      if (taskEnd < rangeStart || taskStart >= rangeEnd) continue;
      const key = t.corridor_id || "Unassigned";
      if (!byCorridor.has(key)) byCorridor.set(key, []);
      byCorridor.get(key)!.push(t);
    }
    return Array.from(byCorridor.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [tasks, rangeStart, rangeEnd]);

  const minBarWidth = scale === "daily" ? 1.2 : scale === "weekly" ? 0.9 : 0.6;

  const step = (dir: 1 | -1) => {
    if (scale === "daily") setAnchor((a) => addDays(a, dir));
    else if (scale === "weekly") setAnchor((a) => addDays(a, dir * 7));
    else setAnchor((a) => addMonths(a, dir));
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-medium">Optimization Engine Schedule (Gantt)</h2>
          <p className="text-xs text-muted-foreground">
            Solver output plotted over time \u2014 rows are corridors, bars are scheduled tasks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            {(
              [
                { key: "daily", label: "Daily", icon: Calendar },
                { key: "weekly", label: "Weekly", icon: CalendarRange },
                { key: "monthly", label: "Monthly", icon: CalendarDays },
              ] as { key: Scale; label: string; icon: typeof Calendar }[]
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setScale(key)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  scale === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => step(-1)}
              className="rounded-md border border-border p-1.5 hover:bg-muted/40"
              aria-label="Previous"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-medium w-40 text-center">{fmtRangeLabel(scale, anchor)}</span>
            <button
              onClick={() => step(1)}
              className="rounded-md border border-border p-1.5 hover:bg-muted/40"
              aria-label="Next"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative border border-border/80 rounded-lg bg-black/40 p-2 overflow-x-auto">
        <div className="relative min-w-[700px]">
          {/* Axis header */}
          <div className="relative h-6 border-b border-border/60 text-[10px] font-mono text-muted-foreground">
            {ticks.map((t, i) => (
              <div key={i} className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${t.pct}%` }}>
                <span>{t.label}</span>
                <span className="h-1.5 w-px bg-border mt-0.5" />
              </div>
            ))}
          </div>

          {/* "Now" playhead, when the visible range includes the current moment */}
          {nowPct !== null && (
            <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left: `${nowPct}%` }}>
              <div className="relative h-full flex flex-col items-center">
                <div className="h-2 w-2 rounded-full bg-cyan-400 ring-2 ring-cyan-500/50 shadow-lg shadow-cyan-400/80 -mt-1" />
                <div className="w-0.5 h-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
              </div>
            </div>
          )}

          {/* Rows */}
          <div className="py-2 space-y-1.5">
            {rows.map(([corridorId, corridorTasks]) => (
              <div key={corridorId} className="relative h-6 flex items-center">
                <span className="w-28 shrink-0 text-[10px] font-mono text-muted-foreground truncate px-1">
                  {corridorId}
                </span>
                <div className="relative flex-1 h-5 rounded bg-muted/20">
                  {corridorTasks.map((t) => {
                    const s = parseDateTime(t.date, t.start_time);
                    const e = parseDateTime(t.date, t.end_time);
                    const left = pctOf(s, rangeStart, rangeEnd);
                    const width = Math.max(minBarWidth, pctOf(e, rangeStart, rangeEnd) - left);
                    const isActiveNow = nowPct !== null && now >= s && now < e;
                    return (
                      <div
                        key={t.task_id}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        className={`absolute top-0 bottom-0 rounded px-1.5 flex items-center text-[9px] font-semibold text-white cursor-pointer transition-all hover:brightness-125 shadow-md bg-gradient-to-r border ${
                          TRAFFIC_COLOR[t.traffic_level] || TRAFFIC_COLOR.Med
                        } ${
                          isActiveNow
                            ? "ring-2 ring-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.85)] z-10"
                            : ""
                        }`}
                        title={`${t.task_id} \u00b7 ${t.department} \u00b7 ${t.block_id} \u00b7 ${t.date} ${t.start_time}-${t.end_time} \u00b7 priority ${t.priority_score}`}
                      >
                        <span className="truncate">{t.task_id}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {rows.length === 0 && (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No scheduled tasks fall in this {scale} range. Try Prev/Next or run the optimizer again.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-4 text-[10px] text-muted-foreground pt-2">
        {Object.entries({ Low: "#059669", Med: "#d97706", High: "#dc2626" }).map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full inline-block" style={{ background: color }} />
            {label} traffic
          </span>
        ))}
      </div>
    </div>
  );
}

function addHours(d: Date, n: number) {
  const c = new Date(d);
  c.setHours(c.getHours() + n);
  return c;
}

function pctOf(t: Date, start: Date, end: Date) {
  const total = end.getTime() - start.getTime();
  const clamped = Math.max(start.getTime(), Math.min(end.getTime(), t.getTime()));
  return ((clamped - start.getTime()) / total) * 100;
}
