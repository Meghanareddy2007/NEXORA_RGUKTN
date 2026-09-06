"use client";

import React from "react";
import { Train, MaintenanceBlock } from "@/lib/api";
import { Clock, Wrench, TrainFront, AlertTriangle } from "lucide-react";

interface BottomTimelineProps {
  trains: Train[];
  maintenanceBlocks: MaintenanceBlock[];
  currentTimeMinutes: number; // 360 (06:00) to 1320 (22:00)
  onTimeChange: (minutes: number) => void;
  onSelectTrain: (train: Train) => void;
  onSelectBlock: (block: MaintenanceBlock) => void;
}

export function BottomTimeline({
  trains,
  maintenanceBlocks,
  currentTimeMinutes,
  onTimeChange,
  onSelectTrain,
  onSelectBlock,
}: BottomTimelineProps) {
  const START_MIN = 360; // 06:00
  const END_MIN = 1320; // 22:00
  const TOTAL_MIN = END_MIN - START_MIN; // 960 minutes

  const timeToMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
  };

  const getPercent = (minutes: number) => {
    const clamped = Math.max(START_MIN, Math.min(END_MIN, minutes));
    return ((clamped - START_MIN) / TOTAL_MIN) * 100;
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetMinutes = Math.round(START_MIN + clickRatio * TOTAL_MIN);
    onTimeChange(targetMinutes);
  };

  // Generate hourly tick marks
  const ticks = [];
  for (let h = 6; h <= 22; h += 2) {
    const min = h * 60;
    ticks.push({
      timeStr: `${String(h).padStart(2, "0")}:00`,
      leftPct: getPercent(min),
    });
  }

  const scrubberLeft = getPercent(currentTimeMinutes);

  return (
    <div className="bg-card/90 backdrop-blur-md border border-border rounded-xl p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Operations Timeline (06:00 &rarr; 22:00)
          </h3>
          <span className="text-[10px] text-muted-foreground ml-2">
            Click anywhere on the timeline to scrub simulation time
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded bg-cyan-500" />
            <span className="text-muted-foreground">Moving</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded bg-red-500" />
            <span className="text-muted-foreground">Blocked Section</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded bg-amber-500" />
            <span className="text-muted-foreground">Rerouted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded bg-indigo-500" />
            <span className="text-muted-foreground">Maintenance Slot</span>
          </div>
        </div>
      </div>

      <div className="relative border border-border/80 rounded-lg bg-black/40 p-2 overflow-x-auto">
        {/* Clickable Area for Time Scrubbing */}
        <div
          className="relative min-w-[700px] cursor-pointer"
          onClick={handleTimelineClick}
        >
          {/* Time Axis Header */}
          <div className="relative h-6 border-b border-border/60 text-[10px] font-mono text-muted-foreground">
            {ticks.map((t, idx) => (
              <div
                key={idx}
                className="absolute transform -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${t.leftPct}%` }}
              >
                <span>{t.timeStr}</span>
                <span className="h-1.5 w-px bg-border mt-0.5" />
              </div>
            ))}
          </div>

          {/* Synchronized Vertical Playhead Cursor */}
          <div
            className="absolute top-0 bottom-0 z-20 pointer-events-none transition-all duration-150"
            style={{ left: `${scrubberLeft}%` }}
          >
            <div className="relative h-full flex flex-col items-center">
              <div className="h-2 w-2 rounded-full bg-cyan-400 ring-2 ring-cyan-500/50 shadow-lg shadow-cyan-400/80 -mt-1" />
              <div className="w-0.5 h-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
            </div>
          </div>

          {/* Timeline Rows Container */}
          <div className="py-2 space-y-2">
            {/* 1. Maintenance Blocks Rows */}
            <div className="space-y-1.5 pb-2 border-b border-border/40">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1 px-1">
                <Wrench className="h-3 w-3" /> Scheduled Maintenance Blocks
              </span>
              {maintenanceBlocks.map((b) => {
                const startM = timeToMinutes(b.start_time);
                const endM = timeToMinutes(b.end_time);
                const left = getPercent(startM);
                const width = Math.max(3, getPercent(endM) - left);
                const isUnderway =
                  currentTimeMinutes >= startM && currentTimeMinutes <= endM;

                return (
                  <div key={b.id} className="relative h-6 flex items-center">
                    <span className="w-28 shrink-0 text-[10px] font-mono text-muted-foreground truncate px-1">
                      {b.id}
                    </span>
                    <div className="relative flex-1 h-5 rounded bg-muted/20">
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectBlock(b);
                        }}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        className={`absolute top-0 bottom-0 rounded px-1.5 flex items-center justify-between text-[10px] font-semibold text-white cursor-pointer transition-all hover:brightness-125 shadow-md ${
                          b.priority === "High"
                            ? "bg-gradient-to-r from-red-600 to-rose-700 border border-red-400"
                            : b.priority === "Emergency"
                            ? "bg-gradient-to-r from-red-700 to-red-900 border border-red-500 animate-pulse"
                            : "bg-gradient-to-r from-indigo-600 to-purple-700 border border-indigo-400"
                        }`}
                        title={`${b.id} (${b.activity}) - ${b.start_time} to ${b.end_time}`}
                      >
                        <span className="truncate">{b.id}: {b.activity}</span>
                        <span className="text-[9px] font-mono shrink-0 ml-1 opacity-80">
                          {b.start_time}-{b.end_time}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 2. Trains Movement Rows */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1 px-1">
                <TrainFront className="h-3 w-3" /> Train Operation Schedules
              </span>
              {trains.slice(0, 5).map((train) => {
                const depM = timeToMinutes(train.departure_time);
                const arrM = timeToMinutes(train.expected_arrival);
                const left = getPercent(depM);
                const width = Math.max(4, getPercent(arrM) - left);
                const isDelayed = train.status === "DELAYED";
                const isRerouted = train.is_rerouted;

                return (
                  <div key={train.id} className="relative h-6 flex items-center">
                    <span className="w-28 shrink-0 text-[10px] font-mono text-slate-300 truncate px-1 flex items-center gap-1">
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: train.color }}
                      />
                      {train.id} {train.name.split(" ")[0]}
                    </span>
                    <div className="relative flex-1 h-5 rounded bg-muted/20">
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTrain(train);
                        }}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        className={`absolute top-0 bottom-0 rounded px-2 flex items-center justify-between text-[10px] font-medium text-white cursor-pointer transition-all hover:brightness-125 border ${
                          isDelayed
                            ? "bg-gradient-to-r from-red-600 to-red-800 border-red-400"
                            : isRerouted
                            ? "bg-gradient-to-r from-amber-600 to-amber-700 border-amber-400"
                            : "bg-gradient-to-r from-cyan-600 to-blue-700 border-cyan-400"
                        }`}
                        title={`${train.name} (${train.id}) &bull; ${train.origin} &rarr; ${train.destination} &bull; ${train.departure_time} - ${train.expected_arrival}`}
                      >
                        <span className="truncate">
                          {train.origin} &rarr; {train.destination}
                        </span>
                        <span className="text-[9px] font-mono shrink-0 ml-1 font-bold">
                          {isDelayed ? "[BLOCKED]" : isRerouted ? "[REROUTED]" : "MOVING"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
