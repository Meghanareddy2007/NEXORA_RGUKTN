"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { TrafficImpactRow } from "@/lib/analytics";
import { Activity } from "lucide-react";

const LEVEL_LABEL: Record<string, string> = { Low: "Low Traffic", Med: "Medium Traffic", High: "High Traffic" };

export function TrafficImpactChart({ data }: { data: TrafficImpactRow[] }) {
  const chartData = data.map((d) => ({ ...d, label: LEVEL_LABEL[d.level] }));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Traffic Impact vs Maintenance Blocks</h2>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        How block volume and average duration shift as section traffic rises — evidence the planner favors quieter windows.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData} margin={{ left: -12, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 20%)" vertical={false} />
          <XAxis dataKey="label" stroke="hsl(215 20% 65%)" fontSize={11} />
          <YAxis yAxisId="left" stroke="hsl(215 20% 65%)" fontSize={11} label={{ value: "Blocks", angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(215 20% 65%)" }} />
          <YAxis yAxisId="right" orientation="right" stroke="hsl(215 20% 65%)" fontSize={11} label={{ value: "Avg minutes", angle: 90, position: "insideRight", fontSize: 10, fill: "hsl(215 20% 65%)" }} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="left" dataKey="blockCount" name="Blocks" fill="#38bdf8" radius={[4, 4, 0, 0]} barSize={40} />
          <Line yAxisId="right" type="monotone" dataKey="avgDurationMin" name="Avg Duration (min)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
          <Line yAxisId="right" type="monotone" dataKey="avgConflicts" name="Avg Train Conflicts" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="4 3" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
