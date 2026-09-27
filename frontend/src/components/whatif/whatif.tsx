"use client";

/**
 * whatif.tsx
 * ----------------------------------------------------------------------------
 * Consolidated single-file version of the "What-If Maintenance Simulation"
 * feature, merged from the following source files:
 *   - api.ts                     (axios client + What-If types/endpoints only)
 *   - PlanComparisonTable.tsx
 *   - SimulationTimeline.tsx
 *   - WhatIfModal.tsx
 *   - SimulationDetailModal.tsx
 *
 * All internal imports between those files ("@/lib/api", "./PlanComparisonTable",
 * "./SimulationTimeline") have been removed and inlined below so this file has
 * no dependency on the rest of the original project structure. It still expects
 * `axios` and `lucide-react` to be installed in the consuming project.
 *
 * NOTE: `main.py`, `what_if_engine.py`, and `test_what_if_simulation.py` from the
 * zip are Python backend/API files and are not part of this file — a Python
 * backend can't be merged into a .tsx module. `page.tsx` was also left out of
 * this merge because it's a larger, unrelated "Blocks Management" dashboard
 * page that itself depends on other components not included in the zip
 * (TopBar, PlanVisualizationPanel) — only the parts of it specific to What-If
 * (the modals below) were pulled in.
 * ----------------------------------------------------------------------------
 */

import React, { useState } from "react";
import axios from "axios";
import {
  X,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Clock,
  Wrench,
  TrainFront,
  Flame,
  Info,
  Layers,
  Download,
  Check,
  ArrowDown,
  ArrowUp,
  Minus,
} from "lucide-react";

// ============================================================================
// API CLIENT (from api.ts)
// ============================================================================

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export const api = axios.create({ baseURL: API_BASE });

// ============================================================================
// WHAT-IF SIMULATION DECISION-SUPPORT TYPES & APIS (from api.ts)
// ============================================================================

export interface WhatIfConflict {
  type: "TRAIN_BLOCK_CONFLICT" | "MAINTENANCE_BLOCK_CONFLICT" | "RESOURCE_CONFLICT" | "ROUTE_CONFLICT";
  train_id?: string;
  train_number?: string;
  train_name?: string;
  train_type?: string;
  corridor_id?: string;
  departure_time?: string;
  arrival_time?: string;
  time_window?: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  estimated_delay_min?: number;
  message?: string;
  suggested_action?: string;
  department?: string;
  crew_required?: number;
  crew_available?: number;
}

export interface WhatIfComparisonMetric {
  metric: string;
  original: string;
  simulated: string;
  indicator: "Increased" | "Decreased" | "Unchanged" | "Shifted" | "Feasible" | "Infeasible";
  tone: "positive" | "negative" | "neutral" | "info";
}

export interface WhatIfTimelineTrain {
  train_number: string;
  train_name: string;
  train_type: string;
  departure_time: string;
  position_pct: number;
  status: "Blocked" | "Delayed" | "Running";
  severity: string;
}

export interface WhatIfTimeline {
  corridor_id: string;
  corridor_label: string;
  date: string;
  hours: string[];
  original_block: {
    start_time: string;
    end_time: string;
    start_pct: number;
    end_pct: number;
  };
  simulated_block: {
    start_time: string;
    end_time: string;
    start_pct: number;
    end_pct: number;
  };
  trains: WhatIfTimelineTrain[];
}

export interface WhatIfResult {
  simulation_id: string;
  block_id: string;
  corridor_id: string;
  corridor_label: string;
  reason: string;
  notes?: string;
  is_feasible: boolean;
  original: {
    start_time: string;
    end_time: string;
    duration_min: number;
    traffic_level: string;
    train_conflicts: number;
    affected_trains: number;
    expected_delay_min: number;
    maintenance_conflicts: number;
    resource_conflicts: number;
    tasks_scheduled: number;
    tasks_total: number;
    priority_coverage_pct: number;
    solver_status: string;
  };
  simulated: {
    start_time: string;
    end_time: string;
    duration_min: number;
    traffic_level: string;
    train_conflicts: number;
    affected_trains: number;
    expected_delay_min: number;
    maintenance_conflicts: number;
    resource_conflicts: number;
    tasks_scheduled: number;
    tasks_total: number;
    priority_coverage_pct: number;
    solver_status: string;
    is_feasible: boolean;
  };
  comparison: WhatIfComparisonMetric[];
  conflicts: WhatIfConflict[];
  timeline: WhatIfTimeline;
  ai_priority?: {
    urgency_score: number;
    priority_label: string;
    predicted_delay_minutes: number;
    color: string;
    recommended_action: string;
    model_version: string;
  };
  created_at: string;
}

