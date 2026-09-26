"use client";

import { Search, X } from "lucide-react";
import type { SignallingMapData, SignallingMapStatus, SignallingSeverity } from "@/lib/smmsApi";
import {
  ConditionFlag,
  MapFilters,
  SEVERITIES,
  STATUS_META,
  STATUS_ORDER,
  applyFilters,
  countBy,
  isDefaultFilters,
  DEFAULT_FILTERS,
} from "./model";

const CATEGORY_CHIP_LABEL: Record<string, string> = { "Signalling Power": "Power" };
const FLAG_CHIPS: { flag: ConditionFlag; label: string; hint: string }[] = [
  { flag: "failures", label: "Failures", hint: "Open Corrective/Emergency failure, or register status Critical" },
  { flag: "maintenance", label: "Maintenance", hint: "Has a pending, scheduled or in-progress maintenance record" },
  { flag: "critical", label: "Critical Assets", hint: "" },
];

function Chip({
  active,
  disabledLook,
  onClick,
  children,
  title,
}: {
  active: boolean;
  disabledLook?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : disabledLook
          ? "border-border/60 text-muted-foreground/50 hover:text-muted-foreground"
          : "border-border bg-card/60 text-muted-foreground hover:border-primary/60 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

const Count = ({ n, active }: { n: number; active: boolean }) => (
  <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${active ? "bg-black/20" : "bg-muted"}`}>{n}</span>
);

const selectClass =
  "h-8 min-w-0 rounded-md border border-border bg-card px-2 text-xs text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";

export function FilterBar({
  data,
  filters,
  onChange,
}: {
  data: SignallingMapData;
  filters: MapFilters;
  onChange: (f: MapFilters) => void;
}) {
  const set = (patch: Partial<MapFilters>) => onChange({ ...filters, ...patch });
  const byCategory = countBy(applyFilters(data.assets, filters, "category"), (a) => a.category);
  const forFlags = applyFilters(data.assets, filters, "flag");
  const flagCount: Record<ConditionFlag, number> = {
    failures: forFlags.filter((a) => a.is_failure).length,
    maintenance: forFlags.filter((a) => a.has_open_maintenance).length,
    critical: forFlags.filter((a) => a.is_critical_asset).length,
  };
  const allCount = applyFilters(data.assets, { ...filters, category: null, flag: null }).length;
  const bySeverity = countBy(applyFilters(data.assets, filters, "severity"), (a) => a.failure_severity);

  return (
    <div className="space-y-2.5" role="region" aria-label="Map filters">
      {/* quick filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip
          active={filters.category === null && filters.flag === null}
          onClick={() => set({ category: null, flag: null })}
        >
          All Assets <Count n={allCount} active={filters.category === null && filters.flag === null} />
        </Chip>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {data.coverage.categories.map((c) => {
          const n = byCategory.get(c.category) ?? 0;
          const active = filters.category === c.category;
          return (
            <Chip
              key={c.category}
              active={active}
              disabledLook={!c.available}
              title={c.note ?? undefined}
              onClick={() => set({ category: active ? null : c.category })}
            >
              {CATEGORY_CHIP_LABEL[c.category] ?? c.category} <Count n={n} active={active} />
            </Chip>
          );
        })}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {FLAG_CHIPS.map(({ flag, label, hint }) => {
          const active = filters.flag === flag;
          return (
            <Chip
              key={flag}
              active={active}
              title={flag === "critical" ? data.coverage.critical_asset_rule : hint}
              onClick={() => set({ flag: active ? null : flag })}
            >
              {label} <Count n={flagCount[flag]} active={active} />
            </Chip>
          );
        })}
      </div>

      {/* refinements */}
      <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-3 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.3fr)_auto]">
        <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
          Section
          <select className={selectClass} value={filters.section} onChange={(e) => set({ section: e.target.value })}>
            <option value="all">All sections</option>
            {data.sections.map((s) => (
              <option key={s.corridor_id} value={s.corridor_id}>
                {s.corridor_id} · {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
          Status
          <select
            className={selectClass}
            value={filters.status}
            onChange={(e) => set({ status: e.target.value as SignallingMapStatus | "all" })}
          >
            <option value="all">Any status</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
          Severity (open failures)
          <select
            className={selectClass}
            value={filters.severity}
            onChange={(e) => set({ severity: e.target.value as SignallingSeverity | "all" })}
          >
            <option value="all">Any severity</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s} ({bySeverity.get(s) ?? 0})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
          Asset type
          <select
            className={selectClass}
            value={filters.category ?? "all"}
            onChange={(e) => set({ category: e.target.value === "all" ? null : e.target.value })}
          >
            <option value="all">All asset types</option>
            {data.coverage.categories.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category}
                {c.available ? "" : " (none in datasets)"}
              </option>
            ))}
          </select>
        </label>
        <label className="relative col-span-2 flex flex-col gap-1 text-[10px] text-muted-foreground md:col-span-1">
          Find asset
          <span className="relative">
            <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5" />
            <input
              type="search"
              value={filters.search}
              onChange={(e) => set({ search: e.target.value })}
              placeholder="Asset ID or section"
              className={`${selectClass} w-full pl-7`}
            />
          </span>
        </label>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FILTERS)}
          disabled={isDefaultFilters(filters)}
          className="flex h-8 items-center justify-center gap-1 rounded-md border border-border px-3 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" /> Reset
        </button>
      </div>
    </div>
  );
}

/** Status tiles: the colour legend and a one-click status filter in one. */
export function StatusStrip({
  data,
  filters,
  onChange,
}: {
  data: SignallingMapData;
  filters: MapFilters;
  onChange: (f: MapFilters) => void;
}) {
  const counts = countBy(applyFilters(data.assets, filters, "status"), (a) => a.status);
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5" role="group" aria-label="Filter by status">
      {STATUS_ORDER.map((s) => {
        const meta = STATUS_META[s];
        const active = filters.status === s;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={active}
            title={meta.rule}
            onClick={() => onChange({ ...filters, status: active ? "all" : s })}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
              active ? "border-white/70 bg-muted" : "border-border bg-card/60 hover:bg-muted/60"
            }`}
          >
            <span className="h-8 w-1.5 flex-none rounded-full" style={{ background: meta.color }} />
            <span className="min-w-0">
              <span className="block text-lg font-semibold leading-none tabular-nums">{counts.get(s) ?? 0}</span>
              <span className="mt-1 block truncate text-[11px] text-muted-foreground">{meta.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
