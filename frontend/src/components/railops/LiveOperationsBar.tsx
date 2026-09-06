"use client";

import React from "react";
import {
  Database,
  Calendar,
  Sparkles,
  Map as MapIcon,
  Cpu,
  RefreshCw,
  Clock,
  Radio,
} from "lucide-react";

interface LiveOperationsBarProps {
  activeDate: string;
  availableDates: string[];
  onDateChange: (date: string) => void;
  timeFilter: string;
  onTimeFilterChange: (time: string) => void;
  viewMode: "schematic" | "gis";
  onToggleViewMode: (mode: "schematic" | "gis") => void;
  onRefresh: () => void;
  onTriggerReoptimize: () => void;
  isOptimizing?: boolean;
}

export function LiveOperationsBar({
  activeDate,
  availableDates,
  onDateChange,
  timeFilter,
  onTimeFilterChange,
  viewMode,
  onToggleViewMode,
  onRefresh,
  onTriggerReoptimize,
  isOptimizing = false,
}: LiveOperationsBarProps) {
  const TIME_WINDOWS = [
    { value: "ALL", label: "Full Day (00:00 - 23:59)" },
    { value: "00:00-06:00", label: "Night Shift (00:00 - 06:00)" },
    { value: "06:00-12:00", label: "Morning Peak (06:00 - 12:00)" },
    { value: "12:00-18:00", label: "Afternoon Window (12:00 - 18:00)" },
    { value: "18:00-23:59", label: "Evening Peak (18:00 - 23:59)" },
  ];

  return (
    <div className="bg-card/90 backdrop-blur-md border border-border rounded-xl p-3.5 shadow-xl flex flex-wrap items-center justify-between gap-4">
      {/* Live Data Connection Badge & Date Selector */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Live Data Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs font-semibold shadow-inner">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <Database className="h-3.5 w-3.5 text-emerald-400" />
          <span>LIVE DATA ENGINE</span>
          <span className="text-[10px] text-muted-foreground border-l border-emerald-800/60 pl-2">
            CSV / DB SYNCED
          </span>
        </div>

        {/* Operational Schedule Date Selector */}
        <div className="flex items-center gap-1.5 bg-black/40 border border-border rounded-lg px-2.5 py-1 text-xs">
          <Calendar className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-muted-foreground text-[11px]">Schedule Date:</span>
          <select
            value={activeDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="bg-transparent text-foreground font-mono font-bold text-xs focus:outline-none cursor-pointer"
          >
            {availableDates.map((d) => (
              <option key={d} value={d} className="bg-card text-foreground">
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Time Window Selector */}
        <div className="flex items-center gap-1.5 bg-black/40 border border-border rounded-lg px-2.5 py-1 text-xs">
          <Clock className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-muted-foreground text-[11px]">Time Window:</span>
          <select
            value={timeFilter}
            onChange={(e) => onTimeFilterChange(e.target.value)}
            className="bg-transparent text-foreground font-mono text-xs focus:outline-none cursor-pointer"
          >
            {TIME_WINDOWS.map((w) => (
              <option key={w.value} value={w.value} className="bg-card text-foreground">
                {w.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Action Triggers & View Mode Switcher */}
      <div className="flex items-center gap-2">
        {/* Refresh Data Button */}
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold transition-colors"
          title="Reload data directly from CSV datasets"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Data</span>
        </button>

        {/* AI Re-Optimize Button */}
        <button
          onClick={onTriggerReoptimize}
          disabled={isOptimizing}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30 text-xs font-semibold transition-all shadow-sm"
          title="Run Google OR-Tools CP-SAT Block Optimization"
        >
          <Sparkles className={`h-3.5 w-3.5 ${isOptimizing ? "animate-spin text-cyan-400" : "text-indigo-400"}`} />
          <span>{isOptimizing ? "Optimizing..." : "AI Block Optimizer"}</span>
        </button>

        {/* View Mode Toggle (Schematic CTC vs GIS Map) */}
        <div className="flex items-center bg-muted/60 border border-border rounded-lg p-0.5 text-xs">
          <button
            onClick={() => onToggleViewMode("schematic")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
              viewMode === "schematic"
                ? "bg-primary text-primary-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Switch to Centralized Traffic Control (CTC) Schematic Display"
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>CTC Schematic</span>
          </button>
          <button
            onClick={() => onToggleViewMode("gis")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
              viewMode === "gis"
                ? "bg-primary text-primary-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Switch to Geographical GIS Satellite Map"
          >
            <MapIcon className="h-3.5 w-3.5" />
            <span>GIS Map</span>
          </button>
        </div>
      </div>
    </div>
  );
}
