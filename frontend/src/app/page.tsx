"use client";

import { useEffect, useState } from "react";
import {
  fetchDashboard,
  approveBlock,
  runOptimization,
  DashboardSummary,
  OptimizeResult,
} from "@/lib/api";
import { StatCard } from "@/components/StatCard";
import { TopBar } from "@/components/TopBar";
import { NetworkSnapshot } from "@/components/NetworkSnapshot";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrainFront,
  Wrench,
  Boxes,
  Layers,
  Gauge,
  TimerReset,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowRight,
} from "lucide-react";

const IMPACT_COLORS: Record<string, string> = {
  "No Impact": "#22c55e",
  "Minor Delay": "#38bdf8",
  "Moderate Delay": "#f59e0b",
  "Major Delay": "#ef4444",
};

const PRIORITY_STYLE: Record<string, string> = {
  HIGH: "bg-danger/15 text-danger",
  MEDIUM: "bg-warning/15 text-warning",
  LOW: "bg-success/15 text-success",
};

function timeLabel(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function DashboardPage() {
  const [dash, setDash] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  const [optResult, setOptResult] = useState<OptimizeResult | null>(null);
  const [optLoading, setOptLoading] = useState(false);

  const load = () => {
    fetchDashboard()
      .then((d) => {
        setDash(d);
        setError(null);
      })
      .catch(() => setError("Could not reach API. Is the backend running on :8000?"));
  };

  useEffect(load, []);

  const handleApprove = async () => {
    if (!dash?.recommended_block) return;
    setApproving(true);
    try {
      await approveBlock(dash.recommended_block.block_id);
      setApproved(true);
      load();
    } catch {
      setError("Could not approve the block. It may already be booked — refreshing.");
      load();
    } finally {
      setApproving(false);
    }
  };

  const handleOptimize = async () => {
    setOptLoading(true);
    setError(null);
    try {
      const result = await runOptimization(150, 60);
      setOptResult(result);
    } catch {
      setError("Optimization run failed. Check the backend logs.");
    } finally {
      setOptLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="AI-Powered Automatic Block Planning to Maximize Asset Availability"
        subtitle={dash ? `Today · ${dash.today}` : undefined}
      />

      <div className="flex flex-col gap-6 p-6">
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 text-danger text-sm p-3">{error}</div>
        )}

        {!dash && !error && <p className="text-sm text-muted-foreground">Loading dashboard…</p>}

        {dash && (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <StatCard
                label="Active Trains"
                value={dash.kpis.active_trains_today}
                icon={TrainFront}
                tone="info"
              />
              <StatCard
                label="Maintenance Requests"
                value={dash.kpis.maintenance_requests_pending}
                sub={`${dash.kpis.maintenance_requests_high_priority} high priority`}
                icon={Wrench}
                tone="warning"
              />
              <StatCard
                label="Assets Monitored"
                value={dash.kpis.assets_monitored}
                sub={`${dash.kpis.assets_healthy_pct}% healthy`}
                icon={Boxes}
                tone="violet"
              />
              <StatCard
                label="Blocks Planned (Today)"
                value={dash.kpis.blocks_planned_today}
                icon={Layers}
                tone="primary"
              />
              <StatCard
                label="Asset Availability"
                value={`${dash.kpis.asset_availability_pct}%`}
                icon={Gauge}
                tone="success"
              />
              <StatCard
                label="Delay Avoided (7d)"
                value={dash.kpis.delay_avoided_label}
                icon={TimerReset}
                tone="danger"
              />
            </div>

            {/* Network / Recommended block / Upcoming blocks */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-stretch">
              <div className="xl:col-span-2">
                <NetworkSnapshot today={dash.today}/>
              </div>

              <div className="rounded-xl border border-success/30 bg-card p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-success" />
                  <h2 className="text-sm font-medium text-success">AI Recommended Block</h2>
                </div>

                {dash.recommended_block ? (
                  <>
                    <div className="text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Corridor</span>
                        <span className="font-medium text-right">{dash.recommended_block.corridor_label}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Maintenance</span>
                        <span className="font-medium">{dash.recommended_block.block_type}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duration</span>
                        <span className="font-medium">{dash.recommended_block.duration_min} min</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Priority</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${PRIORITY_STYLE[dash.recommended_block.priority]}`}>
                          {dash.recommended_block.priority}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg bg-success/10 border border-success/20 text-center py-2">
                      <div className="text-sm font-semibold text-success">
                        {timeLabel(dash.recommended_block.start_time)} – {timeLabel(dash.recommended_block.end_time)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{dash.recommended_block.date}</div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-muted/40 py-1.5">
                        <div className="text-sm font-semibold">{dash.recommended_block.trains_affected}</div>
                        <div className="text-[9px] text-muted-foreground">Trains</div>
                      </div>
                      <div className="rounded-md bg-muted/40 py-1.5">
                        <div className="text-sm font-semibold">{dash.recommended_block.expected_delay_min}m</div>
                        <div className="text-[9px] text-muted-foreground">Exp. Delay</div>
                      </div>
                      <div className="rounded-md bg-muted/40 py-1.5">
                        <div className="text-sm font-semibold text-success">+{dash.recommended_block.availability_gain_pct}%</div>
                        <div className="text-[9px] text-muted-foreground">Availability</div>
                      </div>
                    </div>

                    <ul className="text-[11px] text-muted-foreground space-y-1">
                      {dash.recommended_block.reasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-success shrink-0 mt-0.5" />
                          {r}
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={handleApprove}
                      disabled={approving || approved}
                      className="mt-auto flex items-center justify-center gap-2 rounded-md bg-success text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
                    >
                      {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {approved ? "Approved" : "Approve Block Plan"}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">No available block to recommend today.</p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
                <h2 className="text-sm font-medium">Upcoming Blocks</h2>
                <div className="flex flex-col gap-2 overflow-y-auto scrollbar-thin max-h-[380px]">
                  {dash.upcoming_blocks.map((b) => (
                    <div key={b.block_id} className="rounded-lg border border-border p-2.5 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">
                          {timeLabel(b.start_time)} – {timeLabel(b.end_time)}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${PRIORITY_STYLE[b.priority]}`}>
                          {b.priority}
                        </span>
                      </div>
                      <div className="font-medium text-[13px]">{b.block_id}</div>
                      <div className="text-muted-foreground">{b.corridor_label}</div>
                    </div>
                  ))}
                  {dash.upcoming_blocks.length === 0 && (
                    <p className="text-xs text-muted-foreground">No upcoming blocks scheduled.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Train impact / delay avoided / alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-sm font-medium mb-3">Train Impact Summary</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={Object.entries(dash.train_impact_summary).map(([name, value]) => ({ name, value }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={75}
                    >
                      {Object.keys(dash.train_impact_summary).map((name) => (
                        <Cell key={name} fill={IMPACT_COLORS[name] ?? "#38bdf8"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
                  {Object.entries(dash.train_impact_summary).map(([name, value]) => (
                    <div key={name} className="flex items-center gap-1.5 text-[11px]">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: IMPACT_COLORS[name] ?? "#38bdf8" }} />
                      <span className="text-muted-foreground">{name}</span>
                      <span className="ml-auto font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-sm font-medium">Delay Avoided (next 7 days)</h2>
                <div className="text-2xl font-semibold mt-1">{dash.kpis.delay_avoided_label}</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={[
                      { name: "Manual Planning", value: dash.delay_avoided_chart.manual_min },
                      { name: "AI Optimized", value: dash.delay_avoided_chart.ai_optimized_min },
                    ]}
                  >
                    <XAxis dataKey="name" stroke="hsl(215 20% 65%)" fontSize={11} />
                    <YAxis stroke="hsl(215 20% 65%)" fontSize={11} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} formatter={(v: number) => [`${v} min`, "Delay"]} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      <Cell fill="#ef4444" />
                      <Cell fill="#22c55e" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-sm font-medium mb-3">Alerts &amp; Notifications</h2>
                <div className="flex flex-col gap-3">
                  {dash.alerts.map((a, i) => {
                    const Icon = a.severity === "warning" ? AlertTriangle : a.severity === "critical" ? AlertTriangle : Info;
                    const color = a.severity === "warning" ? "text-warning" : a.severity === "critical" ? "text-danger" : "text-info";
                    return (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${color}`} />
                        <div>
                          <div className="font-medium">{a.message}</div>
                          <div className="text-muted-foreground">{a.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                  {dash.alerts.length === 0 && <p className="text-xs text-muted-foreground">No active alerts.</p>}
                </div>
              </div>
            </div>

            {/* Full CP-SAT optimizer */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-medium">Run Full Optimization</h2>
                  <p className="text-xs text-muted-foreground">
                    Solves the whole backlog with OR-Tools CP-SAT — maximizes scheduled priority across all corridors.
                  </p>
                </div>
                <button
                  onClick={handleOptimize}
                  disabled={optLoading}
                  className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 shrink-0"
                >
                  {optLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Run AI Optimization
                </button>
              </div>

              {optResult && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-muted-foreground">
                      {optResult.kpis.solver_status} · solved in {optResult.kpis.solve_time_sec}s
                    </span>
                    <span className="flex items-center gap-1 text-xs text-primary">
                      View block schedule <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <StatCard
                      label="Tasks Scheduled"
                      value={`${optResult.kpis.scheduled_count}/${optResult.kpis.total_tasks_considered}`}
                      sub={`${optResult.kpis.scheduled_pct}%`}
                      icon={Sparkles}
                      tone="success"
                    />
                    <StatCard label="Priority Coverage" value={`${optResult.kpis.total_priority_pct}%`} icon={Gauge} tone="info" />
                    <StatCard label="Blocks Used" value={`${optResult.kpis.blocks_used}/${optResult.kpis.blocks_available}`} icon={Layers} tone="primary" />
                    <StatCard label="Unscheduled Backlog" value={optResult.kpis.unscheduled_count} icon={AlertTriangle} tone="warning" />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b border-border">
                          <th className="py-2 pr-4">Task</th>
                          <th className="py-2 pr-4">Dept</th>
                          <th className="py-2 pr-4">Corridor</th>
                          <th className="py-2 pr-4">Priority</th>
                          <th className="py-2 pr-4">Block</th>
                          <th className="py-2 pr-4">Date / Time</th>
                          <th className="py-2 pr-4">Traffic</th>
                        </tr>
                      </thead>
                      <tbody>
                        {optResult.scheduled.slice(0, 15).map((s) => (
                          <tr key={s.task_id} className="border-b border-border/50">
                            <td className="py-1.5 pr-4">{s.task_id}</td>
                            <td className="py-1.5 pr-4">{s.department}</td>
                            <td className="py-1.5 pr-4">{s.corridor_id}</td>
                            <td className="py-1.5 pr-4">{s.priority_score}</td>
                            <td className="py-1.5 pr-4">{s.block_id}</td>
                            <td className="py-1.5 pr-4">
                              {s.date} {s.start_time}-{s.end_time}
                            </td>
                            <td className="py-1.5 pr-4">{s.traffic_level}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
