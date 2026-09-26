"use client";

/**
 * Asset lifecycle timeline. Shows only events the datasets actually hold —
 * maintenance work (with its due / performed date), failures and problem
 * reports — newest first. Kinds of event the data cannot supply
 * (installation, inspections, status changes) are listed by the caller as
 * "not available" rather than drawn.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, FileWarning, Wrench, type LucideIcon } from "lucide-react";
import type { DigitalTwinEvent, DigitalTwinEventKind } from "@/lib/smmsApi";
import { SEVERITY_STYLE } from "../badges";
import { EmptyNote, NEUTRAL_PILL, Pill } from "./parts";

const KIND_META: Record<DigitalTwinEventKind, { label: string; icon: LucideIcon; node: string }> = {
  failure: { label: "Failures", icon: AlertTriangle, node: "border-danger/50 bg-danger/15 text-danger" },
  maintenance: { label: "Maintenance", icon: Wrench, node: "border-info/50 bg-info/15 text-info" },
  problem: { label: "Problem reports", icon: FileWarning, node: "border-warning/50 bg-warning/15 text-warning" },
};

const DATE_LABEL: Record<DigitalTwinEvent["date_kind"], string> = {
  performed: "Performed",
  due: "Due",
  reported: "Reported",
};

const STATE_LABEL: Record<string, { text: string; style: string }> = {
  open: { text: "Open", style: "bg-info/15 text-info border-info/30" },
  planned: { text: "Planned", style: "bg-muted text-muted-foreground border-border" },
  done: { text: "Completed", style: "bg-success/15 text-success border-success/30" },
};

function stateChip(e: DigitalTwinEvent) {
  const mapped = STATE_LABEL[e.state];
  if (mapped) return <Pill label={mapped.text} styleClass={mapped.style} />;
  // Problem reports carry their own status text (Open, In Review, Resolved, …).
  return e.state ? <Pill label={e.state} styleClass={NEUTRAL_PILL} /> : null;
}

export function TwinTimeline({
  events,
  limit,
  filterable = false,
}: {
  events: DigitalTwinEvent[];
  /** Show only the newest N events (used for the overview preview). */
  limit?: number;
  filterable?: boolean;
}) {
  const [filter, setFilter] = useState<DigitalTwinEventKind | "all">("all");

  const counts = useMemo(() => {
    const c: Record<DigitalTwinEventKind, number> = { failure: 0, maintenance: 0, problem: 0 };
    for (const e of events) c[e.kind] += 1;
    return c;
  }, [events]);

  const shown = useMemo(() => {
    const rows = filter === "all" ? events : events.filter((e) => e.kind === filter);
    return limit ? rows.slice(0, limit) : rows;
  }, [events, filter, limit]);

  if (events.length === 0) {
    return <EmptyNote>No lifecycle events are recorded for this asset yet.</EmptyNote>;
  }

  return (
    <div>
      {filterable && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter timeline events">
          {(["all", "maintenance", "failure", "problem"] as const).map((k) => {
            const count = k === "all" ? events.length : counts[k];
            const active = filter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                aria-pressed={active}
                disabled={k !== "all" && count === 0}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                  active ? "border-primary/60 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {k === "all" ? "All" : KIND_META[k].label} · {count}
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyNote>No events of this kind.</EmptyNote>
      ) : (
        <ol className="relative">
          {shown.map((e, i) => {
            const meta = KIND_META[e.kind];
            const Icon = meta.icon;
            const last = i === shown.length - 1;
            return (
              <li key={`${e.kind}-${e.id}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
                {!last && <span aria-hidden className="absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-px bg-border" />}
                <span
                  className={`relative z-[1] mt-0.5 flex h-[27px] w-[27px] flex-none items-center justify-center rounded-full border ${meta.node} ${
                    e.state === "planned" ? "border-dashed" : ""
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {e.date ? `${DATE_LABEL[e.date_kind]} ${e.date}` : "Date not recorded"}
                    </span>
                    {stateChip(e)}
                    {e.severity && SEVERITY_STYLE[e.severity] && (
                      <Pill label={e.severity} styleClass={SEVERITY_STYLE[e.severity]} />
                    )}
                  </div>
                  <div className="mt-0.5 font-medium">{e.title}</div>
                  <div className="text-muted-foreground">{e.detail}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {limit && events.length > shown.length && filter === "all" && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Showing the newest {shown.length} of {events.length} events.
        </p>
      )}
    </div>
  );
}
