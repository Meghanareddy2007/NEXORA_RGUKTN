"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchNetwork, fetchBlocks } from "@/lib/api";
import { Plus, Minus, Maximize2, ArrowUpRight } from "lucide-react";

interface CorridorRow {
  corridor_id: string;
  station_from: string;
  station_to: string;
  traffic_density: string;
}

type EdgeState = "normal" | "busy" | "restricted" | "blocked";

interface Edge {
  corridor_id: string;
  from: string;
  to: string;
  state: EdgeState;
  blockInfo?: { start_time: string; end_time: string };
}

const STATE_COLOR: Record<EdgeState, string> = {
  normal: "#22c55e",
  busy: "#38bdf8",
  restricted: "#f59e0b",
  blocked: "#ef4444",
};

const STATE_LABEL: Record<EdgeState, string> = {
  normal: "Normal",
  busy: "Busy",
  blocked: "Maint. Block",
  restricted: "Restricted",
};

const WIDTH = 760;
const HEIGHT = 380;
const MAX_CORRIDORS = 9;

// Deterministic Fruchterman-Reingold-style force layout, no external deps —
// keeps node placement stable across renders since it's a pure function of
// the corridor list, not random.
function layoutGraph(nodes: string[], edges: [string, string][]) {
  const pos: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2;
    pos[n] = {
      x: WIDTH / 2 + Math.cos(angle) * (WIDTH * 0.32),
      y: HEIGHT / 2 + Math.sin(angle) * (HEIGHT * 0.32),
    };
  });

  const k = Math.sqrt((WIDTH * HEIGHT) / Math.max(nodes.length, 1)) * 0.9;
  let t = WIDTH / 8;

  for (let iter = 0; iter < 220; iter++) {
    const disp: Record<string, { x: number; y: number }> = {};
    nodes.forEach((n) => (disp[n] = { x: 0, y: 0 }));

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos[nodes[i]];
        const b = pos[nodes[j]];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
        const force = (k * k) / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        disp[nodes[i]].x += fx;
        disp[nodes[i]].y += fy;
        disp[nodes[j]].x -= fx;
        disp[nodes[j]].y -= fy;
      }
    }

    edges.forEach(([s, e]) => {
      const a = pos[s];
      const b = pos[e];
      if (!a || !b) return;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      disp[s].x -= fx;
      disp[s].y -= fy;
      disp[e].x += fx;
      disp[e].y += fy;
    });

    nodes.forEach((n) => {
      const d = disp[n];
      const dist = Math.max(Math.sqrt(d.x * d.x + d.y * d.y), 0.01);
      const limited = Math.min(dist, t);
      pos[n].x += (d.x / dist) * limited;
      pos[n].y += (d.y / dist) * limited;
      pos[n].x = Math.max(50, Math.min(WIDTH - 50, pos[n].x));
      pos[n].y = Math.max(40, Math.min(HEIGHT - 40, pos[n].y));
    });

    t *= 0.96;
  }

  return pos;
}

