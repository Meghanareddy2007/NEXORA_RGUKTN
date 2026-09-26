"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, CircleMarker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./signalling-map/smms-map.css";
import { Crosshair, Layers, LayoutGrid, Map as MapIcon, Minus, Plus } from "lucide-react";
import type { SignallingMapAsset, SignallingMapData, SignallingMapSection, SignallingMapStation } from "@/lib/smmsApi";
import { AssetGlyph } from "./signalling-map/glyphs";
import { assetIcon } from "./signalling-map/leafletIcons";
import { STATUS_META, STATUS_ORDER, SectionRollup, rollupBySection } from "./signalling-map/model";

export type MapMode = "schematic" | "geographic";

export interface FocusRequest {
  nonce: number;
  fitAll?: boolean;
  corridorId?: string;
  assetId?: string;
}

// OpenStreetMap's standard tile server — free and keyless (unchanged from the
// previous map). Only used by the Geographic view.
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type LL = [number, number];

/** Leaflet 1.9 fires `keypress` (not `click`) for Enter on a focused marker;
 * treat Enter and Space as activation so the map is usable from the keyboard. */
const activateOnKey = (fn: () => void) => (e: L.LeafletKeyboardEvent) => {
  const k = e.originalEvent.key;
  if (k === "Enter" || k === " ") {
    e.originalEvent.preventDefault();
    fn();
  }
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const toLL = (mode: MapMode, p: { latitude: number; longitude: number; x: number; y: number }): LL =>
  mode === "schematic" ? [-p.y, p.x] : [p.latitude, p.longitude];

interface SectionGeo {
  section: SignallingMapSection;
  a: LL;
  b: LL;
  mid: LL;
  /** unit normal in screen space (y down), pointing up (or left on vertical lines) */
  nx: number;
  ny: number;
  midLat: number;
}

function buildGeometry(mode: MapMode, sections: SignallingMapSection[], stations: SignallingMapStation[]) {
  const st = new Map(stations.map((s) => [s.id, s]));
  const out = new Map<string, SectionGeo>();
  for (const sec of sections) {
    const from = st.get(sec.station_from);
    const to = st.get(sec.station_to);
    if (!from || !to) continue;
    const a = toLL(mode, from);
    const b = toLL(mode, to);
    const midLat = (from.latitude + to.latitude) / 2;
    let dx: number, dy: number; // direction in screen space
    if (mode === "schematic") {
      dx = to.x - from.x;
      dy = to.y - from.y;
    } else {
      dx = (to.longitude - from.longitude) * Math.cos((midLat * Math.PI) / 180);
      dy = -(to.latitude - from.latitude);
    }
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (ny > 1e-6 || (Math.abs(ny) <= 1e-6 && nx > 0)) {
      nx = -nx;
      ny = -ny;
    }
    out.set(sec.corridor_id, { section: sec, a, b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], nx, ny, midLat });
  }
  return out;
}

/** Screen pixels -> map-coordinate delta, for drawing parallel rails at a
 * constant on-screen spacing regardless of zoom. */
function pxDelta(mode: MapMode, zoom: number, midLat: number, sx: number, sy: number): LL {
  if (mode === "schematic") {
    const u = 1 / Math.pow(2, zoom);
    return [-sy * u, sx * u];
  }
  const degLng = 360 / (256 * Math.pow(2, zoom));
  const degLat = degLng * Math.cos((midLat * Math.PI) / 180);
  return [-sy * degLat, sx * degLng];
}

// ---------------------------------------------------------------------------
// Map helpers (must live inside <MapContainer>)
// ---------------------------------------------------------------------------
function ZoomWatcher({ onZoom, onView }: { onZoom: (z: number) => void; onView: (b: L.LatLngBounds) => void }) {
  const map = useMap();
  useMapEvents({
    zoomend: () => {
      onZoom(map.getZoom());
      onView(map.getBounds());
    },
    moveend: () => onView(map.getBounds()),
  });
  useEffect(() => {
    onZoom(map.getZoom());
    onView(map.getBounds());
  }, [map, onZoom, onView]);
  return null;
}

