"use client";

import { useState } from "react";
import { Block } from "@/lib/api";
import { timeToMinutes, formatClock } from "@/lib/analytics";
import { Clock3 } from "lucide-react";

const TRAFFIC_COLOR: Record<string, string> = { Low: "#22c55e", Med: "#f59e0b", High: "#ef4444" };
const STATUS_OPACITY: Record<string, string> = { Available: "0.55", Booked: "1", Locked: "0.85" };

const DAY_START = 0; // 00:00
const DAY_END = 24 * 60; // 24:00
const SPAN = DAY_END - DAY_START;
const HOUR_MARKS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

export function BlockTimeline({ blocks, sectionLabel, date }: { blocks: Block[]; sectionLabel: (id: string) => string; date: string }) {
  const [hovered, setHovered] = useState<Block | null>(null);
  const sorted = [...blocks].sort(
    (a, b) => a.corridor_id.localeCompare(b.corridor_id) || timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Railway Block Utilization</h2>
        </div>
        <span className="text-[11px] text-muted-foreground">{date || "All dates"}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">When maintenance windows land across the operating day.</p>

      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">No blocks match the current filters for this date.</p>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <div className="min-w-[720px]">
            {/* hour ruler */}
            <div className="relative h-5 mb-1 ml-28">
              {HOUR_MARKS.map((h) => (
                <span
                  key={h}
                  className="absolute text-[10px] text-muted-foreground -translate-x-1/2"
                  style={{ left: `${((h * 60 - DAY_START) / SPAN) * 100}%` }}
                >
                  {String(h % 24).padStart(2, "0")}:00
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              {sorted.map((b) => {
                const start = Math.max(timeToMinutes(b.start_time), DAY_START);
                const end = Math.min(timeToMinutes(b.end_time), DAY_END);
                const left = ((start - DAY_START) / SPAN) * 100;
                const width = Math.max(((end - start) / SPAN) * 100, 1.2);
                return (
                  <div key={b.block_id} className="relative h-7 flex items-center">
                    <div className="w-28 shrink-0 pr-2 text-right text-[10px] text-muted-foreground truncate">
                      {b.block_id} · {b.corridor_id}
                    </div>
                    <div className="relative flex-1 h-full rounded bg-muted/30">
                      <div
                        onMouseEnter={() => setHovered(b)}
                        onMouseLeave={() => setHovered((h) => (h?.block_id === b.block_id ? null : h))}
                        className="absolute top-0.5 bottom-0.5 rounded-sm cursor-pointer transition-transform hover:scale-y-110"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: TRAFFIC_COLOR[b.traffic_level] ?? "#94a3b8",
                          opacity: STATUS_OPACITY[b.status] ?? "0.8",
                        }}
                      />
                      {hovered?.block_id === b.block_id && (
                        <div
                          className="absolute z-10 -top-[92px] w-52 rounded-lg border border-border bg-background p-2.5 text-[11px] shadow-xl"
                          style={{ left: `${Math.min(Math.max(left, 0), 60)}%` }}
                        >
                          <div className="font-semibold mb-1">{b.block_id}</div>
                          <div className="text-muted-foreground">{sectionLabel(b.corridor_id)}</div>
                          <div className="flex justify-between mt-1">
                            <span className="text-muted-foreground">Window</span>
                            <span>{formatClock(b.start_time)} – {formatClock(b.end_time)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Duration</span>
                            <span>{b.duration_min} min</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Traffic</span>
                            <span>{b.traffic_level}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Status</span>
                            <span>{b.status}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mt-4 text-[10px] text-muted-foreground">
        {Object.entries(TRAFFIC_COLOR).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: c }} /> {k} traffic
          </span>
        ))}
        <span className="ml-auto">Bar opacity = Available → Booked → Locked</span>
      </div>
    </div>
  );
}
