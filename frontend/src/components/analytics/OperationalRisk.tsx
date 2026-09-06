"use client";

import { RiskItem, severityTone } from "@/lib/analytics";
import { ShieldAlert } from "lucide-react";

export function OperationalRisk({ items }: { items: RiskItem[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Operational Risk</h2>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">Where the current plan is most exposed to disruption.</p>

      <div className="grid sm:grid-cols-2 gap-3">
        {items.map((item) => {
          const tone = severityTone(item.severity);
          return (
            <div key={item.label} className={`rounded-lg border ${tone.border} ${tone.bg} p-3`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">{item.label}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tone.bg} ${tone.text}`}>{item.severity}</span>
              </div>
              <div className={`text-xl font-semibold ${tone.text}`}>{item.count}</div>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{item.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
