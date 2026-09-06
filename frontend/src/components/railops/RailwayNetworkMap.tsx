"use client";

import React, { useState, useRef, useMemo } from "react";
import { Station, Route, Train, MaintenanceBlock } from "@/lib/api";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Wrench,
  TrainFront,
  Zap,
  Clock,
  Layers,
  Sparkles,
} from "lucide-react";

interface RailwayNetworkMapProps {
  stations: Station[];
  routes: Route[];
  trains: Train[];
  maintenanceBlocks: MaintenanceBlock[];
  selectedStation: Station | null;
  selectedTrain: Train | null;
  selectedRoute: Route | null;
  selectedBlock: MaintenanceBlock | null;
  onSelectStation: (s: Station | null) => void;
  onSelectTrain: (t: Train | null) => void;
  onSelectRoute: (r: Route | null) => void;
  onSelectBlock: (b: MaintenanceBlock | null) => void;
  departmentFilter?: string;
  trainTypeFilter?: string;
  priorityFilter?: string;
  hideAvailableRoutes?: boolean;
}

export function RailwayNetworkMap({
  stations,
  routes,
  trains,
  maintenanceBlocks,
  selectedStation,
  selectedTrain,
  selectedRoute,
  selectedBlock,
  onSelectStation,
  onSelectTrain,
  onSelectRoute,
  onSelectBlock,
  departmentFilter = "ALL",
  trainTypeFilter = "ALL",
  priorityFilter = "ALL",
  hideAvailableRoutes = false,
}: RailwayNetworkMapProps) {
  // Zoom and pan transform state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Map station lookup by ID
  const stationMap = useMemo(() => {
    const map = new Map<string, Station>();
    stations.forEach((s) => map.set(s.id, s));
    return map;
  }, [stations]);

  // Route lookup by ID
  const routeMap = useMemo(() => {
    const map = new Map<string, Route>();
    routes.forEach((r) => map.set(r.id, r));
    return map;
  }, [routes]);

  // Handle Pan Drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Primary click only
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Handle Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.88;
    setZoom((prev) => Math.min(2.8, Math.max(0.6, prev * zoomFactor)));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Color mapping based on exact user specification:
  // GREEN = Available Route
  // YELLOW = Maintenance Scheduled Soon
  // RED = Route Under Maintenance / Blocked
  // GRAY = Temporarily Unavailable
  // BLUE = Active Train Route
  const getRouteColor = (status: string, isSelected: boolean) => {
    if (isSelected) return "#ec4899"; // Pink highlight for active selection
    switch (status) {
      case "UNDER_MAINTENANCE":
      case "BLOCKED":
      case "EMERGENCY_BLOCK":
        return "#ef4444"; // Red
      case "MAINTENANCE_SCHEDULED":
        return "#eab308"; // Yellow
      case "ACTIVE_TRAIN":
        return "#0284c7"; // Blue
      case "ALTERNATIVE_AVAILABLE":
        return "#f59e0b"; // Amber
      case "AVAILABLE":
      default:
        return "#22c55e"; // Green
    }
  };

  // Filtered Trains
  const visibleTrains = useMemo(() => {
    return trains.filter((t) => {
      if (trainTypeFilter !== "ALL" && t.type !== trainTypeFilter) return false;
      return true;
    });
  }, [trains, trainTypeFilter]);

  // Filtered Maintenance Blocks
  const visibleBlocks = useMemo(() => {
    return maintenanceBlocks.filter((b) => {
      if (departmentFilter !== "ALL" && !b.departments.includes(departmentFilter)) return false;
      if (priorityFilter !== "ALL" && b.priority !== priorityFilter) return false;
      return true;
    });
  }, [maintenanceBlocks, departmentFilter, priorityFilter]);

  return (
    <div className="relative w-full h-[580px] bg-[#070b14] border border-border/80 rounded-2xl overflow-hidden shadow-2xl select-none">
      {/* Grid Pattern Background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `radial-gradient(#1e293b 1px, transparent 1px), radial-gradient(#1e293b 1px, #070b14 1px)`,
          backgroundSize: "40px 40px",
          backgroundPosition: "0 0, 20px 20px",
        }}
      />

      {/* Floating Status / Legend Badge Bar */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-xl bg-card/85 backdrop-blur-md border border-border text-xs shadow-lg">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1">
          <Layers className="h-3 w-3 text-cyan-400" /> Route Status:
        </span>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
          <span className="text-emerald-400 font-medium">Available</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="h-2 w-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
          <span className="text-amber-400 font-medium">Scheduled</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="h-2 w-2 rounded-full bg-red-500 shadow-sm shadow-red-500/50 animate-ping" />
          <span className="text-red-400 font-medium">Blocked / Maint.</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="h-2 w-2 rounded-full bg-sky-500 shadow-sm shadow-sky-500/50" />
          <span className="text-sky-400 font-medium">Active Train</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="h-2 w-2 rounded-full bg-slate-500" />
          <span className="text-slate-400 font-medium">Unavailable</span>
        </div>
      </div>

      {/* Zoom / Pan Control Buttons */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 bg-card/85 backdrop-blur-md border border-border p-1 rounded-xl shadow-lg">
        <button
          onClick={() => setZoom((z) => Math.min(2.8, z * 1.2))}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.6, z * 0.82))}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={resetView}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Fit & Reset Map"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Main Interactive SVG Canvas */}
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        viewBox="0 0 1020 720"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        <defs>
          {/* Animated Hazard Striped Pattern for Blocked / Maintenance Routes */}
          <pattern id="hazardStripes" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="20" fill="#ef4444" opacity="0.9" />
            <rect x="10" width="10" height="20" fill="#991b1b" opacity="0.9" />
          </pattern>

          {/* Glowing Filters */}
          <filter id="glowGreen" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glowRed" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glowBlue" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* 1. RAILWAY ROUTES / TRACKS */}
          {routes.map((route) => {
            const sFrom = stationMap.get(route.source_station);
            const sTo = stationMap.get(route.destination_station);
            if (!sFrom || !sTo) return null;

            if (hideAvailableRoutes && route.status === "AVAILABLE") return null;

            const isBlocked =
              route.status === "UNDER_MAINTENANCE" ||
              route.status === "BLOCKED" ||
              route.status === "EMERGENCY_BLOCK";
            const isScheduled = route.status === "MAINTENANCE_SCHEDULED";
            const isActiveTrain = route.status === "ACTIVE_TRAIN";
            const isSelected = selectedRoute?.id === route.id;
            const strokeColor = getRouteColor(route.status, isSelected);

            return (
              <g key={route.id} className="cursor-pointer group" onClick={() => onSelectRoute(route)}>
                {/* Background Track Bed (Sleeper Line) */}
                <line
                  x1={sFrom.schematic_x}
                  y1={sFrom.schematic_y}
                  x2={sTo.schematic_x}
                  y2={sTo.schematic_y}
                  stroke="#1e293b"
                  strokeWidth="8"
                  strokeLinecap="round"
                />

                {/* Primary Colored Railway Track */}
                <line
                  x1={sFrom.schematic_x}
                  y1={sFrom.schematic_y}
                  x2={sTo.schematic_x}
                  y2={sTo.schematic_y}
                  stroke={strokeColor}
                  strokeWidth={isBlocked ? "6" : isSelected ? "5" : "3.5"}
                  strokeLinecap="round"
                  filter={isBlocked ? "url(#glowRed)" : isActiveTrain ? "url(#glowBlue)" : undefined}
                  className={`transition-all duration-300 ${
                    isActiveTrain ? "stroke-dasharray-[8,4] animate-pulse" : ""
                  }`}
                />

                {/* Hazard Overlay for Under-Maintenance Sections */}
                {isBlocked && (
                  <line
                    x1={sFrom.schematic_x}
                    y1={sFrom.schematic_y}
                    x2={sTo.schematic_x}
                    y2={sTo.schematic_y}
                    stroke="url(#hazardStripes)"
                    strokeWidth="7"
                    strokeDasharray="12,6"
                    opacity="0.85"
                  />
                )}

                {/* Track Center Midpoint Badge for Distance / Info */}
                <circle
                  cx={(sFrom.schematic_x + sTo.schematic_x) / 2}
                  cy={(sFrom.schematic_y + sTo.schematic_y) / 2}
                  r="3"
                  fill={strokeColor}
                  opacity="0.6"
                />
              </g>
            );
          })}

          {/* 2. MAINTENANCE BLOCKS OVERLAY ON TRACKS */}
          {visibleBlocks.map((block) => {
            const route = routeMap.get(block.route_id);
            if (!route) return null;
            const sFrom = stationMap.get(route.source_station);
            const sTo = stationMap.get(route.destination_station);
            if (!sFrom || !sTo) return null;

            const midX = (sFrom.schematic_x + sTo.schematic_x) / 2;
            const midY = (sFrom.schematic_y + sTo.schematic_y) / 2;
            const isUnderMaint = block.status === "UNDER_MAINTENANCE" || block.status === "IN_PROGRESS";
            const isSelected = selectedBlock?.id === block.id;

            return (
              <g
                key={block.id}
                transform={`translate(${midX}, ${midY})`}
                className="cursor-pointer group"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectBlock(block);
                }}
              >
                {/* Pulsing Warning Ring if Active */}
                {isUnderMaint && (
                  <circle
                    r="18"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    opacity="0.8"
                    className="animate-ping"
                  />
                )}

                {/* Maintenance Badge Background */}
                <rect
                  x="-26"
                  y="-14"
                  width="52"
                  height="28"
                  rx="6"
                  fill={isSelected ? "#be185d" : isUnderMaint ? "#7f1d1d" : "#78350f"}
                  stroke={isUnderMaint ? "#ef4444" : "#f59e0b"}
                  strokeWidth={isSelected ? "2" : "1.5"}
                  className="shadow-lg filter drop-shadow"
                />

                {/* Maintenance Tool Icon and Block ID */}
                <text
                  x="0"
                  y="-1"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {block.id}
                </text>
                <text
                  x="0"
                  y="9"
                  textAnchor="middle"
                  fill={isUnderMaint ? "#fca5a5" : "#fde68a"}
                  fontSize="7.5"
                  fontWeight="semibold"
                >
                  {block.start_time}-{block.end_time}
                </text>
              </g>
            );
          })}

          {/* 3. RAILWAY STATIONS (CIRCULAR NODES) */}
          {stations.map((st) => {
            const isSelected = selectedStation?.id === st.id;
            const isJunction = st.is_junction;

            // Count trains near or passing this station
            const nearbyTrains = trains.filter(
              (t) =>
                t.current_route.includes(st.id) ||
                t.origin === st.id ||
                t.destination === st.id
            );

            return (
              <g
                key={st.id}
                transform={`translate(${st.schematic_x}, ${st.schematic_y})`}
                className="cursor-pointer group"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectStation(st);
                }}
              >
                {/* Station Selection Halo */}
                {isSelected && (
                  <circle
                    r="20"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeDasharray="4,2"
                    className="animate-spin"
                  />
                )}

                {/* Outer Hub Halo */}
                <circle
                  r={isJunction ? "14" : "10"}
                  fill={isSelected ? "#0284c7" : isJunction ? "#1e293b" : "#0f172a"}
                  stroke={isSelected ? "#38bdf8" : isJunction ? "#06b6d4" : "#475569"}
                  strokeWidth={isJunction ? "2.5" : "2"}
                  className="transition-all duration-200 group-hover:stroke-cyan-300"
                />

                {/* Inner Core Light */}
                <circle
                  r={isJunction ? "6" : "4"}
                  fill={isJunction ? "#38bdf8" : "#94a3b8"}
                />

                {/* Station Code Badge */}
                <text
                  x="0"
                  y={isJunction ? "-17" : "-13"}
                  textAnchor="middle"
                  fill={isSelected ? "#38bdf8" : "#f1f5f9"}
                  fontSize={isJunction ? "11" : "9.5"}
                  fontWeight="bold"
                  className="tracking-wide"
                >
                  {st.code}
                </text>

                {/* Station Full Name Label */}
                <text
                  x="0"
                  y={isJunction ? "24" : "20"}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="8.5"
                  fontWeight="medium"
                  className="group-hover:fill-cyan-300 transition-colors"
                >
                  {st.name}
                </text>

                {/* Train Count Pill (if trains present) */}
                {nearbyTrains.length > 0 && (
                  <g transform="translate(10, -12)">
                    <circle r="6" fill="#0284c7" stroke="#38bdf8" strokeWidth="1" />
                    <text
                      x="0"
                      y="2.5"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="7"
                      fontWeight="bold"
                    >
                      {nearbyTrains.length}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* 4. DYNAMIC TRAINS MOVING ALONG TRACKS */}
          {visibleTrains.map((train) => {
            const route = routeMap.get(train.current_route);
            if (!route) return null;
            const sFrom = stationMap.get(route.source_station);
            const sTo = stationMap.get(route.destination_station);
            if (!sFrom || !sTo) return null;

            // Interpolate position along current track section
            const progress = (train.progress_percentage || 50) / 100;
            const trainX = sFrom.schematic_x + (sTo.schematic_x - sFrom.schematic_x) * progress;
            const trainY = sFrom.schematic_y + (sTo.schematic_y - sFrom.schematic_y) * progress;

            // Angle of orientation along track
            const angleRad = Math.atan2(
              sTo.schematic_y - sFrom.schematic_y,
              sTo.schematic_x - sFrom.schematic_x
            );
            const angleDeg = (angleRad * 180) / Math.PI;

            const isSelected = selectedTrain?.id === train.id;
            const isDelayed = train.status === "DELAYED";
            const isRerouted = train.is_rerouted || train.status === "REROUTED";

            const trainColor = isDelayed
              ? "#ef4444"
              : isRerouted
              ? "#f59e0b"
              : train.type === "Express"
              ? "#06b6d4" // Cyan
              : train.type === "Passenger"
              ? "#10b981" // Green
              : "#f59e0b"; // Orange

            return (
              <g
                key={train.id}
                transform={`translate(${trainX}, ${trainY})`}
                className="cursor-pointer group"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTrain(train);
                }}
              >
                {/* Dynamic Headlamp Beam in direction of travel */}
                <g transform={`rotate(${angleDeg})`}>
                  <polygon
                    points="0,-4 22,-14 22,14 0,4"
                    fill="url(#headlightBeam)"
                    opacity="0.3"
                  />
                  {/* Train Engine Pod */}
                  <rect
                    x="-10"
                    y="-6"
                    width="20"
                    height="12"
                    rx="3"
                    fill={trainColor}
                    stroke="#ffffff"
                    strokeWidth={isSelected ? "2" : "1"}
                    filter="url(#glowBlue)"
                  />
                  {/* Cab Nose */}
                  <polygon points="10,-4 14,0 10,4" fill="#ffffff" />
                </g>

                {/* Train Identifier Label & Speed Tag */}
                <g transform="translate(0, -12)">
                  <rect
                    x="-24"
                    y="-9"
                    width="48"
                    height="14"
                    rx="4"
                    fill="#0f172a"
                    stroke={trainColor}
                    strokeWidth="1"
                    opacity="0.9"
                  />
                  <text
                    x="0"
                    y="1"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="7.5"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {train.id} {train.speed}k
                  </text>
                </g>

                {/* Delay Warning Indicator */}
                {isDelayed && (
                  <circle
                    cx="12"
                    cy="-12"
                    r="4"
                    fill="#ef4444"
                    className="animate-ping"
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Quick Helper Floating Bottom Right */}
      <div className="absolute bottom-3 right-3 z-10 px-3 py-1 rounded-lg bg-black/60 border border-border/60 text-[10px] text-muted-foreground">
        Click any station, train, or track to inspect &bull; Drag to pan &bull; Scroll to zoom
      </div>
    </div>
  );
}
