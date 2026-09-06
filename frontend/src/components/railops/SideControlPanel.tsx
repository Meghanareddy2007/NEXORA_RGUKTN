"use client";

import React from "react";
import {
  TrainFront,
  Wrench,
  AlertTriangle,
  Clock,
  ShieldAlert,
  ArrowRight,
  Filter,
  CheckCircle2,
  AlertOctagon,
  Sparkles,
} from "lucide-react";
import { LiveOpsMetrics, AlertItem } from "@/lib/api";

interface SideControlPanelProps {
  metrics: LiveOpsMetrics;
  alerts: AlertItem[];
  departmentFilter: string;
  onDepartmentFilterChange: (dept: string) => void;
  trainTypeFilter: string;
  onTrainTypeFilterChange: (type: string) => void;
  priorityFilter: string;
  onPriorityFilterChange: (priority: string) => void;
  hideAvailableRoutes: boolean;
  onToggleHideAvailableRoutes: () => void;
  onApplyReroute: (trainId: string) => void;
}

export function SideControlPanel({
  metrics,
  alerts,
  departmentFilter,
  onDepartmentFilterChange,
  trainTypeFilter,
  onTrainTypeFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  hideAvailableRoutes,
  onToggleHideAvailableRoutes,
  onApplyReroute,
}: SideControlPanelProps) {
  return (
    <div className="w-80 shrink-0 flex flex-col gap-4">
      {/* 1. LIVE OPERATIONS METRICS */}
      <div className="bg-card/90 backdrop-blur-md border border-border rounded-xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3 border-b border-border/60 pb-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Live Operations
          </h2>
          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">
            REALTIME
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Active Trains */}
          <div className="p-2.5 rounded-lg bg-black/40 border border-border/80 flex flex-col justify-between">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <TrainFront className="h-3.5 w-3.5 text-sky-400" />
              Active Trains
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-bold font-mono text-sky-400">{metrics.active_trains}</span>
              <span className="text-[10px] text-emerald-400 font-medium">Tracking</span>
            </div>
          </div>

          {/* Active Maintenance Blocks */}
          <div className="p-2.5 rounded-lg bg-black/40 border border-border/80 flex flex-col justify-between">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Wrench className="h-3.5 w-3.5 text-amber-400" />
              Active Blocks
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-bold font-mono text-amber-400">
                {metrics.active_maintenance_blocks}
              </span>
              <span className="text-[10px] text-amber-400 font-medium">Securing</span>
            </div>
          </div>

          {/* Unavailable Routes */}
          <div className="p-2.5 rounded-lg bg-black/40 border border-border/80 flex flex-col justify-between">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <AlertOctagon className="h-3.5 w-3.5 text-red-400" />
              Blocked Tracks
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-bold font-mono text-red-400">{metrics.unavailable_routes}</span>
              <span className="text-[10px] text-red-400 font-medium">Unavailable</span>
            </div>
          </div>

          {/* Delayed Trains */}
          <div className="p-2.5 rounded-lg bg-black/40 border border-border/80 flex flex-col justify-between">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-orange-400" />
              Delayed Trains
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-bold font-mono text-orange-400">{metrics.delayed_trains}</span>
              <span className="text-[10px] text-orange-400 font-medium">Needs Reroute</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. REAL-TIME CONFLICT & MAINTENANCE ALERTS */}
      <div className="bg-card/90 backdrop-blur-md border border-border rounded-xl p-4 shadow-xl flex-1 flex flex-col min-h-[220px]">
        <div className="flex items-center justify-between mb-3 border-b border-border/60 pb-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
            Operations Alerts ({alerts.length})
          </h2>
          <span className="text-[10px] text-muted-foreground">Auto-Detected</span>
        </div>

        <div className="space-y-2.5 overflow-y-auto max-h-[260px] pr-1 scrollbar-thin">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground text-xs">
              <CheckCircle2 className="h-8 w-8 text-emerald-500/50 mb-2" />
              <span>No critical network conflicts</span>
              <span className="text-[10px] text-muted-foreground/80 mt-0.5">All trains operating safely</span>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-2.5 rounded-lg border text-xs flex flex-col gap-1.5 transition-all ${
                  alert.severity === "CRITICAL"
                    ? "bg-red-950/40 border-red-500/50 text-red-200"
                    : alert.severity === "HIGH"
                    ? "bg-orange-950/40 border-orange-500/50 text-orange-200"
                    : "bg-blue-950/40 border-blue-500/50 text-blue-200"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="font-semibold text-xs flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    {alert.title}
                  </span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-bold bg-black/40 border border-current">
                    {alert.severity}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">{alert.message}</p>

                {/* Suggested Action & One-Click Reroute */}
                {alert.suggested_action && (
                  <div className="mt-1 pt-1.5 border-t border-white/10 flex flex-col gap-1.5">
                    <span className="text-[10px] text-amber-300 font-medium">
                      Suggested Action: {alert.suggested_action}
                    </span>
                    {alert.train_id && (
                      <button
                        onClick={() => onApplyReroute(alert.train_id!)}
                        className="self-start flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold text-[11px] transition-colors"
                      >
                        <Sparkles className="h-3 w-3 text-amber-400" />
                        <span>Reroute via Alternative Corridor</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. MULTI-LAYER MAP FILTERS */}
      <div className="bg-card/90 backdrop-blur-md border border-border rounded-xl p-3.5 shadow-xl">
        <div className="flex items-center gap-1.5 mb-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Filter className="h-3.5 w-3.5 text-cyan-400" />
          Filter Rail Network
        </div>

        <div className="space-y-2.5 text-xs">
          {/* Department Filter */}
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Maintenance Dept:</label>
            <select
              value={departmentFilter}
              onChange={(e) => onDepartmentFilterChange(e.target.value)}
              className="w-full bg-muted/60 border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Departments</option>
              <option value="Engineering">Engineering (Track)</option>
              <option value="Signal & Telecom">Signal & Telecom</option>
              <option value="Traction">Traction / Electrical (OHE)</option>
            </select>
          </div>

          {/* Train Type Filter */}
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Train Classification:</label>
            <select
              value={trainTypeFilter}
              onChange={(e) => onTrainTypeFilterChange(e.target.value)}
              className="w-full bg-muted/60 border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Trains</option>
              <option value="Express">Express / Superfast</option>
              <option value="Passenger">Passenger / Local</option>
              <option value="Freight">Freight / Cargo</option>
            </select>
          </div>

          {/* Maintenance Priority Filter */}
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Block Priority:</label>
            <select
              value={priorityFilter}
              onChange={(e) => onPriorityFilterChange(e.target.value)}
              className="w-full bg-muted/60 border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Priorities</option>
              <option value="High">High Priority</option>
              <option value="Medium">Medium Priority</option>
              <option value="Emergency">Emergency Blocks</option>
            </select>
          </div>

          {/* Toggle Available Routes */}
          <div className="pt-2 border-t border-border/60 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Impacted Tracks Only:</span>
            <input
              type="checkbox"
              checked={hideAvailableRoutes}
              onChange={onToggleHideAvailableRoutes}
              className="rounded bg-muted border-border text-primary focus:ring-0 cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