function FitController({
  bounds,
  focus,
  geos,
  assetsById,
  mode,
  onFitZoom,
}: {
  bounds: L.LatLngBounds;
  focus: FocusRequest | null;
  geos: Map<string, SectionGeo>;
  assetsById: Map<string, SignallingMapAsset>;
  mode: MapMode;
  onFitZoom: (z: number) => void;
}) {
  const map = useMap();

  // initial fit (runs again when the view mode remounts the map)
  useEffect(() => {
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [56, 56], animate: false });
    onFitZoom(map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, bounds]);

  // programmatic focus requests (list clicks, "Fit network")
  useEffect(() => {
    if (!focus) return;
    if (focus.fitAll) {
      map.flyToBounds(bounds, { padding: [40, 40], duration: 0.5 });
      return;
    }
    const maxZ = mode === "schematic" ? map.getZoom() + 1.75 : 10;
    const asset = focus.assetId ? assetsById.get(focus.assetId) : undefined;
    if (asset && asset.position.exact) {
      map.flyTo(toLL(mode, asset.position), Math.max(map.getZoom(), maxZ), { duration: 0.6 });
      return;
    }
    const g = focus.corridorId ? geos.get(focus.corridorId) : undefined;
    if (g) map.flyToBounds(L.latLngBounds([g.a, g.b]), { padding: [90, 90], maxZoom: maxZ, duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  return null;
}

// ---------------------------------------------------------------------------
// Layout constants (screen pixels)
// ---------------------------------------------------------------------------
const CAP_W = 88;
const CAP_H = 30;
const CAP_OFFSET = 34; // section marker distance from the line
const CAP_W_COMPACT = 58;
const CAP_H_COMPACT = 20;
const CAP_OFFSET_COMPACT = 24;
const TRAY_COLS = 6;
const TRAY_CELL = 27;
const TRAY_TITLE = 18;
const MAX_TRAY_SECTIONS = 6; // 'show all' only draws trays when this few sections are in view

// Trackside lane per category: +1 above the line, -1 below, 0 on the track.
const LANE: Record<string, number> = { Signals: 1, "Point Machines": 0, Interlocking: -1, "Cable Plant": -1 };

export interface SignallingMapProps {
  data: SignallingMapData;
  /** assets after filtering */
  assets: SignallingMapAsset[];
  mode: MapMode;
  onModeChange: (m: MapMode) => void;
  selectedAssetId: string | null;
  selectedSectionId: string | null;
  expandSectionLevel: boolean;
  onToggleExpand: () => void;
  focus: FocusRequest | null;
  onFit: () => void;
  onSelectAsset: (mapId: string) => void;
  onSelectSection: (corridorId: string) => void;
}

export default function SignallingAssetHealthMap(props: SignallingMapProps) {
  const { data, assets, mode, selectedAssetId, selectedSectionId, expandSectionLevel, focus } = props;
  const [zoom, setZoom] = useState<number | null>(null);
  const [fitZoom, setFitZoom] = useState<number | null>(null);
  const [view, setView] = useState<L.LatLngBounds | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  const geos = useMemo(() => buildGeometry(mode, data.sections, data.stations), [mode, data.sections, data.stations]);
  const rollups = useMemo(() => rollupBySection(assets), [assets]);
  const assetsById = useMemo(() => new Map(data.assets.map((a) => [a.map_id, a])), [data.assets]);
  const selectedAsset = selectedAssetId ? assetsById.get(selectedAssetId) ?? null : null;

  const bounds = useMemo(() => {
    const pts = data.stations.map((s) => toLL(mode, s));
    return L.latLngBounds(pts.length ? pts : [[0, 0]]);
  }, [data.stations, mode]);

  const z = zoom ?? 0;
  const rel = fitZoom === null ? 0 : z - fitZoom;
  const glyphSize = rel < 0.4 ? 16 : rel < 1.25 ? 22 : rel < 2 ? 26 : 30;
  const compactCap = rel < 0.75;
  const railGap = rel < 0.5 ? 3 : 4;
  const showStationNames = mode === "schematic" ? rel >= 0.6 : z >= 9;

  // Sections whose section-level assets are drawn out individually: the
  // selected section always; with the toggle on, every section in view — but
  // only once few enough are in view for the trays to stay readable.
  const inView = useMemo(() => {
    if (!view) return [] as string[];
    return data.sections
      .filter((sec) => {
        const g = geos.get(sec.corridor_id);
        return g ? view.contains(L.latLng(g.mid)) : false;
      })
      .map((sec) => sec.corridor_id);
  }, [view, data.sections, geos]);
  const tooManyInView = inView.length > MAX_TRAY_SECTIONS;
  const expanded = useMemo(() => {
    const s = new Set<string>();
    if (expandSectionLevel && !tooManyInView) inView.forEach((id) => s.add(id));
    if (selectedSectionId) s.add(selectedSectionId);
    if (selectedAsset && !selectedAsset.position.exact) s.add(selectedAsset.corridor_id);
    return s;
  }, [expandSectionLevel, tooManyInView, inView, selectedSectionId, selectedAsset]);

  // faint drawing-sheet grid behind the schematic
  const graticule = useMemo(() => {
    if (mode !== "schematic") return [];
    const lines: LL[][] = [];
    for (let x = 0; x <= 1000; x += 100) lines.push([[-60, x], [-720, x]]);
    for (let y = 100; y <= 700; y += 100) lines.push([[-y, 0], [-y, 1000]]);
    return lines;
  }, [mode]);

  return (
    <div className={`smms-map relative h-full w-full ${mode === "geographic" ? "is-geographic" : ""}`}>
      <MapContainer
        key={mode}
        center={bounds.getCenter()}
        zoom={mode === "schematic" ? 0 : 7}
        {...(mode === "schematic"
          ? {
              crs: L.CRS.Simple,
              minZoom: -2,
              maxZoom: 3.5,
              zoomSnap: 0.25,
              zoomDelta: 0.5,
              attributionControl: false,
              maxBounds: bounds.pad(0.6),
              maxBoundsViscosity: 0.7,
            }
          : { minZoom: 5, maxZoom: 13, zoomSnap: 0.5, zoomDelta: 0.5 })}
        scrollWheelZoom
        className="h-full w-full"
      >
        {mode === "geographic" && <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />}
        <ZoomWatcher onZoom={setZoom} onView={setView} />
        <FitController bounds={bounds} focus={focus} geos={geos} assetsById={assetsById} mode={mode} onFitZoom={setFitZoom} />

        {graticule.map((l, i) => (
          <Polyline key={`g${i}`} positions={l} interactive={false} pathOptions={{ color: "#1b2740", weight: 1, opacity: 0.55 }} />
        ))}

        {/* 1 · section health glow (worst status among the visible assets) */}
        {data.sections.map((sec) => {
          const g = geos.get(sec.corridor_id);
          const r = rollups.get(sec.corridor_id);
          if (!g || !r?.worst) return null;
          const sel = selectedSectionId === sec.corridor_id;
          return (
            <Polyline
              key={`glow-${sec.corridor_id}`}
              positions={[g.a, g.b]}
              interactive={false}
              pathOptions={{
                color: STATUS_META[r.worst].color,
                weight: (sec.track_count - 1) * railGap + 7 + (sel ? 16 : 11),
                opacity: sel ? 0.34 : 0.17,
                lineCap: "round",
              }}
            />
          );
        })}

        {/* 2 · sleepers */}
        {data.sections.map((sec) => {
          const g = geos.get(sec.corridor_id);
          if (!g) return null;
          return (
            <Polyline
              key={`sl-${sec.corridor_id}`}
              positions={[g.a, g.b]}
              interactive={false}
              pathOptions={{ color: "#3f4f69", weight: (sec.track_count - 1) * railGap + 7, opacity: 0.95, dashArray: "1.5 5", lineCap: "butt" }}
            />
          );
        })}

        {/* 3 · rails — one line per recorded track in the section */}
        {data.sections.flatMap((sec) => {
          const g = geos.get(sec.corridor_id);
          if (!g) return [];
          const sel = selectedSectionId === sec.corridor_id;
          const has = (rollups.get(sec.corridor_id)?.total ?? 0) > 0;
          return Array.from({ length: sec.track_count }, (_, i) => {
            const off = (i - (sec.track_count - 1) / 2) * railGap;
            const [dLat, dLng] = pxDelta(mode, z, g.midLat, g.nx * off, g.ny * off);
            return (
              <Polyline
                key={`rail-${sec.corridor_id}-${i}`}
                positions={[[g.a[0] + dLat, g.a[1] + dLng], [g.b[0] + dLat, g.b[1] + dLng]]}
                interactive={false}
                pathOptions={{ color: sel ? "#ffffff" : "#cbd5e1", weight: 1.6, opacity: has || sel ? 1 : 0.45 }}
              />
            );
          });
        })}

        {/* 4 · wide invisible hit area: hover for details, click to select the section */}
        {data.sections.map((sec) => {
          const g = geos.get(sec.corridor_id);
          if (!g) return null;
          return (
            <Polyline
              key={`hit-${sec.corridor_id}`}
              positions={[g.a, g.b]}
              pathOptions={{ color: "#000", weight: 16, opacity: 0 }}
              eventHandlers={{ click: () => props.onSelectSection(sec.corridor_id) }}
            >
              <Tooltip sticky className="smms-tt" direction="top" opacity={1}>
                <SectionTip sec={sec} rollup={rollups.get(sec.corridor_id)} />
              </Tooltip>
            </Polyline>
          );
        })}

        {/* stations */}
        {data.stations.map((s) => {
          const w = s.is_junction ? 46 : 38;
          const h = s.is_junction ? 21 : 17;
          const name = showStationNames ? `<span class="smms-stn-name">${esc(s.name)}</span>` : "";
          return (
            <Marker
              key={`stn-${s.id}`}
              position={toLL(mode, s)}
              zIndexOffset={300}
              keyboard={false}
              icon={L.divIcon({
                className: "smms-icon",
                iconSize: [w, h],
                iconAnchor: [w / 2, h / 2],
                html: `<div class="smms-stn ${s.is_junction ? "is-junction" : ""}">${esc(s.code)}${name}</div>`,
              })}
            >
              <Tooltip direction="top" offset={[0, -12]} className="smms-tt" opacity={1}>
                <b>{s.name}</b> <span className="muted">({s.code})</span>
                <div className="muted">
                  {s.is_junction ? "Junction" : "Station"} · {s.platforms} platforms · {s.division}
                </div>
              </Tooltip>
            </Marker>
          );
        })}

        {/* assets with an exact position: a tick on the rail + a trackside glyph */}
        {assets.map((a) =>
          a.position.exact ? (
            <CircleMarker
              key={`tick-${a.map_id}`}
              center={toLL(mode, a.position)}
              radius={2.2}
              interactive={false}
              pathOptions={{ color: "#0a1220", weight: 1, fillColor: "#e2e8f0", fillOpacity: 1 }}
            />
          ) : null
        )}
        {assets.map((a) => {
          const g = geos.get(a.corridor_id);
          if (!a.position.exact || !g) return null;
          const lane = (LANE[a.category] ?? 0) * (glyphSize * 0.5 + 6 + ((g.section.track_count - 1) * railGap) / 2);
          const selected = a.map_id === selectedAssetId;
          return (
            <AssetMarker
              key={a.map_id}
              asset={a}
              position={toLL(mode, a.position)}
              selected={selected}
              size={glyphSize}
              dx={g.nx * lane}
              dy={g.ny * lane}
              sectionLevel={false}
              zIndex={selected ? 3000 : 200}
              onSelect={props.onSelectAsset}
            />
          );
        })}

        {/* section markers: id, asset count and a status bar */}
        <SectionMarkers
          mode={mode}
          zoom={z}
          compact={compactCap}
          sections={data.sections}
          stations={data.stations}
          geos={geos}
          rollups={rollups}
          selectedSectionId={selectedSectionId}
          onSelectSection={props.onSelectSection}
          expanded={expanded}
          selectedAssetId={selectedAssetId}
          glyphSize={glyphSize}
          onSelectAsset={props.onSelectAsset}
        />

      </MapContainer>

      {/* ---- overlays (outside Leaflet so they stay put while panning) ---- */}
      <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={props.onToggleExpand}
          aria-pressed={expandSectionLevel}
          title="Draw out the assets whose recorded km is outside their section. Shown for the sections in view once few enough are on screen; selecting a section always shows its own."
          className={`pointer-events-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium shadow-lg transition-colors ${
            expandSectionLevel ? "border-primary bg-primary/20 text-foreground" : "border-border bg-card/95 text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Section-level assets: {!expandSectionLevel ? "hidden" : tooManyInView ? "zoom in to show" : "shown"}
        </button>
        <button
          type="button"
          onClick={props.onFit}
          className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-border bg-card/95 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground shadow-lg hover:text-foreground"
        >
          <Crosshair className="h-3.5 w-3.5" /> Fit network
        </button>
        <div
          className="pointer-events-auto flex overflow-hidden rounded-md border border-border bg-card/95 text-[11px] font-medium shadow-lg"
          role="group"
          aria-label="Map view"
        >
          {(
            [
              ["schematic", "Schematic", Layers],
              ["geographic", "Geographic", MapIcon],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => props.onModeChange(m)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 transition-colors ${
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <Legend open={legendOpen} onToggle={() => setLegendOpen((v) => !v)} />

      {mode === "schematic" && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-[1000] max-w-[260px] rounded border border-border bg-card/90 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
          Schematic, not to scale. Parallel lines = recorded tracks per section.
        </div>
      )}

      {assets.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[900] flex items-center justify-center">
          <div className="rounded-lg border border-border bg-card/95 px-4 py-3 text-center text-xs shadow-lg">
            <div className="font-medium">No assets match the current filters</div>
            <div className="mt-0.5 text-muted-foreground">Stations and sections stay visible for reference.</div>
          </div>
        </div>
      )}
    </div>
  );
}


/** Section chips, placed so they do not sit on top of each other or on
 * stations: each tries the usual spot beside the line, then further out /
 * the other side / shifted along the line. A thin leader ties it back. */
function SectionMarkers({
  mode,
  zoom,
  compact,
  sections,
  stations,
  geos,
  rollups,
  selectedSectionId,
  onSelectSection,
  expanded,
  selectedAssetId,
  glyphSize,
  onSelectAsset,
}: {
  mode: MapMode;
  zoom: number;
  compact: boolean;
  sections: SignallingMapSection[];
  stations: SignallingMapStation[];
  geos: Map<string, SectionGeo>;
  rollups: Map<string, SectionRollup>;
  selectedSectionId: string | null;
  onSelectSection: (id: string) => void;
  expanded: Set<string>;
  selectedAssetId: string | null;
  glyphSize: number;
  onSelectAsset: (id: string) => void;
}) {
  const map = useMap();
  const capW = compact ? CAP_W_COMPACT : CAP_W;
  const capH = compact ? CAP_H_COMPACT : CAP_H;
  const base = compact ? CAP_OFFSET_COMPACT : CAP_OFFSET;

  const { placed, trays } = useMemo(() => {
    type Rect = { x: number; y: number; w: number; h: number };
    const hit = (a: Rect, b: Rect) =>
      Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 3 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 3;
    const taken: Rect[] = stations.map((st) => {
      const p = map.project(toLL(mode, st), zoom);
      return { x: p.x, y: p.y, w: st.is_junction ? 46 : 38, h: st.is_junction ? 21 : 17 };
    });
    // first free candidate offset for a w×h box near a section midpoint
    const choose = (g: SectionGeo, w: number, h: number, dists: number[], alongs: number[]) => {
      const m = map.project(g.mid, zoom);
      const ux = -g.ny;
      const uy = g.nx;
      const cands: [number, number][] = [];
      for (const d of dists) cands.push([g.nx * d, g.ny * d], [-g.nx * d, -g.ny * d]);
      for (const al of alongs) {
        for (const d of dists.slice(0, 2)) cands.push([g.nx * d + ux * al, g.ny * d + uy * al], [-g.nx * d + ux * al, -g.ny * d + uy * al]);
      }
      let pick = cands[0];
      for (const c of cands) {
        const r = { x: m.x + c[0], y: m.y + c[1], w, h };
        if (!taken.some((t) => hit(r, t))) {
          pick = c;
          break;
        }
      }
      taken.push({ x: m.x + pick[0], y: m.y + pick[1], w, h });
      return { dx: pick[0], dy: pick[1] };
    };

    const chips = new Map<string, { dx: number; dy: number }>();
    // busiest sections choose first
    const order = [...sections].sort((a, b) => (rollups.get(b.corridor_id)?.total ?? 0) - (rollups.get(a.corridor_id)?.total ?? 0));
    for (const sec of order) {
      const g = geos.get(sec.corridor_id);
      if (g) chips.set(sec.corridor_id, choose(g, capW, capH, [base, base + 26, base + 52], [capW * 0.65, -capW * 0.65]));
    }
    // section-level trays go in after the chips so chips keep their spot
    const trayPos = new Map<string, { dx: number; dy: number; w: number; h: number }>();
    for (const sec of order) {
      const r = rollups.get(sec.corridor_id);
      const g = geos.get(sec.corridor_id);
      if (!g || !r || r.sectionLevel.length === 0 || !expanded.has(sec.corridor_id)) continue;
      const { w, h } = trayDims(r.sectionLevel.length);
      const near = 20 + h / 2;
      const pos = choose(g, w, h, [near, near + 34, near + 68], [w * 0.6, -w * 0.6]);
      trayPos.set(sec.corridor_id, { ...pos, w, h });
    }
    return { placed: chips, trays: trayPos };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mode, zoom, compact, sections, stations, geos, rollups, expanded]);

  return (
    <>
      {sections.map((sec) => {
        const g = geos.get(sec.corridor_id);
        const pos = placed.get(sec.corridor_id);
        if (!g || !pos) return null;
        const r = rollups.get(sec.corridor_id);
        const selected = selectedSectionId === sec.corridor_id;
        const total = r?.total ?? 0;
        const bar = STATUS_ORDER.map((st) => {
          const n = r?.byStatus[st] ?? 0;
          return n ? `<i style="flex:${n};background:${STATUS_META[st].color}"></i>` : "";
        }).join("");
        const head = compact
          ? `<div class="smms-cap-row"><span class="smms-cap-id">${esc(sec.corridor_id)}</span></div>`
          : `<div class="smms-cap-row"><span class="smms-cap-id">${esc(sec.corridor_id)}</span><span class="smms-cap-km">${total} ${total === 1 ? "asset" : "assets"}</span></div>`;
        const mid = map.project(g.mid, zoom);
        const end = map.unproject(L.point(mid.x + pos.dx, mid.y + pos.dy), zoom);
        return (
          <Fragment key={`cap-${sec.corridor_id}`}>
            <Polyline
              positions={[g.mid, [end.lat, end.lng]]}
              interactive={false}
              pathOptions={{ color: "#64748b", weight: 1, opacity: 0.8, dashArray: "2 3" }}
            />
            <Marker
              position={g.mid}
              zIndexOffset={selected ? 900 : 600}
              icon={L.divIcon({
                className: "smms-icon",
                iconSize: [capW, capH],
                iconAnchor: [capW / 2 - pos.dx, capH / 2 - pos.dy],
                html:
                  `<div class="smms-cap ${compact ? "is-compact" : ""} ${selected ? "is-selected" : ""} ${total === 0 ? "is-empty" : ""}">` +
                  head +
                  `<div class="smms-cap-bar">${bar}</div></div>`,
              })}
              eventHandlers={{
                click: () => onSelectSection(sec.corridor_id),
                keypress: activateOnKey(() => onSelectSection(sec.corridor_id)),
                add: (e) => e.target.getElement()?.setAttribute("aria-label", `Section ${sec.corridor_id}, ${sec.label}, ${total} assets`),
              }}
            >
              <Tooltip direction="top" offset={[pos.dx, pos.dy - capH / 2]} className="smms-tt" opacity={1}>
                <SectionTip sec={sec} rollup={r} />
              </Tooltip>
            </Marker>
          </Fragment>
        );
      })}
      {sections.flatMap((sec) => {
        const g = geos.get(sec.corridor_id);
        const r = rollups.get(sec.corridor_id);
        const t = trays.get(sec.corridor_id);
        if (!g || !r || !t) return [];
        return sectionTray(sec, g, r, t, selectedAssetId, glyphSize, onSelectAsset);
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function SectionTip({ sec, rollup }: { sec: SignallingMapSection; rollup?: SectionRollup }) {
  const total = rollup?.total ?? 0;
  return (
    <div>
      <b>{sec.corridor_id}</b> <span className="muted">{sec.label}</span>
      <div className="muted">
        {sec.distance_km} km · {sec.track_count} track{sec.track_count > 1 ? "s" : ""} · {sec.section_type} · {sec.traffic_density} traffic
      </div>
      <div>
        {total} asset{total === 1 ? "" : "s"}
        {rollup && rollup.sectionLevel.length > 0 && (
          <span className="muted"> ({rollup.onLine.length} on line, {rollup.sectionLevel.length} section-level)</span>
        )}
      </div>
    </div>
  );
}

function AssetMarker({
  asset,
  position,
  selected,
  size,
  dx,
  dy,
  sectionLevel,
  zIndex,
  onSelect,
}: {
  asset: SignallingMapAsset;
  position: LL;
  selected: boolean;
  size: number;
  dx: number;
  dy: number;
  sectionLevel: boolean;
  zIndex: number;
  onSelect: (id: string) => void;
}) {
  const icon = useMemo(
    () => assetIcon(asset, { size, selected, dx: Math.round(dx), dy: Math.round(dy), sectionLevel }),
    [asset, size, selected, dx, dy, sectionLevel]
  );
  return (
    <Marker
      position={position}
      icon={icon}
      zIndexOffset={zIndex}
      eventHandlers={{
        click: () => onSelect(asset.map_id),
        keypress: activateOnKey(() => onSelect(asset.map_id)),
        add: (e) =>
          e.target
            .getElement()
            ?.setAttribute("aria-label", `${asset.asset_id}, ${asset.category}, ${asset.status_label}, section ${asset.corridor_id}`),
      }}
    >
      <Tooltip direction="top" className="smms-tt" opacity={1}>
        <div>
          <b>{asset.asset_id}</b> <span className="muted">{asset.category}</span>
        </div>
        <div>
          {asset.status_label}
          {asset.failure_severity ? ` · ${asset.failure_severity} failure` : ""}
        </div>
        <div className="muted">
          {asset.corridor_id} · {asset.section_label}
        </div>
      </Tooltip>
    </Marker>
  );
}

function trayDims(count: number) {
  const cols = Math.min(TRAY_COLS, count);
  const rows = Math.ceil(count / TRAY_COLS);
  return { w: Math.max(cols * TRAY_CELL + 12, 150), h: rows * TRAY_CELL + TRAY_TITLE + 8 };
}

/** Lays a section's section-level assets out in a small grid at a placed offset. */
function sectionTray(
  sec: SignallingMapSection,
  g: SectionGeo,
  r: SectionRollup,
  t: { dx: number; dy: number; w: number; h: number },
  selectedAssetId: string | null,
  size: number,
  onSelect: (id: string) => void
) {
  const items = r.sectionLevel;
  const { dx: cx, dy: cy, w, h } = t;
  const left = cx - w / 2;
  const top = cy - h / 2;

  const els = [
    <Marker
      key={`tray-${sec.corridor_id}`}
      position={g.mid}
      interactive={false}
      keyboard={false}
      zIndexOffset={1200}
      icon={L.divIcon({
        className: "smms-icon",
        iconSize: [w, h],
        iconAnchor: [w / 2 - cx, h / 2 - cy],
        html: `<div class="smms-tray">${esc(sec.corridor_id)} · section-level (${items.length})</div>`,
      })}
    />,
  ];
  items.forEach((a, i) => {
    const c = i % TRAY_COLS;
    const rr = Math.floor(i / TRAY_COLS);
    const ccx = left + 6 + c * TRAY_CELL + TRAY_CELL / 2;
    const ccy = top + TRAY_TITLE + rr * TRAY_CELL + TRAY_CELL / 2;
    const selected = a.map_id === selectedAssetId;
    els.push(
      <AssetMarker
        key={a.map_id}
        asset={a}
        position={g.mid}
        selected={selected}
        size={Math.min(size, 22)}
        dx={ccx}
        dy={ccy}
        sectionLevel
        zIndex={selected ? 3000 : 1400}
        onSelect={onSelect}
      />
    );
  });
  return els;
}

function Legend({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const kinds: [string, string][] = [
    ["Signals", "Signal"],
    ["Point Machines", "Point machine"],
    ["Interlocking", "Interlocking"],
    ["Cable Plant", "Cable plant"],
  ];
  return (
    <div className="absolute bottom-3 left-3 z-[1000] max-w-[215px] rounded-lg border border-border bg-card/95 text-[11px] shadow-lg backdrop-blur">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 font-semibold text-muted-foreground hover:text-foreground"
      >
        Legend
        {open ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3 pb-2.5 pt-2">
          <div className="space-y-1">
            {STATUS_ORDER.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: STATUS_META[s].color }} />
                {STATUS_META[s].label}
              </div>
            ))}
          </div>
          <div className="space-y-1 border-t border-border pt-2">
            {kinds.map(([cat, label]) => (
              <div key={cat} className="flex items-center gap-2">
                <AssetGlyph category={cat} status="inactive" size={16} />
                {label}
              </div>
            ))}
          </div>
          <div className="space-y-1 border-t border-border pt-2 text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 flex-none rotate-45 border border-background bg-slate-50" /> Critical asset
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 flex-none rounded-full border-2 border-danger" /> Failure open
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 flex-none rounded-full border border-dashed border-slate-300" /> Section-level (km not on line)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
