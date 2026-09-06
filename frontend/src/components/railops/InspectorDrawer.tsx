"use client";

import React from "react";
import {
  Station,
  Route,
  Train,
  MaintenanceBlock,
} from "@/lib/api";
import {
  X,
  MapPin,
  TrainFront,
  Wrench,
  GitBranch,
  Clock,
  Gauge,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  Layers,
} from "lucide-react";

interface InspectorDrawerProps {
  station: Station | null;
  train: Train | null;
  route: Route | null;
  block: MaintenanceBlock | null;
  allStations: Station[];
  allTrains: Train[];
  allBlocks: MaintenanceBlock[];
  onClose: () => void;
  onRerouteTrain: (trainId: string) => void;
}

export function InspectorDrawer({
  station,
  train,
  route,
  block,
  allStations,
  allTrains,
  allBlocks,
  onClose,
  onRerouteTrain,
}: InspectorDrawerProps) {
  if (!station && !train && !route && !block) return null;

  const getStationName = (id: string) => {
    const s = allStations.find((item) => item.id === id);
    return s ? `${s.name} (${s.code})` : id;
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-96 bg-card/95 backdrop-blur-xl border-l border-border shadow-2xl p-5 overflow-y-auto flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-border/80">
          <div className="flex items-center gap-2">
            {station && <MapPin className="h-5 w-5 text-cyan-400" />}
            {train && <TrainFront className="h-5 w-5 text-sky-400" />}
            {route && <GitBranch className="h-5 w-5 text-emerald-400" />}
            {block && <Wrench className="h-5 w-5 text-amber-400" />}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                {station ? "Station Telemetry" : train ? "Train Operations" : route ? "Corridor Section" : "Maintenance Block"}
              </span>
              <h3 className="font-bold text-base text-foreground leading-tight">
                {station?.name || train?.name || (route ? `${route.source_station} \u2192 ${route.destination_station}` : block?.id)}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 1. STATION DETAILS */}
        {station && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-black/30 border border-border/60 font-mono">
              <div>
                <span className="text-[10px] text-muted-foreground block">Code / Division</span>
                <span className="font-bold text-cyan-400">{station.code} &bull; {station.division.split(" ")[0]}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Platforms</span>
                <span className="font-bold text-slate-200">{station.platforms} Platforms</span>
              </div>
            </div>

            {/* Incoming / Outgoing Trains */}
            <div>
              <h4 className="font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <TrainFront className="h-3.5 w-3.5 text-sky-400" />
                Scheduled & Approaching Trains
              </h4>
              <div className="space-y-1.5">
                {allTrains
                  .filter((t) => t.scheduled_route.includes(station.id))
                  .map((t) => (
                    <div
                      key={t.id}
                      className="p-2 rounded-lg bg-black/40 border border-border/60 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-slate-200">{t.name}</span>
                        <span className="text-[10px] text-muted-foreground block font-mono">
                          {t.origin} &rarr; {t.destination} ({t.departure_time} - {t.expected_arrival})
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                        t.status === "DELAYED" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-cyan-500/20 text-cyan-400"
                      }`}>
                        {t.status}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Nearby Maintenance Activities */}
            <div>
              <h4 className="font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 text-amber-400" />
                Nearby Maintenance Activities
              </h4>
              <div className="space-y-1.5">
                {allBlocks
                  .filter((b) => b.source_station === station.id || b.destination_station === station.id)
                  .map((b) => (
                    <div key={b.id} className="p-2 rounded-lg bg-amber-950/20 border border-amber-500/30">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-300">{b.id}</span>
                        <span className="text-[10px] font-mono text-amber-400 font-semibold">{b.start_time} - {b.end_time}</span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1">{b.activity}</p>
                    </div>
                  ))}
                {allBlocks.filter((b) => b.source_station === station.id || b.destination_station === station.id).length === 0 && (
                  <p className="text-muted-foreground text-xs italic">No active blocks adjoining this station.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. TRAIN DETAILS */}
        {train && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-black/30 border border-border/60 font-mono">
              <div>
                <span className="text-[10px] text-muted-foreground block">Train ID / Type</span>
                <span className="font-bold text-cyan-400">{train.id} &bull; {train.type}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Current Speed</span>
                <span className="font-bold text-emerald-400">{train.speed} km/h ({train.direction})</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-black/40 border border-border/60 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Origin:</span>
                <span className="font-semibold">{getStationName(train.origin)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Destination:</span>
                <span className="font-semibold">{getStationName(train.destination)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Departure / ETA:</span>
                <span className="font-mono">{train.departure_time} &rarr; {train.expected_arrival}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delay:</span>
                <span className={`font-mono font-bold ${train.delay_minutes > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  +{train.delay_minutes} mins
                </span>
              </div>
            </div>

            {/* Scheduled Route Flow */}
            <div>
              <h4 className="font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-cyan-400" />
                Route Sequence:
              </h4>
              <div className="p-2.5 rounded-lg bg-black/40 border border-border/60 text-[11px] font-mono leading-relaxed text-slate-300">
                {train.scheduled_route.join(" \u2192 ")}
              </div>
            </div>

            {/* Alternative Reroute Option */}
            {train.alternative_route && (
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-2">
                <div className="flex items-center gap-1.5 text-amber-300 font-bold text-xs">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  Alternative Reroute Available
                </div>
                <p className="text-[11px] text-slate-300 font-mono">
                  {train.alternative_route.join(" \u2192 ")}
                </p>
                {!train.is_rerouted && (
                  <button
                    onClick={() => onRerouteTrain(train.id)}
                    className="w-full mt-2 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all"
                  >
                    <span>Execute Corridor Reroute</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
                {train.is_rerouted && (
                  <span className="text-emerald-400 font-bold text-[11px] block mt-1">
                    &check; Train is currently traveling on AI Alternative Corridor.
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* 3. ROUTE DETAILS */}
        {route && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-black/30 border border-border/60 font-mono">
              <div>
                <span className="text-[10px] text-muted-foreground block">Route Status</span>
                <span className="font-bold text-cyan-400">{route.status}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Distance / Speed</span>
                <span className="font-bold text-slate-200">{route.distance} km &bull; {route.speed_limit_kmh} km/h</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-black/40 border border-border/60 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Line Tracks:</span>
                <span className="font-semibold">{route.track_count} Track(s) &bull; Electrified: {route.electrified}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Daily Capacity:</span>
                <span className="font-mono">{route.capacity} trains/day</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Classification:</span>
                <span className="font-semibold">{route.category}</span>
              </div>
            </div>
          </div>
        )}

        {/* 4. MAINTENANCE BLOCK DETAILS */}
        {block && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-black/30 border border-border/60 font-mono space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Block ID:</span>
                <span className="font-bold text-amber-400">{block.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Priority:</span>
                <span className={`font-bold ${block.priority === "High" ? "text-red-400" : "text-amber-400"}`}>
                  {block.priority} Priority
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time Window:</span>
                <span className="font-bold text-cyan-400">{block.start_time} &rarr; {block.end_time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Departments:</span>
                <span className="font-semibold">{block.departments}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-black/40 border border-border/60 space-y-2">
              <span className="text-muted-foreground text-[10px] uppercase font-bold block">Activity & Justification</span>
              <p className="text-slate-200 font-medium">{block.activity}</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">{block.description}</p>
            </div>

            {block.alternative_corridor && (
              <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-1">
                <span className="text-cyan-300 font-bold block">Designated Alternative Corridor:</span>
                <p className="text-[11px] text-slate-300">{block.alternative_corridor}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-border/60">
        <button
          onClick={onClose}
          className="w-full py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs transition-colors"
        >
          Close Inspector
        </button>
      </div>
    </div>
  );
}
