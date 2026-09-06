"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from "recharts";
import { OptimizationComparison } from "@/lib/analytics";
import { Gauge, CheckCircle2, AlertTriangle } from "lucide-react";

export function OptimizationPerformance({ rows }: { rows: OptimizationComparison[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">AI Optimization Performance</h2>
        </div>
        <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded bg-warning/15 text-warning">
          Baseline / Simulation
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Baseline mirrors a naive, traffic-blind first-available pick per section. AI Optimized uses conflict- and traffic-aware
        selection over the same real block pool.
      </p>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} margin={{ left: -12, right: 8 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 20%)" vertical={false} />
          <XAxis dataKey="metric" stroke="hsl(215 20% 65%)" fontSize={10} interval={0} angle={-12} textAnchor="end" height={50} />
          <YAxis stroke="hsl(215 20% 65%)" fontSize={11} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="baseline" name="Baseline (Simulation)" fill="#64748b" radius={[4, 4, 0, 0]} />
          <Bar dataKey="ai" name="AI Optimized" radius={[4, 4, 0, 0]}>
            {rows.map((r, i) => (
              <Cell key={i} fill="#22c55e" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-3">
        {rows.map((r) => {
          const lowerIsBetter = r.metric === "Scheduling Conflicts" || r.metric === "Traffic Impact";
          const improved = lowerIsBetter ? r.ai < r.baseline : r.ai > r.baseline;
          return (
            <div key={r.metric} className="rounded-lg border border-border p-2 text-center">
              <div className="text-[10px] text-muted-foreground truncate">{r.metric}</div>
              <div className="text-sm font-semibold">
                {r.ai}
                {r.unit === "%" ? "%" : ""}
              </div>
              <div className={`flex items-center justify-center gap-0.5 text-[10px] ${improved ? "text-success" : "text-danger"}`}>
                {improved ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
                vs {r.baseline}
                {r.unit === "%" ? "%" : ""} baseline
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
