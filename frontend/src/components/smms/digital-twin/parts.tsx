"use client";

/**
 * Small presentational pieces shared by the SMMS Digital Twin panel. Pure UI:
 * no fetching, no data of its own. Styling reuses the existing SMMS badge
 * maps and status colours so the twin reads like the rest of NEXORA.
 */
import type { ReactNode } from "react";
import type { DigitalTwinRecord } from "@/lib/smmsApi";
import { SEVERITY_STYLE, STATUS_STYLE } from "../badges";

export const NOT_AVAILABLE = "Not available";

/** The one way the twin says "the datasets hold nothing for this". */
export function NotAvailable({ reason }: { reason?: string | null }) {
  return (
    <span className="italic text-muted-foreground" title={reason ?? undefined}>
      {NOT_AVAILABLE}
    </span>
  );
}

export function Pill({ label, styleClass }: { label: string; styleClass: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${styleClass}`}>
      {label}
    </span>
  );
}

export const NEUTRAL_PILL = "bg-muted text-muted-foreground border-border";

export function Panel({
  title,
  icon,
  aside,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-background/40 ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3.5 py-2.5">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold">
          {icon}
          {title}
        </h3>
        {aside}
      </div>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 py-1 text-xs sm:grid-cols-[128px_minmax(0,1fr)]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-snug text-muted-foreground">{children}</p>;
}

/** One maintenance / failure record (same shape for both lists). */
export function RecordCard({ r }: { r: DigitalTwinRecord }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{r.task_id}</span>
        <span className="flex flex-wrap items-center gap-1">
          <Pill label={r.status} styleClass={STATUS_STYLE[r.status] ?? NEUTRAL_PILL} />
          {r.severity ? (
            <Pill label={`${r.severity} severity`} styleClass={SEVERITY_STYLE[r.severity] ?? NEUTRAL_PILL} />
          ) : (
            <Pill label={`${r.priority} priority`} styleClass={SEVERITY_STYLE[r.priority] ?? NEUTRAL_PILL} />
          )}
        </span>
      </div>
      <div className="mt-1">
        {r.maintenance_type} · {r.defect_type}
      </div>
      <div className="mt-0.5 text-muted-foreground">
        Due {r.due_date}
        {r.is_open && r.overdue_days > 0 ? <span className="text-danger"> · {r.overdue_days} day(s) overdue</span> : null}
        {" · "}
        {r.estimated_duration_min} min · crew {r.crew_required}
      </div>
      <div className="mt-0.5 text-muted-foreground">
        Criticality {r.criticality} / 5 · safety risk {r.safety_risk} / 5
      </div>
    </div>
  );
}

/** Circular gauge. A dashed empty ring (no number) when there is no value. */
export function HealthRing({ percent, color }: { percent: number | null; color: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-16 w-16 flex-none"
      role="img"
      aria-label={percent === null ? "Health index not available" : `Health index ${percent} percent`}
    >
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="6"
        strokeDasharray={percent === null ? "3 5" : undefined}
        style={{ stroke: "hsl(var(--muted))" }}
      />
      {percent !== null && (
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(Math.max(0, Math.min(100, percent)) / 100) * c} ${c}`}
          transform="rotate(-90 32 32)"
          style={{ stroke: color }}
        />
      )}
      <text x="32" y="36.5" textAnchor="middle" fontSize={percent === null ? 16 : 15} fontWeight="700" fill="currentColor">
        {percent === null ? "—" : `${percent}%`}
      </text>
    </svg>
  );
}
