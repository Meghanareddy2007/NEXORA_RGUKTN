"use client";

import { SectionPressureRow } from "@/lib/analytics";
import { GitBranch } from "lucide-react";

const LEVEL_STYLE: Record<SectionPressureRow["level"], { bar: string; badge: string }> = {
  Critical: { bar: "bg-danger", badge: "bg-danger/15 text-danger" },
  High: { bar: "bg-warning", badge: "bg-warning/15 text-warning" },
  Medium: { bar: "bg-info", badge: "bg-info/15 text-info" },
  Low: { bar: "bg-success", badge: "bg-success/15 text-success" },
};

export function SectionPressure({ rows }: { rows: SectionPressureRow[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <GitBranch className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Railway Section Pressure</h2>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">Ranked by maintenance demand, traffic density and asset risk.</p>

      <div className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const style = LEVEL_STYLE[r.level];
          return (
            <div key={r.corridor_id} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-xs font-medium">{r.corridor_id}</span>
              <div className="flex-1 h-2.5 rounded-full bg-muted/40 overflow-hidden">
                <div className={`h-full ${style.bar} rounded-full transition-all`} style={{ width: `${Math.max(r.score, 4)}%` }} />
              </div>
              <span className={`w-16 shrink-0 text-center text-[10px] font-semibold px-1.5 py-0.5 rounded ${style.badge}`}>
                {r.level}
              </span>
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-xs text-muted-foreground">No section data available.</p>}
      </div>
    </div>
  );
}