export function NetworkSchematic({ today, mapHref }: { today?: string; mapHref?: string }) {
  const [corridors, setCorridors] = useState<CorridorRow[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [scale, setScale] = useState(1);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    Promise.all([fetchNetwork(), fetchBlocks()]).then(([network, blocks]) => {
      const rows: CorridorRow[] = network.slice(0, MAX_CORRIDORS);
      setCorridors(rows);

      const todaysBlocks = today ? blocks.filter((b: any) => b.date === today) : blocks;
      const byCorridor = new Map<string, any[]>();
      todaysBlocks.forEach((b: any) => {
        if (!byCorridor.has(b.corridor_id)) byCorridor.set(b.corridor_id, []);
        byCorridor.get(b.corridor_id)!.push(b);
      });

      const derivedEdges: Edge[] = rows.map((r) => {
        const bs = byCorridor.get(r.corridor_id) ?? [];
        const locked = bs.find((b) => b.status === "Locked");
        const high = bs.find((b) => b.traffic_level === "High");
        const booked = bs.find((b) => b.status === "Booked");
        let state: EdgeState = "normal";
        let blockInfo: Edge["blockInfo"];
        if (locked) {
          state = "blocked";
          blockInfo = { start_time: locked.start_time, end_time: locked.end_time };
        } else if (high) {
          state = "restricted";
        } else if (booked) {
          state = "busy";
        }
        return { corridor_id: r.corridor_id, from: r.station_from, to: r.station_to, state, blockInfo };
      });
      setEdges(derivedEdges);
    });
  }, [today]);

  const nodeNames = useMemo(() => {
    const s = new Set<string>();
    corridors.forEach((c) => {
      s.add(c.station_from);
      s.add(c.station_to);
    });
    return Array.from(s);
  }, [corridors]);

  const positions = useMemo(() => {
    if (!nodeNames.length) return {};
    const edgePairs: [string, string][] = corridors.map((c) => [c.station_from, c.station_to]);
    return layoutGraph(nodeNames, edgePairs);
  }, [nodeNames, corridors]);

  const blockedEdge = edges.find((e) => e.state === "blocked");
  const blockedMid =
    blockedEdge && positions[blockedEdge.from] && positions[blockedEdge.to]
      ? {
          x: (positions[blockedEdge.from].x + positions[blockedEdge.to].x) / 2,
          y: (positions[blockedEdge.from].y + positions[blockedEdge.to].y) / 2,
        }
      : null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Network Overview</h2>
        <div className="flex items-center gap-2">
          {mapHref && (
            <Link href={mapHref} className="flex items-center gap-1 text-xs text-primary hover:underline mr-1">
              Full map <ArrowUpRight className="h-3 w-3" />
            </Link>
          )}
          <button
            onClick={() => setScale((s) => Math.max(0.6, +(s - 0.15).toFixed(2)))}
            className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Zoom out"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setScale((s) => Math.min(1.8, +(s + 0.15).toFixed(2)))}
            className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Zoom in"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Expand"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        className={`relative flex-1 overflow-hidden rounded-lg border border-border/60 bg-background/40 ${
          expanded ? "min-h-[520px]" : "min-h-[280px]"
        }`}
      >
        {nodeNames.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Loading network…
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-full w-full"
            style={{ transform: `scale(${scale})`, transformOrigin: "center" }}
          >
            {edges.map((e) => {
              const a = positions[e.from];
              const b = positions[e.to];
              if (!a || !b) return null;
              return (
                <line
                  key={e.corridor_id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={STATE_COLOR[e.state]}
                  strokeWidth={3}
                  strokeDasharray={e.state === "blocked" ? "6 5" : undefined}
                  strokeLinecap="round"
                  opacity={0.9}
                />
              );
            })}

            {nodeNames.map((n) => {
              const p = positions[n];
              if (!p) return null;
              return (
                <g key={n}>
                  <circle cx={p.x} cy={p.y} r={7} fill="#0f172a" stroke="#38bdf8" strokeWidth={2} />
                  <text
                    x={p.x}
                    y={p.y - 12}
                    textAnchor="middle"
                    fontSize={12}
                    fill="hsl(210 40% 90%)"
                    fontWeight={600}
                  >
                    {n.replace("Station_", "")}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {blockedEdge && blockedMid && (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-md border border-danger/40 bg-card px-3 py-1.5 text-center shadow-lg"
            style={{
              left: `${(blockedMid.x / WIDTH) * 100}%`,
              top: `${(blockedMid.y / HEIGHT) * 100}%`,
            }}
          >
            <div className="text-[11px] font-semibold">{blockedEdge.corridor_id}</div>
            <div className="text-[10px] font-medium text-danger">BLOCKED</div>
            {blockedEdge.blockInfo && (
              <div className="text-[10px] text-muted-foreground">
                {blockedEdge.blockInfo.start_time} - {blockedEdge.blockInfo.end_time}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {(Object.keys(STATE_LABEL) as EdgeState[]).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm" style={{ background: STATE_COLOR[s] }} />
            {STATE_LABEL[s]}
          </div>
        ))}
      </div>
    </div>
  );
}