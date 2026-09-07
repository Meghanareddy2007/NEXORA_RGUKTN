"use client";

import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from "recharts";
import { PriorityPoint } from "@/lib/analytics";
import { Crosshair } from "lucide-react";

const QUADRANT_COLOR: Record<PriorityPoint["quadrant"], string> = {
  "Low Priority": "#22c55e",
  Normal: "#38bdf8",
  "High Priority": "#f59e0b",
  Critical: "#ef4444",
};

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p: PriorityPoint = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-background p-2.5 text-[11px] shadow-xl">
      <div className="font-semibold mb-1">{p.task_id}</div>
      <div className="text-muted-foreground">{p.section_label}</div>
      <div className="flex justify-between mt-1"><span className="text-muted-foreground">Criticality</span><span>{p.criticality}/5</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Traffic</span><span>{p.traffic_level}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{p.duration_min} min</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Dept</span><span>{p.department}</span></div>
      <div className="mt-1 text-center font-medium" style={{ color: QUADRANT_COLOR[p.quadrant] }}>{p.quadrant}</div>
    </div>
  );
}

export function PriorityMatrix({ points }: { points: PriorityPoint[] }) {
  // small jitter so overlapping identical (traffic, criticality) pairs are visible
  const jittered = points.map((p, i) => ({ ...p, jx: p.traffic_score + (((i * 37) % 21) - 10) / 100, jy: p.criticality + (((i * 53) % 21) - 10) / 100 }));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Crosshair className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Maintenance Priority Matrix</h2>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">Task criticality plotted against the traffic exposure of its section.</p>

      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 10, right: 16, bottom: 10, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 20%)" />
          <XAxis
            type="number"
            dataKey="jx"
            name="Traffic Impact"
            domain={[0.5, 3.5]}
            ticks={[1, 2, 3]}
            tickFormatter={(v) => ({ 1: "Low", 2: "Med", 3: "High" }[v] ?? "")}
            stroke="hsl(215 20% 65%)"
            fontSize={11}
            label={{ value: "Traffic Impact", position: "insideBottom", offset: -4, fontSize: 11, fill: "hsl(215 20% 65%)" }}
          />
          <YAxis
            type="number"
            dataKey="jy"
            name="Task Criticality"
            domain={[0.5, 5.5]}
            ticks={[1, 2, 3, 4, 5]}
            stroke="hsl(215 20% 65%)"
            fontSize={11}
            label={{ value: "Task Criticality", angle: -90, position: "insideLeft", fontSize: 11, fill: "hsl(215 20% 65%)" }}
          />
          <ZAxis type="number" dataKey="duration_min" range={[40, 220]} />
          <ReferenceLine x={2} stroke="hsl(217 33% 25%)" strokeDasharray="3 3" />
          <ReferenceLine y={3.5} stroke="hsl(217 33% 25%)" strokeDasharray="3 3" />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={jittered}>
            {jittered.map((p, i) => (
              <Cell key={i} fill={QUADRANT_COLOR[p.quadrant]} fillOpacity={0.85} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-3 mt-2">
        {Object.entries(QUADRANT_COLOR).map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {label}
          </span>
        ))}
      </div>
    </div>
  );
}
