"use client";

import { TrainFront } from "lucide-react";
import { PlanVisualization, CandidateOption } from "@/lib/api";

const STATUS_COLOR: Record<string, string> = {
  Running: "#22c55e",
  Delayed: "#f59e0b",
  Blocked: "#ef4444",
};

/**
 * Renders an hour-axis timeline: a red "MAINTENANCE BLOCK" bar over the
 * chosen block's time range, plus one row per nearby train with a marker
 * colored by whether that train is Running / Delayed / Blocked by the
 * maintenance window. Mirrors the "Plan Visualization" panel in the
 * reference dashboard screenshot.
 */
export function PlanVisualizationPanel({
  viz,
  activeCandidate,
}: {
  viz: PlanVisualization;
  activeCandidate?: CandidateOption;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] text-muted-foreground">
        {viz.date} &middot; {viz.corridor_id}
      </div>

      {/* Hour axis */}
      <div className="grid text-[10px] text-muted-foreground" style={{ gridTemplateColumns: `100px repeat(${viz.hours.length}, 1fr)` }}>
        <div />
        {viz.hours.map((h, i) => (
          <div key={i} className="text-center">
            {h}
          </div>
        ))}
      </div>

      {/* Maintenance block row */}
      <div className="grid items-center" style={{ gridTemplateColumns: "100px 1fr" }}>
        <div className="text-xs font-medium truncate pr-2">{viz.block.asset_label}</div>
        <div className="relative h-7 rounded-md bg-muted/40 border border-border overflow-hidden">
          <div
            className="absolute inset-y-0 flex items-center justify-center bg-danger/80 text-white text-[9px] font-semibold rounded-md"
            style={{
              left: `${viz.block.start_pct}%`,
              width: `${Math.max(viz.block.end_pct - viz.block.start_pct, 6)}%`,
            }}
          >
            MAINTENANCE BLOCK
          </div>
        </div>
      </div>

      {/* Train rows */}
      <div className="flex flex-col gap-2">
        {viz.trains.map((t) => (
          <div key={t.train_id} className="grid items-center" style={{ gridTemplateColumns: "100px 1fr" }}>
            <div className="text-[11px] leading-tight pr-2">
              <div className="font-medium truncate">{t.train_id}</div>
              <div className="text-muted-foreground truncate">{t.train_type}</div>
            </div>
            <div className="relative h-6">
              {/* dotted rail line */}
              <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-border" />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center h-5 w-5 rounded-full"
                style={{ left: `${t.position_pct}%`, background: `${STATUS_COLOR[t.status]}22` }}
                title={`${t.status} \u00b7 ${t.time}`}
              >
                <TrainFront className="h-3 w-3" style={{ color: STATUS_COLOR[t.status] }} />
              </div>
            </div>
          </div>
        ))}
        {viz.trains.length === 0 && (
          <p className="text-xs text-muted-foreground">No trains scheduled on this corridor for the selected date.</p>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-[10px] text-muted-foreground pt-1 border-t border-border">
        {Object.entries(STATUS_COLOR).map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full inline-block" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>

      {activeCandidate && (
        <div className="text-[11px] text-muted-foreground pt-1">
          Showing Option {activeCandidate.option}: {activeCandidate.start_time} - {activeCandidate.end_time}, block{" "}
          <span className="text-foreground font-medium">{activeCandidate.block_id}</span>
        </div>
      )}
    </div>
  );
}
