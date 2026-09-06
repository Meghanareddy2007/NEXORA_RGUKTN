"use client";

import React from "react";
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  AlertOctagon,
  Sparkles,
  Map as MapIcon,
  Cpu,
  Clock,
  Radio,
} from "lucide-react";

interface SimulationControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onReset: () => void;
  currentTimeMinutes: number; // minutes from midnight, e.g. 630 = 10:30
  onTimeChange: (minutes: number) => void;
  viewMode: "schematic" | "gis";
  onToggleViewMode: (mode: "schematic" | "gis") => void;
  onTriggerEmergency: () => void;
  onTriggerReoptimize: () => void;
  isOptimizing?: boolean;
}

export function formatTimeFromMinutes(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = Math.floor(totalMinutes % 60);
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${String(hours12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function SimulationControls({
  isPlaying,
  onTogglePlay,
  speed,
  onSpeedChange,
  onReset,
  currentTimeMinutes,
  onTimeChange,
  viewMode,
  onToggleViewMode,
  onTriggerEmergency,
  onTriggerReoptimize,
  isOptimizing = false,
}: SimulationControlsProps) {
  const SPEED_OPTIONS = [1, 2, 5, 10, 30];

  return (
    <div className="bg-card/90 backdrop-blur-md border border-border rounded-xl p-3 shadow-xl flex flex-wrap items-center justify-between gap-4">
      {/* Playback Controls & Clock */}
      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          onClick={onTogglePlay}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 shadow-md ${
            isPlaying
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30"
              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-cyan-500/20"
          }`}
          title={isPlaying ? "Pause Simulation" : "Start Simulation"}
        >
          {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          <span>{isPlaying ? "PAUSE" : "PLAY"}</span>
        </button>

        {/* Reset Button */}
        <button
          onClick={onReset}
          className="p-2 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Reset Simulation to 06:00"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        {/* Speed Multiplier Pill */}
        <div className="flex items-center bg-muted/60 border border-border rounded-lg p-0.5 text-xs font-medium">
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-2 py-1 rounded transition-colors ${
                speed === s
                  ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Simulation Clock Display */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-border/80 text-cyan-400 font-mono tracking-wider shadow-inner">
          <Clock className="h-4 w-4 text-cyan-400 animate-pulse" />
          <span className="text-base font-bold">{formatTimeFromMinutes(currentTimeMinutes)}</span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground border-l border-border/60 pl-2">
            <Radio className="h-2.5 w-2.5 text-emerald-400 fill-emerald-400" />
            SIM
          </span>
        </div>
      </div>

      {/* Time Scrubber Slider (06:00 to 22:00 -> 360 to 1320 min) */}
      <div className="flex-1 min-w-[200px] max-w-md flex items-center gap-3 px-2">
        <span className="text-[11px] font-mono text-muted-foreground">06:00</span>
        <input
          type="range"
          min={360}
          max={1320}
          step={5}
          value={currentTimeMinutes}
          onChange={(e) => onTimeChange(Number(e.target.value))}
          className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
        />
        <span className="text-[11px] font-mono text-muted-foreground">22:00</span>
      </div>

      {/* Action Triggers & View Mode Switcher */}
      <div className="flex items-center gap-2">
        {/* Emergency Block Button */}
        <button
          onClick={onTriggerEmergency}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500/25 text-xs font-semibold transition-all shadow-sm shadow-red-500/10"
          title="Simulate Emergency Track Halt (Salem \u2192 Erode)"
        >
          <AlertOctagon className="h-3.5 w-3.5" />
          <span>Emergency Block</span>
        </button>

        {/* AI Re-Optimize Button */}
        <button
          onClick={onTriggerReoptimize}
          disabled={isOptimizing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30 text-xs font-semibold transition-all shadow-sm"
          title="Run AI Conflict Resolution & Corridor Re-routing"
        >
          <Sparkles className={`h-3.5 w-3.5 ${isOptimizing ? "animate-spin text-cyan-400" : "text-indigo-400"}`} />
          <span>{isOptimizing ? "Optimizing..." : "AI Re-Optimize"}</span>
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