export interface SimulationScenarioItem {
  id: string;
  block_id: string;
  corridor_id: string;
  corridor_label: string;
  reason: string;
  notes?: string;
  status: "SIMULATED" | "APPLIED" | "DISCARDED";
  is_feasible: boolean;
  created_at: string;
  applied_at?: string;
  changes: {
    start_time: string;
    end_time: string;
    duration_min: number;
    traffic_level: string;
    date: string;
    priority?: string;
  };
  original_metrics: Record<string, any>;
  simulated_metrics: Record<string, any>;
  comparison: WhatIfComparisonMetric[];
  conflicts: WhatIfConflict[];
  timeline: WhatIfTimeline;
}

export const runWhatIfSimulation = (payload: {
  block_id: string;
  changes: { start_time?: string; end_time?: string; date?: string; priority?: string };
  reason: string;
  notes?: string;
}) => api.post<WhatIfResult>("/api/simulation/what-if", payload).then((r) => r.data);

export const fetchSimulationHistory = () =>
  api.get<SimulationScenarioItem[]>("/api/simulation/history").then((r) => r.data);

export const fetchSimulationScenario = (sim_id: string) =>
  api.get<SimulationScenarioItem>(`/api/simulation/${sim_id}`).then((r) => r.data);

export const applySimulationScenario = (sim_id: string) =>
  api
    .post<{ success: boolean; simulation_id: string; applied_changes: any; applied_at: string }>(
      `/api/simulation/${sim_id}/apply`
    )
    .then((r) => r.data);

// ============================================================================
// COMPONENT: PlanComparisonTable
// ============================================================================

interface PlanComparisonTableProps {
  comparison: WhatIfComparisonMetric[];
}

