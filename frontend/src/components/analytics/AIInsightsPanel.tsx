"use client";

import { Sparkles, TrendingUp, AlertTriangle, Info, BrainCircuit } from "lucide-react";
import { Insight } from "@/lib/analytics";

const TONE_STYLE: Record<Insight["tone"], { icon: typeof TrendingUp; text: string; bg: string; border: string }> = {
  positive: { icon: TrendingUp, text: "text-success", bg: "bg-success/10", border: "border-success/30" },
  warning: { icon: AlertTriangle, text: "text-warning", bg: "bg-warning/10", border: "border-warning/30" },
  info: { icon: Info, text: "text-info", bg: "bg-info/10", border: "border-info/30" },
};

export function AIInsightsPanel({ insights }: { insights: Insight[] }) {
  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-card to-primary/5 p-4 relative overflow-hidden">
      <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
      <div className="flex items-center gap-2 mb-4 relative">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <BrainCircuit className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            AI Planning Insights <Sparkles className="h-3.5 w-3.5 text-primary" />
          </h2>
          <p className="text-[11px] text-muted-foreground">Automatically generated from the live block &amp; task dataset</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5 relative">
        {insights.map((insight, i) => {
          const style = TONE_STYLE[insight.tone];
          const Icon = style.icon;
          return (
            <div key={i} className={`flex items-start gap-2 rounded-lg border ${style.border} ${style.bg} p-2.5`}>
              <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${style.text}`} />
              <p className="text-xs leading-snug">{insight.text}</p>
            </div>
          );
        })}
        {insights.length === 0 && (
          <p className="text-xs text-muted-foreground col-span-2">No insights available for the current filters.</p>
        )}
      </div>
    </div>
  );
}
