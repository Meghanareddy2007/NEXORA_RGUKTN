"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Minus } from "lucide-react";
import { fetchNetwork, fetchCorridorRisk, fetchBlocks } from "@/lib/api";

// Schematic (not geographic) network diagram — mirrors the target "Network
// Overview" panel: stations as nodes, corridors as colored connector lines,
// laid out with a force-directed simulation so branches read cleanly.
// Replaces the old react-leaflet map (no new deps, no other files touched).

interface NetworkRow {
  corridor_id: string;
  station_from: string;
  station_to: string;
  distance_km: number;
  track_count: number;
  electrified: string;
  section_type: string;
  traffic_density: "Low" | "Med" | "High";
}

interface RiskRow {
  corridor_id: string;
  avg_failure_risk: number;
  asset_count: number;
  critical_assets: number;
}

interface BlockRow {
  block_id: string;
  corridor_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
}

type Status = "normal" | "busy" | "blocked" | "restricted";

const STATUS_META: Record<Status, { label: string; stroke: string; dot: string }> = {
  normal: { label: "Normal", stroke: "hsl(var(--success))", dot: "bg-success" },
  busy: { label: "Busy", stroke: "hsl(var(--info))", dot: "bg-info" },
  blocked: { label: "Maint. Block", stroke: "hsl(var(--danger))", dot: "bg-danger" },
  restricted: { label: "Restricted", stroke: "hsl(var(--warning))", dot: "bg-warning" },
};

function corridorStatus(row: NetworkRow, lockedCorridors: Set<string>): Status {
  if (lockedCorridors.has(row.corridor_id)) return "blocked";
  if (row.traffic_density === "High") return "busy";
  if (row.section_type === "Single") return "restricted";
  return "normal";
}

type Point = { x: number; y: number };

// Fruchterman-Reingold style force layout — pure JS, no graph-layout
// dependency needed. Deterministic seed so it doesn't jump around on refetch.
function layoutGraph(nodeIds: string[], edges: [string, string][], width: number, height: number) {
  const positions = new Map<string, Point>();

  nodeIds.forEach((id, i) => {
    let hash = 0;
    for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const angle = (hash % 360) * (Math.PI / 180);
    const radius = 50 + ((hash >> 3) % 130);
    positions.set(id, {
      x: width / 2 + Math.cos(angle) * radius + (i % 5) * 3,
      y: height / 2 + Math.sin(angle) * radius + (i % 7) * 3,
    });
  });

  if (nodeIds.length === 0) return positions;

  const k = Math.sqrt((width * height) / nodeIds.length) * 0.9;
  let temperature = width / 8;

  for (let iter = 0; iter < 240; iter++) {
    const disp = new Map<string, Point>();
    nodeIds.forEach((id) => disp.set(id, { x: 0, y: 0 }));

    for (let a = 0; a < nodeIds.length; a++) {
      for (let b = a + 1; b < nodeIds.length; b++) {
        const pa = positions.get(nodeIds[a])!;
        const pb = positions.get(nodeIds[b])!;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (k * k) / dist;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        const da = disp.get(nodeIds[a])!;
        const db = disp.get(nodeIds[b])!;
        da.x += dx;
        da.y += dy;
        db.x -= dx;
        db.y -= dy;
      }
    }

    edges.forEach(([s, t]) => {
      const ps = positions.get(s);
      const pt = positions.get(t);
      if (!ps || !pt) return;
      let dx = ps.x - pt.x;
      let dy = ps.y - pt.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist * dist) / k;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      const ds = disp.get(s)!;
      const dt = disp.get(t)!;
      ds.x -= dx;
      ds.y -= dy;
      dt.x += dx;
      dt.y += dy;
    });

    nodeIds.forEach((id) => {
      const p = positions.get(id)!;
      const d = disp.get(id)!;
      const dist = Math.sqrt(d.x * d.x + d.y * d.y) || 0.01;
      const clamped = Math.min(dist, temperature);
      p.x += (d.x / dist) * clamped;
      p.y += (d.y / dist) * clamped;
      p.x = Math.min(width - 36, Math.max(36, p.x));
      p.y = Math.min(height - 36, Math.max(36, p.y));
    });

    temperature *= 0.965;
  }

  return positions;
}

const WIDTH = 640;
const HEIGHT = 360;