export function PlanComparisonTable({ comparison }: PlanComparisonTableProps) {
  const renderIndicatorBadge = (item: WhatIfComparisonMetric) => {
    const { indicator, tone } = item;

    if (indicator === "Feasible") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
          <CheckCircle2 className="h-3 w-3" /> Feasible
        </span>
      );
    }
    if (indicator === "Infeasible") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-950/60 border border-red-500/40 px-2.5 py-0.5 text-[10px] font-bold text-red-400">
          <AlertTriangle className="h-3 w-3" /> Infeasible
        </span>
      );
    }
    if (indicator === "Decreased") {
      const isPositive = tone === "positive";
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
            isPositive
              ? "bg-emerald-950/50 border-emerald-500/40 text-emerald-400"
              : "bg-amber-950/50 border-amber-500/40 text-amber-400"
          }`}
        >
          <ArrowDown className="h-3 w-3" /> Decreased
        </span>
      );
    }
    if (indicator === "Increased") {
      const isPositive = tone === "positive";
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
            isPositive
              ? "bg-emerald-950/50 border-emerald-500/40 text-emerald-400"
              : "bg-red-950/50 border-red-500/40 text-red-400"
          }`}
        >
          <ArrowUp className="h-3 w-3" /> Increased
        </span>
      );
    }
    if (indicator === "Shifted") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-950/50 border border-sky-500/40 px-2 py-0.5 text-[10px] font-bold text-sky-400">
          <Info className="h-3 w-3" /> Shifted
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 border border-border/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        <Minus className="h-3 w-3" /> Unchanged
      </span>
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border/80 bg-card/70 shadow-lg">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/40 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="py-2.5 px-4">Evaluation Metric</th>
            <th className="py-2.5 px-4 text-amber-400">Original Plan</th>
            <th className="py-2.5 px-4 text-cyan-400">Simulated Plan</th>
            <th className="py-2.5 px-4 text-center">Factual Variance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40 font-mono">
          {comparison.map((item, idx) => (
            <tr key={idx} className="hover:bg-muted/20 transition-colors">
              <td className="py-2 px-4 font-sans font-medium text-foreground">{item.metric}</td>
              <td className="py-2 px-4 text-slate-300">{item.original}</td>
              <td className="py-2 px-4 font-bold text-cyan-300">{item.simulated}</td>
              <td className="py-2 px-4 text-center font-sans">{renderIndicatorBadge(item)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// COMPONENT: SimulationTimeline
// ============================================================================

interface SimulationTimelineProps {
  timeline: WhatIfTimeline;
}

export function SimulationTimeline({ timeline }: SimulationTimelineProps) {
  const { hours, original_block, simulated_block, trains, corridor_label, date } = timeline;

  const origWidth = Math.max(2, original_block.end_pct - original_block.start_pct);
  const simWidth = Math.max(2, simulated_block.end_pct - simulated_block.start_pct);

  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-semibold text-foreground">
            Corridor Schedule Timeline &bull; {corridor_label}
          </span>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground bg-muted/40 px-2 py-0.5 rounded border border-border/50">
          Date: {date}
        </span>
      </div>

      {/* Axis hours */}
      <div className="relative pt-2">
        <div className="flex justify-between text-[10px] text-muted-foreground font-mono px-1">
          {hours.map((h, i) => (
            <span key={i} className="transform -translate-x-1/2 first:translate-x-0 last:translate-x-0">
              {h}
            </span>
          ))}
        </div>
        <div className="h-2 w-full flex justify-between border-b border-border/70 mt-1">
          {hours.map((_, i) => (
            <div key={i} className="w-px h-1.5 bg-border/80" />
          ))}
        </div>
      </div>

      {/* Track 1: Original Schedule */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-amber-400 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Original Maintenance Block
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {original_block.start_time} &rarr; {original_block.end_time}
          </span>
        </div>
        <div className="relative h-9 w-full bg-black/40 rounded-lg border border-border/50 overflow-hidden">
          <div
            className="absolute top-1 bottom-1 rounded bg-gradient-to-r from-amber-600/80 to-amber-500/80 border border-amber-400/80 flex items-center justify-center text-[10px] font-bold text-black shadow"
            style={{
              left: `${original_block.start_pct}%`,
              width: `${origWidth}%`,
            }}
          >
            <span className="truncate px-2">
              Original Window ({original_block.start_time}-{original_block.end_time})
            </span>
          </div>
        </div>
      </div>

      {/* Track 2: Simulated Proposed Schedule */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-cyan-400 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            What-If Simulated Window
          </span>
          <span className="font-mono text-xs text-cyan-300 font-bold">
            {simulated_block.start_time} &rarr; {simulated_block.end_time}
          </span>
        </div>
        <div className="relative h-9 w-full bg-black/40 rounded-lg border border-border/50 overflow-hidden">
          <div
            className="absolute top-1 bottom-1 rounded bg-gradient-to-r from-cyan-600 to-emerald-500 border border-cyan-300 flex items-center justify-center text-[10px] font-bold text-black shadow-lg shadow-cyan-500/20"
            style={{
              left: `${simulated_block.start_pct}%`,
              width: `${simWidth}%`,
            }}
          >
            <span className="truncate px-2">
              Proposed Window ({simulated_block.start_time}-{simulated_block.end_time})
            </span>
          </div>
        </div>
      </div>

      {/* Train Schedule & Conflict Markers */}
      <div className="space-y-1 pt-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <TrainFront className="h-3.5 w-3.5 text-sky-400" />
            Corridor Train Traffic & Potential Overlaps
          </span>
          <span className="text-[10px] text-muted-foreground">{trains.length} train(s) during horizon</span>
        </div>

        {trains.length === 0 ? (
          <div className="p-3 text-center text-xs text-emerald-400 bg-emerald-950/20 rounded-lg border border-emerald-900/40 flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Zero scheduled train conflicts in the simulated maintenance window!
          </div>
        ) : (
          <div className="relative h-8 w-full bg-black/30 rounded-lg border border-border/40">
            {trains.map((tr, idx) => (
              <div
                key={idx}
                className="absolute top-1 bottom-1 transform -translate-x-1/2 flex items-center justify-center group"
                style={{ left: `${tr.position_pct}%` }}
              >
                <div
                  className={`h-6 px-1.5 rounded flex items-center gap-1 text-[9px] font-mono font-bold shadow-md cursor-pointer ${
                    tr.status === "Blocked" ? "bg-red-500 text-white animate-bounce" : "bg-amber-500 text-black"
                  }`}
                >
                  <TrainFront className="h-2.5 w-2.5" />
                  <span>{tr.train_number}</span>
                </div>

                {/* Hover Tooltip */}
                <div className="absolute bottom-full mb-1.5 hidden group-hover:flex flex-col gap-0.5 rounded-lg bg-popover text-popover-foreground p-2 text-[10px] shadow-xl border border-border z-20 w-44 whitespace-normal">
                  <div className="font-bold text-foreground">{tr.train_name}</div>
                  <div className="text-muted-foreground">Type: {tr.train_type}</div>
                  <div className="text-muted-foreground">Dep: {tr.departure_time}</div>
                  <div className={`font-semibold ${tr.status === "Blocked" ? "text-red-400" : "text-amber-400"}`}>
                    Status: {tr.status} ({tr.severity} Impact)
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground pt-1 border-t border-border/40">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-amber-500/80 border border-amber-400" />
          <span>Original Window</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-cyan-500 border border-cyan-300" />
          <span>Simulated Window</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span>Train in Conflict (Blocked)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span>Regulated / Minor Delay</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT: WhatIfModal
// ============================================================================

export interface TargetBlockData {
  block_id: string;
  corridor_id: string;
  corridor_label?: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  traffic_level: string;
  train_conflict_count: number;
  allowed_departments: string;
  status: string;
  block_type?: string;
  activity?: string;
}

interface WhatIfModalProps {
  block: TargetBlockData | null;
  onClose: () => void;
  onScenarioApplied?: (blockId: string) => void;
}

const REASON_OPTIONS = [
  "High train traffic during current block",
  "Newly detected critical defect",
  "Emergency maintenance requirement",
  "Maintenance team/resource unavailable",
  "Conflict with another maintenance block",
  "New train schedule adjustment",
  "Route/corridor availability change",
  "Maintenance duration changed",
  "Need to reduce expected train delays",
  "Need to complete high-priority task earlier",
  "Other",
];
export function WhatIfModal({
  block,
  onClose,
  onScenarioApplied,
}: WhatIfModalProps) {
  const [reason, setReason] = useState("");

  // other useState/useEffect hooks...

  if (!block) return null;
  const [customNote, setCustomNote] = useState("");
  const [newStartTime, setNewStartTime] = useState(block.start_time);
  const [newEndTime, setNewEndTime] = useState(block.end_time);
  const [priority, setPriority] = useState<string>(
    block.traffic_level === "High" ? "HIGH" : block.traffic_level === "Med" ? "MEDIUM" : "LOW"
  );

  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [result, setResult] = useState<WhatIfResult | null>(null);

  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);

  // Compute live duration
  const computeDurationMin = () => {
    try {
      const [sh, sm] = newStartTime.split(":").map(Number);
      const [eh, em] = newEndTime.split(":").map(Number);
      const s = sh * 60 + sm;
      const e = eh * 60 + em;
      return e > s ? e - s : 0;
    } catch {
      return 0;
    }
  };

  const currentDuration = computeDurationMin();

  const handleRunSimulation = async () => {
    setSimError(null);
    setSimulating(true);
    try {
      const res = await runWhatIfSimulation({
        block_id: block.block_id,
        changes: {
          start_time: newStartTime,
          end_time: newEndTime,
          date: block.date,
          priority,
        },
        reason,
        notes: customNote,
      });
      setResult(res);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Simulation execution failed. Please check inputs.";
      setSimError(msg);
    } finally {
      setSimulating(false);
    }
  };

  const handleApplyScenario = async () => {
    if (!result) return;
    setApplying(true);
    setSimError(null);
    try {
      await applySimulationScenario(result.simulation_id);
      setApplySuccess(true);
      setShowApplyConfirm(false);
      if (onScenarioApplied) {
        onScenarioApplied(block.block_id);
      }
      // Form closes automatically after user agrees and scenario is applied
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Could not apply scenario to plan.";
      setSimError(msg);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/80">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 border border-cyan-500/30">
              <Sparkles className="h-5 w-5 text-cyan-400" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">What-If Maintenance Simulation</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/20 text-primary border border-primary/30">
                  SIH26027
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Evaluate proposed block rescheduling consequences with OR-Tools & AI without altering live plan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {simError && (
            <div className="rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-red-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Simulation Warning / Error</span>
                <span>{simError}</span>
              </div>
            </div>
          )}

          {applySuccess && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-4 text-emerald-300 flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold text-sm block">Scenario Applied to Active Maintenance Plan!</span>
                <span>
                  Block <strong>{block.block_id}</strong> timing was updated in COA schedule to {newStartTime}
                  &ndash; {newEndTime}.
                </span>
              </div>
            </div>
          )}

          {/* 1. SELECTED BLOCK OVERVIEW */}
          <div className="rounded-xl border border-border/70 bg-black/30 p-4 space-y-3">
            <div className="flex items-center justify-between text-muted-foreground border-b border-border/50 pb-2">
              <span className="font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5 text-cyan-400">
                <Wrench className="h-3.5 w-3.5" /> Selected Baseline Block
              </span>
              <span className="font-mono text-foreground font-bold">
                {block.block_id} &bull; {block.date}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-card/60 border border-border/60">
                <span className="text-[10px] text-muted-foreground block">Corridor Section</span>
                <span className="font-semibold text-foreground truncate block">
                  {block.corridor_label || block.corridor_id}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-card/60 border border-border/60">
                <span className="text-[10px] text-muted-foreground block">Original Window</span>
                <span className="font-mono font-bold text-amber-400">
                  {block.start_time} &ndash; {block.end_time} ({block.duration_min}m)
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-card/60 border border-border/60">
                <span className="text-[10px] text-muted-foreground block">Departments</span>
                <span className="font-semibold text-foreground">{block.allowed_departments}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-card/60 border border-border/60">
                <span className="text-[10px] text-muted-foreground block">Baseline Traffic / Trains</span>
                <span className="font-semibold text-foreground">
                  {block.traffic_level} Traffic &bull; {block.train_conflict_count} Trains
                </span>
              </div>
            </div>
          </div>

          {/* 2. REASON & PARAMETERS FORM */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl border border-border bg-card/40 p-4">
            {/* Reason */}
            <div className="flex flex-col gap-1.5 md:col-span-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Reason for What-If Reschedule
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary"
              >
                {REASON_OPTIONS.map((opt, i) => (
                  <option key={i} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>

              {reason === "Other" && (
                <input
                  type="text"
                  placeholder="Specify operational reason..."
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  className="mt-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground"
                />
              )}
            </div>

            {/* Time Adjustments */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Proposed Schedule Adjustment (What-If)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3 text-white" /> Proposed Start
                  </span>
                  <input
                    type="time"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    style={{ colorScheme: "dark" }}
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:brightness-125 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3 text-white" /> Proposed End
                  </span>
                  <input
                    type="time"
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    style={{ colorScheme: "dark" }}
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:brightness-125 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block mb-0.5">New Duration</span>
                  <div className="h-8 rounded-lg border border-border bg-muted/30 px-2.5 flex items-center justify-between font-mono text-xs font-bold text-cyan-400">
                    <span>{currentDuration} min</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      {(currentDuration / 60).toFixed(1)}h
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-muted-foreground">
                  Original: {block.start_time}&ndash;{block.end_time} &rarr; Proposed: {newStartTime}&ndash;
                  {newEndTime}
                </span>

                <button
                  onClick={handleRunSimulation}
                  disabled={simulating || currentDuration <= 0}
                  className="flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-black font-bold px-4 py-2 text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {simulating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {simulating ? "Solving CP-SAT..." : "Run Simulation"}
                </button>
              </div>
            </div>
          </div>

          {/* 3. SIMULATION RESULTS */}
          {result && (
            <div className="space-y-5 pt-2">
              {/* Scenario banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-gradient-to-r from-cyan-950/40 via-card to-card border border-cyan-500/30">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground text-sm">
                      Simulation Scenario: {result.simulation_id}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        result.is_feasible
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : "bg-red-500/20 text-red-400 border border-red-500/40"
                      }`}
                    >
                      {result.is_feasible ? "FEASIBLE SCHEDULE" : "INFEASIBLE CONSTRAINTS"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Reason: <span className="text-slate-200 font-medium">{result.reason}</span>
                    {result.notes ? ` &bull; Note: ${result.notes}` : ""}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground block">OR-Tools Solver Status</span>
                  <span className="font-mono font-bold text-cyan-300">
                    {result.simulated.solver_status} ({result.simulated.tasks_scheduled} tasks scheduled)
                  </span>
                </div>
              </div>

              {/* Side-by-side comparison table */}
              <div className="space-y-1.5">
                <h3 className="font-bold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-cyan-400" />
                  Original vs Simulated Plan Comparison
                </h3>
                <PlanComparisonTable comparison={result.comparison} />
              </div>

              {/* Visual timeline */}
              <div className="space-y-1.5">
                <h3 className="font-bold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-cyan-400" />
                  Visual Schedule & Train Conflict Timeline
                </h3>
                <SimulationTimeline timeline={result.timeline} />
              </div>

              {/* Detected Conflicts */}
              <div className="space-y-2">
                <h3 className="font-bold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                  Detected Operational Conflicts ({result.conflicts.length})
                </h3>

                {result.conflicts.length === 0 ? (
                  <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>No conflicts found! The proposed time window is completely conflict-free.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {result.conflicts.map((c, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-xl border flex flex-col justify-between gap-1.5 ${
                          c.severity === "CRITICAL"
                            ? "bg-red-950/30 border-red-500/40"
                            : c.severity === "HIGH"
                            ? "bg-amber-950/30 border-amber-500/40"
                            : "bg-card/70 border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[11px] text-foreground flex items-center gap-1">
                            {c.type === "TRAIN_BLOCK_CONFLICT" && <TrainFront className="h-3.5 w-3.5 text-sky-400" />}
                            {c.type === "MAINTENANCE_BLOCK_CONFLICT" && (
                              <Wrench className="h-3.5 w-3.5 text-amber-400" />
                            )}
                            {c.type === "RESOURCE_CONFLICT" && <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />}
                            {c.type.replace(/_/g, " ")}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              c.severity === "CRITICAL"
                                ? "bg-red-500 text-white"
                                : c.severity === "HIGH"
                                ? "bg-amber-500 text-black"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {c.severity}
                          </span>
                        </div>

                        {c.train_name && (
                          <div className="text-slate-300">
                            Train: <strong>{c.train_name}</strong> ({c.train_type}) &bull; Window: {c.time_window}
                          </div>
                        )}
                        {c.message && <p className="text-slate-300">{c.message}</p>}
                        {c.suggested_action && (
                          <div className="text-[10px] text-cyan-400 flex items-center gap-1">
                            <ArrowRight className="h-2.5 w-2.5" />
                            <span>Action: {c.suggested_action}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Priority & Operational Delay Insights */}
              {result.ai_priority && (
                <div className="p-3.5 rounded-xl bg-card border border-border/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
                      <Flame className="h-4 w-4 text-amber-400" />
                    </span>
                    <div>
                      <span className="font-semibold text-foreground block">
                        AI Maintenance Priority &amp; Operational Impact
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        AI Urgency Score: <strong>{result.ai_priority.urgency_score}/100</strong> (
                        {result.ai_priority.priority_label}) &bull; Predicted Delay:{" "}
                        <strong>{result.ai_priority.predicted_delay_minutes} min</strong>
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Model: {result.ai_priority.model_version}
                  </span>
                </div>
              )}

              {/* Decision Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
                <button
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition-colors"
                >
                  Do Not Agree (Keep Original Plan)
                </button>

                <div className="flex items-center gap-3">
                  {!result.is_feasible && (
                    <span className="text-[11px] text-red-400 font-semibold flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Resolve critical conflicts before applying
                    </span>
                  )}
                  <button
                    onClick={() => setShowApplyConfirm(true)}
                    disabled={!result.is_feasible || applySuccess}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2 text-xs shadow-md transition-all disabled:opacity-40"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Apply Scenario to Maintenance Plan
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Confirmation Modal */}
        {showApplyConfirm && result && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-4 shadow-2xl">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-foreground">Apply What-If Schedule Change?</h3>
                  <p className="text-xs text-muted-foreground">
                    This will update the active railway maintenance schedule.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-black/40 border border-border/60 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target Block:</span>
                  <span className="font-bold text-amber-400">{block.block_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time Window Shift:</span>
                  <span className="font-bold text-cyan-300">
                    {block.start_time}&ndash;{block.end_time} &rarr; {newStartTime}&ndash;{newEndTime}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reason:</span>
                  <span className="text-foreground">{reason}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowApplyConfirm(false)}
                  disabled={applying}
                  className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyScenario}
                  disabled={applying}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-1.5 text-xs shadow-md disabled:opacity-50"
                >
                  {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {applying ? "Applying..." : "Confirm & Apply"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT: SimulationDetailModal
// ============================================================================

interface SimulationDetailModalProps {
  scenario: SimulationScenarioItem | null;
  onClose: () => void;
  onScenarioApplied?: (blockId: string) => void;
}

export function SimulationDetailModal({ scenario, onClose, onScenarioApplied }: SimulationDetailModalProps) {
  const [applying, setApplying] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!scenario) return null;

  const isAlreadyApplied = scenario.status === "APPLIED" || applied;

  const handleExportJson = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(scenario, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `simulation_${scenario.id}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e) {
      console.error("Export JSON error", e);
    }
  };

  const handleApplyScenario = async () => {
    setApplying(true);
    setError(null);
    try {
      await applySimulationScenario(scenario.id);
      setApplied(true);
      setShowApplyConfirm(false);
      if (onScenarioApplied) {
        onScenarioApplied(scenario.block_id);
      }
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not apply scenario to production plan.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/80">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 border border-cyan-500/30">
              <Sparkles className="h-5 w-5 text-cyan-400" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">Simulation Scenario Details</h2>
                <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-cyan-950/60 text-cyan-400 border border-cyan-500/40">
                  {scenario.id}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    isAlreadyApplied ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isAlreadyApplied ? "APPLIED" : scenario.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Persisted What-If evaluation record and conflict analysis
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground transition-colors"
              title="Download scenario as JSON file"
            >
              <Download className="h-3.5 w-3.5 text-cyan-400" />
              <span>Export JSON</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-red-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Application Error</span>
                <span>{error}</span>
              </div>
            </div>
          )}

          {isAlreadyApplied && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-4 text-emerald-300 flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold text-sm block">Scenario is Applied to Plan</span>
                <span>
                  This simulation was committed to the active COA schedule
                  {scenario.applied_at ? ` on ${scenario.applied_at.slice(0, 19).replace("T", " ")} UTC` : ""}.
                </span>
              </div>
            </div>
          )}

          {/* Scenario Overview Banner */}
          <div className="rounded-xl border border-border/70 bg-black/30 p-4 space-y-3">
            <div className="flex items-center justify-between text-muted-foreground border-b border-border/50 pb-2">
              <span className="font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5 text-cyan-400">
                <Wrench className="h-3.5 w-3.5" /> Target Block: {scenario.block_id}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                Logged: {scenario.created_at.slice(0, 19).replace("T", " ")}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-card/60 border border-border/60">
                <span className="text-[10px] text-muted-foreground block">Corridor</span>
                <span className="font-semibold text-foreground truncate block">
                  {scenario.corridor_label || scenario.corridor_id}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-card/60 border border-border/60">
                <span className="text-[10px] text-muted-foreground block">Proposed Window</span>
                <span className="font-mono font-bold text-cyan-400">
                  {scenario.changes?.start_time} &ndash; {scenario.changes?.end_time} ({scenario.changes?.duration_min}
                  m)
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-card/60 border border-border/60">
                <span className="text-[10px] text-muted-foreground block">Operational Reason</span>
                <span className="font-semibold text-foreground truncate block" title={scenario.reason}>
                  {scenario.reason}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-card/60 border border-border/60">
                <span className="text-[10px] text-muted-foreground block">Feasibility Status</span>
                <span
                  className={`font-bold inline-flex items-center gap-1 mt-0.5 ${
                    scenario.is_feasible ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {scenario.is_feasible ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Feasible
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5" /> Infeasible Constraints
                    </>
                  )}
                </span>
              </div>
            </div>

            {scenario.notes && (
              <div className="text-[11px] text-slate-300 pt-1 border-t border-border/40">
                <span className="text-muted-foreground">Notes: </span>
                {scenario.notes}
              </div>
            )}
          </div>

          {/* Comparison Table */}
          {scenario.comparison && scenario.comparison.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="font-bold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-cyan-400" />
                Original vs Simulated Metric Impacts
              </h3>
              <PlanComparisonTable comparison={scenario.comparison} />
            </div>
          )}

          {/* Schedule Timeline */}
          {scenario.timeline && (
            <div className="space-y-1.5">
              <h3 className="font-bold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-cyan-400" />
                Visual Corridor Schedule Timeline
              </h3>
              <SimulationTimeline timeline={scenario.timeline} />
            </div>
          )}

          {/* Detected Conflicts */}
          <div className="space-y-2">
            <h3 className="font-bold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
              Detected Operational Conflicts ({scenario.conflicts ? scenario.conflicts.length : 0})
            </h3>

            {!scenario.conflicts || scenario.conflicts.length === 0 ? (
              <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>No conflicts logged for this simulation scenario.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {scenario.conflicts.map((c, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border flex flex-col justify-between gap-1.5 ${
                      c.severity === "CRITICAL"
                        ? "bg-red-950/30 border-red-500/40"
                        : c.severity === "HIGH"
                        ? "bg-amber-950/30 border-amber-500/40"
                        : "bg-card/70 border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[11px] text-foreground flex items-center gap-1">
                        {c.type === "TRAIN_BLOCK_CONFLICT" && <TrainFront className="h-3.5 w-3.5 text-sky-400" />}
                        {c.type === "MAINTENANCE_BLOCK_CONFLICT" && (
                          <Wrench className="h-3.5 w-3.5 text-amber-400" />
                        )}
                        {c.type === "RESOURCE_CONFLICT" && <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />}
                        {c.type.replace(/_/g, " ")}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          c.severity === "CRITICAL"
                            ? "bg-red-500 text-white"
                            : c.severity === "HIGH"
                            ? "bg-amber-500 text-black"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {c.severity}
                      </span>
                    </div>

                    {c.train_name && (
                      <div className="text-slate-300">
                        Train: <strong>{c.train_name}</strong> ({c.train_type}) &bull; Window: {c.time_window}
                      </div>
                    )}
                    {c.message && <p className="text-slate-300">{c.message}</p>}
                    {c.suggested_action && (
                      <div className="text-[10px] text-cyan-400 flex items-center gap-1">
                        <ArrowRight className="h-2.5 w-2.5" />
                        <span>Action: {c.suggested_action}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-border bg-card/90">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition-colors"
          >
            Close
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportJson}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card hover:bg-muted px-4 py-2 text-xs font-semibold text-foreground transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-cyan-400" />
              Download JSON
            </button>

            {!isAlreadyApplied && (
              <button
                onClick={() => setShowApplyConfirm(true)}
                disabled={!scenario.is_feasible}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2 text-xs shadow-md transition-all disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" />
                Apply Scenario to Plan
              </button>
            )}
          </div>
        </div>

        {/* Confirmation Modal */}
        {showApplyConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-4 shadow-2xl">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-foreground">Apply Scenario to Production Schedule?</h3>
                  <p className="text-xs text-muted-foreground">
                    This will update the baseline block timing in the active schedule.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-black/40 border border-border/60 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scenario ID:</span>
                  <span className="font-bold text-cyan-300">{scenario.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Block ID:</span>
                  <span className="font-bold text-amber-400">{scenario.block_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">New Window:</span>
                  <span className="font-bold text-foreground">
                    {scenario.changes?.start_time} &ndash; {scenario.changes?.end_time}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowApplyConfirm(false)}
                  disabled={applying}
                  className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyScenario}
                  disabled={applying}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-1.5 text-xs shadow-md disabled:opacity-50"
                >
                  {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {applying ? "Applying..." : "Confirm & Apply"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default WhatIfModal;