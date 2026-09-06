"use client";

import { ResourceRow } from "@/lib/analytics";
import { Users } from "lucide-react";

function utilTone(pct: number) {
  if (pct >= 85) return "bg-success";
  if (pct >= 60) return "bg-info";
  if (pct >= 40) return "bg-warning";
  return "bg-danger";
}

export function ResourceUtilization({ rows }: { rows: ResourceRow[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Maintenance Resource Utilization</h2>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">Required vs allocated assets by maintenance department.</p>

      <div className="flex flex-col gap-4">
        {rows.map((r) => (
          <div key={r.department}>
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="font-medium">{r.department}</span>
              <span className="text-muted-foreground">
                {r.allocated}/{r.required} allocated · {r.available} fully available
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-muted/40 overflow-hidden">
              <div className={`h-full ${utilTone(r.utilizationPct)} rounded-full`} style={{ width: `${r.utilizationPct}%` }} />
            </div>
            <div className="flex justify-end mt-0.5">
              <span className="text-[10px] text-muted-foreground">{r.utilizationPct}% utilization</span>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-muted-foreground">No asset data available.</p>}
      </div>
    </div>
  );
}
