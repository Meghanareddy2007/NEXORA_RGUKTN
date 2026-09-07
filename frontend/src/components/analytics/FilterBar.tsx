"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { AnalyticsFilters } from "@/lib/analytics";

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
      <span className="uppercase tracking-wide font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterBar({
  filters,
  onChange,
  dates,
  corridors,
}: {
  filters: AnalyticsFilters;
  onChange: (f: AnalyticsFilters) => void;
  dates: string[];
  corridors: { value: string; label: string }[];
}) {
  const active = Object.values(filters).some(Boolean);

  return (
    <div className="rounded-xl border border-border bg-card/60 p-3 flex flex-wrap items-end gap-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground pr-1">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters
      </div>
      <Select
        label="Date"
        value={filters.date}
        onChange={(v) => onChange({ ...filters, date: v })}
        options={dates.map((d) => ({ value: d, label: d }))}
      />
      <Select
        label="Railway Section"
        value={filters.corridor_id}
        onChange={(v) => onChange({ ...filters, corridor_id: v })}
        options={corridors}
      />
      <Select
        label="Block Status"
        value={filters.status}
        onChange={(v) => onChange({ ...filters, status: v })}
        options={[
          { value: "Available", label: "Available" },
          { value: "Booked", label: "Booked" },
          { value: "Locked", label: "Locked" },
        ]}
      />
      <Select
        label="Traffic Level"
        value={filters.traffic_level}
        onChange={(v) => onChange({ ...filters, traffic_level: v })}
        options={[
          { value: "Low", label: "Low" },
          { value: "Med", label: "Medium" },
          { value: "High", label: "High" },
        ]}
      />
      <Select
        label="Criticality"
        value={filters.criticality}
        onChange={(v) => onChange({ ...filters, criticality: v })}
        options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
      />
      {active && (
        <button
          onClick={() => onChange({ date: filters.date, corridor_id: "", status: "", traffic_level: "", criticality: "" })}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground ml-auto"
        >
          <X className="h-3 w-3" /> Clear
        </button>
      )}
    </div>
  );
}