export default function NetworkMap() {
  const [rows, setRows] = useState<NetworkRow[]>([]);
  const [riskByCorridor, setRiskByCorridor] = useState<Map<string, RiskRow>>(new Map());
  const [lockedCorridors, setLockedCorridors] = useState<Set<string>>(new Set());
  const [blockByCorridor, setBlockByCorridor] = useState<Map<string, BlockRow>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    Promise.all([fetchNetwork(), fetchCorridorRisk(), fetchBlocks()]).then(([network, risk, blocks]) => {
      setRows(network as NetworkRow[]);
      setRiskByCorridor(new Map((risk as RiskRow[]).map((r) => [r.corridor_id, r])));

      const locked = new Set<string>();
      const infoMap = new Map<string, BlockRow>();
      (blocks as BlockRow[]).forEach((b) => {
        if (b.status === "Locked") {
          locked.add(b.corridor_id);
          infoMap.set(b.corridor_id, b);
        }
      });
      setLockedCorridors(locked);
      setBlockByCorridor(infoMap);
    });
  }, []);

  const { positions, nodeIds } = useMemo(() => {
    const ids = Array.from(new Set(rows.flatMap((r) => [r.station_from, r.station_to])));
    const edges: [string, string][] = rows.map((r) => [r.station_from, r.station_to]);
    return { positions: layoutGraph(ids, edges, WIDTH, HEIGHT), nodeIds: ids };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const blockedRow = rows.find((r) => lockedCorridors.has(r.corridor_id));
  const blockedInfo = blockedRow ? blockByCorridor.get(blockedRow.corridor_id) : undefined;

  const selectedRow = rows.find((r) => r.corridor_id === selected);
  const selectedRisk = selectedRow ? riskByCorridor.get(selectedRow.corridor_id) : undefined;

  return (
    <div className="relative h-full w-full rounded-lg border border-border bg-background/40 overflow-hidden">
      {/* zoom controls, top-right — matches target panel chrome */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button
          onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.2).toFixed(2)))}
          className="h-6 w-6 grid place-items-center rounded bg-card border border-border hover:bg-muted"
          aria-label="Zoom in"
        >
          <Plus className="h-3 w-3" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))}
          className="h-6 w-6 grid place-items-center rounded bg-card border border-border hover:bg-muted"
          aria-label="Zoom out"
        >
          <Minus className="h-3 w-3" />
        </button>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        style={{ transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform 150ms ease" }}
      >
        {rows.map((r) => {
          const from = positions.get(r.station_from);
          const to = positions.get(r.station_to);
          if (!from || !to) return null;
          const status = corridorStatus(r, lockedCorridors);
          const meta = STATUS_META[status];
          const isSelected = selected === r.corridor_id;
          return (
            <line
              key={r.corridor_id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={meta.stroke}
              strokeWidth={isSelected ? 4 : 2.5}
              strokeDasharray={status === "blocked" ? "6 4" : undefined}
              strokeLinecap="round"
              className="cursor-pointer"
              onClick={() => setSelected(r.corridor_id)}
            >
              <title>
                {r.corridor_id}: {r.station_from} → {r.station_to} · {meta.label}
              </title>
            </line>
          );
        })}

        {nodeIds.map((id) => {
          const p = positions.get(id);
          if (!p) return null;
          return (
            <g key={id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={4.5}
                fill="hsl(var(--background))"
                stroke="hsl(var(--success))"
                strokeWidth={1.5}
              />
              <text x={p.x} y={p.y - 8} fontSize={8} textAnchor="middle" fill="hsl(var(--muted-foreground))">
                {id.replace("Station_", "")}
              </text>
            </g>
          );
        })}
      </svg>

      {blockedRow && (
        <div className="absolute bottom-2 right-2 max-w-[190px] rounded-md border border-danger/40 bg-card/95 p-2 text-[10px] shadow-lg">
          <div className="font-semibold">{blockedRow.corridor_id}</div>
          <div className="text-danger font-medium">BLOCKED</div>
          {blockedInfo && (
            <div className="text-muted-foreground">
              {blockedInfo.start_time} - {blockedInfo.end_time}
            </div>
          )}
        </div>
      )}

      {selectedRow && (
        <div className="absolute top-2 left-2 max-w-[200px] rounded-md border border-border bg-card/95 p-2 text-[10px] shadow-lg">
          <div className="font-semibold">{selectedRow.corridor_id}</div>
          <div className="text-muted-foreground">
            {selectedRow.station_from} → {selectedRow.station_to}
          </div>
          <div>Traffic: {selectedRow.traffic_density}</div>
          {selectedRisk && (
            <>
              <div>Avg failure risk: {selectedRisk.avg_failure_risk}</div>
              <div>Critical assets: {selectedRisk.critical_assets}</div>
            </>
          )}
        </div>
      )}

      <div className="absolute bottom-2 left-2 flex items-center gap-3 rounded-md bg-card/80 px-2 py-1 text-[9px]">
        {(Object.keys(STATUS_META) as Status[]).map((s) => (
          <div key={s} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${STATUS_META[s].dot}`} />
            <span className="text-muted-foreground">{STATUS_META[s].label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
