import type {
  SignallingMapAsset,
  SignallingMapStatus,
  SignallingSeverity,
} from "@/lib/smmsApi";

// ---------------------------------------------------------------------------
// Status model. Colours follow the SMMS convention:
//   green healthy · amber attention/maintenance due · red failure/critical ·
//   blue under maintenance · gray inactive.
// `ink` is the glyph colour that stays legible on top of that fill.
// ---------------------------------------------------------------------------
export interface StatusMeta {
  label: string;
  short: string;
  color: string;
  ink: string;
  rule: string;
}

export const STATUS_META: Record<SignallingMapStatus, StatusMeta> = {
  failure: {
    short: "Failure",
    label: "Failure / Critical",
    color: "#ef4444",
    ink: "#ffffff",
    rule: "Register status Critical, or an open Critical/High-severity failure.",
  },
  maintenance: {
    short: "In work",
    label: "Under Maintenance",
    color: "#3b82f6",
    ink: "#ffffff",
    rule: "A maintenance task on this asset is In Progress.",
  },
  attention: {
    short: "Attention",
    label: "Attention",
    color: "#f59e0b",
    ink: "#0a1220",
    rule: "Register status Degraded, or maintenance is pending/scheduled.",
  },
  healthy: {
    short: "Healthy",
    label: "Healthy",
    color: "#22c55e",
    ink: "#0a1220",
    rule: "Register status Normal and no open maintenance.",
  },
  inactive: {
    short: "Inactive",
    label: "Inactive",
    color: "#6b7280",
    ink: "#ffffff",
    rule: "No live health status on record and all maintenance completed.",
  },
};

/** Worst-first. Used for section roll-ups and list ordering. */
export const STATUS_ORDER: SignallingMapStatus[] = ["failure", "maintenance", "attention", "healthy", "inactive"];

export const SEVERITIES: SignallingSeverity[] = ["Critical", "High", "Medium", "Low"];
const SEVERITY_RANK: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
export const severityRank = (s: string | null | undefined) => (s ? SEVERITY_RANK[s] ?? 0 : 0);

/** Category (as named by the backend) -> the symbol drawn on the map. */
export type GlyphKind = "signal" | "point" | "interlock" | "cable" | "generic";
export function glyphKindFor(category: string): GlyphKind {
  switch (category) {
    case "Signals":
      return "signal";
    case "Point Machines":
      return "point";
    case "Interlocking":
      return "interlock";
    case "Cable Plant":
      return "cable";
    default:
      return "generic";
  }
}

/** Raw dataset asset types read more clearly in the panel with a plain name. */
export const RAW_TYPE_LABEL: Record<string, string> = {
  Signal: "Signal",
  Point: "Point machine",
  Interlock: "Interlocking",
  Cable: "Cable plant",
};

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
export type ConditionFlag = "failures" | "maintenance" | "critical";

export interface MapFilters {
  /** Asset category (Signals, Point Machines, …); null = all. Shared by the
   * quick chips and the "Asset Type" dropdown — they are the same filter. */
  category: string | null;
  /** Quick condition chip; null = none. */
  flag: ConditionFlag | null;
  section: string; // corridor_id or "all"
  status: SignallingMapStatus | "all";
  severity: SignallingSeverity | "all";
  search: string;
}

export const DEFAULT_FILTERS: MapFilters = {
  category: null,
  flag: null,
  section: "all",
  status: "all",
  severity: "all",
  search: "",
};

export const isDefaultFilters = (f: MapFilters) =>
  f.category === null &&
  f.flag === null &&
  f.section === "all" &&
  f.status === "all" &&
  f.severity === "all" &&
  f.search.trim() === "";

export function matchesFlag(a: SignallingMapAsset, flag: ConditionFlag | null): boolean {
  if (flag === null) return true;
  if (flag === "failures") return a.is_failure;
  if (flag === "maintenance") return a.has_open_maintenance;
  return a.is_critical_asset;
}

/** Apply every filter except (optionally) one facet — lets each control show
 * counts that reflect the *other* active filters. */
export function applyFilters(
  assets: SignallingMapAsset[],
  f: MapFilters,
  skip?: keyof MapFilters
): SignallingMapAsset[] {
  const q = f.search.trim().toLowerCase();
  return assets.filter((a) => {
    if (skip !== "category" && f.category !== null && a.category !== f.category) return false;
    if (skip !== "flag" && !matchesFlag(a, f.flag)) return false;
    if (skip !== "section" && f.section !== "all" && a.corridor_id !== f.section) return false;
    if (skip !== "status" && f.status !== "all" && a.status !== f.status) return false;
    if (skip !== "severity" && f.severity !== "all" && a.failure_severity !== f.severity) return false;
    if (skip !== "search" && q) {
      const hay = `${a.asset_id} ${a.category} ${a.asset_type} ${a.corridor_id} ${a.section_label}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function countBy<T extends string>(assets: SignallingMapAsset[], key: (a: SignallingMapAsset) => T | null) {
  const out = new Map<T, number>();
  for (const a of assets) {
    const k = key(a);
    if (k !== null) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Roll-ups
// ---------------------------------------------------------------------------
export interface SectionRollup {
  total: number;
  byStatus: Record<SignallingMapStatus, number>;
  worst: SignallingMapStatus | null;
  onLine: SignallingMapAsset[]; // exact chainage
  sectionLevel: SignallingMapAsset[]; // chainage not resolvable
}

const emptyStatusCounts = (): Record<SignallingMapStatus, number> => ({
  failure: 0,
  maintenance: 0,
  attention: 0,
  healthy: 0,
  inactive: 0,
});

export function rollupBySection(assets: SignallingMapAsset[]): Map<string, SectionRollup> {
  const out = new Map<string, SectionRollup>();
  for (const a of assets) {
    let r = out.get(a.corridor_id);
    if (!r) {
      r = { total: 0, byStatus: emptyStatusCounts(), worst: null, onLine: [], sectionLevel: [] };
      out.set(a.corridor_id, r);
    }
    r.total += 1;
    r.byStatus[a.status] += 1;
    (a.position.exact ? r.onLine : r.sectionLevel).push(a);
  }
  out.forEach((r) => {
    r.worst = STATUS_ORDER.find((s) => r.byStatus[s] > 0) ?? null;
    r.onLine.sort((x, y) => x.location_km - y.location_km);
    r.sectionLevel.sort((x, y) => STATUS_ORDER.indexOf(x.status) - STATUS_ORDER.indexOf(y.status) || x.asset_id.localeCompare(y.asset_id));
  });
  return out;
}

export function statusCounts(assets: SignallingMapAsset[]) {
  const c = emptyStatusCounts();
  for (const a of assets) c[a.status] += 1;
  return c;
}

/** Highest-priority-first ordering used by lists. */
export function comparePriority(a: SignallingMapAsset, b: SignallingMapAsset) {
  return (
    STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
    severityRank(b.failure_severity) - severityRank(a.failure_severity) ||
    Number(b.is_critical_asset) - Number(a.is_critical_asset) ||
    a.asset_id.localeCompare(b.asset_id)
  );
}

export const stationLabel = (id: string) => id.replace(/_/g, " ");
