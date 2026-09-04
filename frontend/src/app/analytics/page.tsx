"use client";

import { useEffect, useState } from "react";
import { fetchKpis, KpiSummary } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const TRAFFIC_COLORS: Record<string, string> = { Low: "#22c55e", Med: "#f59e0b", High: "#ef4444" };
const CRIT_COLOR = "#38bdf8";

export default function AnalyticsPage() {
  const [kpis, setKpis] = useState<KpiSummary | null>(null);

  useEffect(() => {
    fetchKpis().then(setKpis);
  }, []);

  if (!kpis) return <p className="text-sm text-muted-foreground">Loading analytics…</p>;

  return (
    <div className="flex flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Backlog, block capacity, and traffic-risk breakdowns for jury Q&A.</p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Tasks by Criticality (1–5)</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={Object.entries(kpis.tasks_by_criticality).map(([name, value]) => ({ name, value }))}>
              <XAxis dataKey="name" stroke="hsl(215 20% 65%)" fontSize={12} />
              <YAxis stroke="hsl(215 20% 65%)" fontSize={12} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
              <Bar dataKey="value" fill={CRIT_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Blocks by Traffic Level</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={Object.entries(kpis.blocks_by_traffic_level).map(([name, value]) => ({ name, value }))}
                dataKey="value"
                nameKey="name"
                outerRadius={85}
                label
              >
                {Object.entries(kpis.blocks_by_traffic_level).map(([name]) => (
                  <Cell key={name} fill={TRAFFIC_COLORS[name] ?? "#94a3b8"} />
                ))}
              </Pie>
              <Legend />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Blocks by Status</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={Object.entries(kpis.blocks_by_status).map(([name, value]) => ({ name, value }))} layout="vertical">
              <XAxis type="number" stroke="hsl(215 20% 65%)" fontSize={12} />
              <YAxis type="category" dataKey="name" stroke="hsl(215 20% 65%)" fontSize={12} width={80} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
              <Bar dataKey="value" fill="#a78bfa" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Assets by Department</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={Object.entries(kpis.assets_by_department).map(([name, value]) => ({ name, value }))}>
              <XAxis dataKey="name" stroke="hsl(215 20% 65%)" fontSize={12} />
              <YAxis stroke="hsl(215 20% 65%)" fontSize={12} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
              <Bar dataKey="value" fill="#f472b6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
