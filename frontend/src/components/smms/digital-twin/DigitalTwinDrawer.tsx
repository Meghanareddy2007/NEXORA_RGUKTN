"use client";

/**
 * SMMS Digital Twin — an operational view of ONE signalling asset.
 *
 * Opened from the existing Signalling Map panel and Asset Register; it does
 * not replace either. Everything shown comes from a single read-only call,
 * GET /api/smms/digital-twin/{twin_id}, which assembles the twin from the
 * data those features already use. Values the datasets do not hold arrive as
 * null and are drawn as "Not available" — never as a placeholder number.
 *
 * `twinId` is the Signalling Map's `map_id` ("REG:SIG_005" for a register
 * asset). Asset IDs alone are not unique across the datasets.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import axios from "axios";
import {
  AlertTriangle,
  Boxes,
  CircleAlert,
  ExternalLink,
  FileWarning,
  History,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { fetchDigitalTwin, type DigitalTwin, type DigitalTwinAlert, type ProblemReport } from "@/lib/smmsApi";
import { AssetGlyph } from "../signalling-map/glyphs";
import { RAW_TYPE_LABEL, STATUS_META, stationLabel } from "../signalling-map/model";
import { SEVERITY_STYLE } from "../badges";
import { TwinTimeline } from "./TwinTimeline";
import { TwinReportProblem } from "./TwinReportProblem";
import { EmptyNote, Field, HealthRing, NEUTRAL_PILL, NotAvailable, Panel, Pill, RecordCard } from "./parts";

type TabKey = "overview" | "maintenance" | "failures" | "problems" | "history";

type LoadState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; twin: DigitalTwin };

function loadErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return "Could not reach the server. Check your connection and try again.";
    if (err.response.status === 403) return "You don't have permission to view this Digital Twin.";
    if (err.response.status === 404) return "This asset could not be found in the current data.";
  }
  return "The Digital Twin could not be loaded. Please try again.";
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------
export function DigitalTwinDrawer({ twinId, onClose }: { twinId: string | null; onClose: () => void }) {
  if (!twinId || typeof document === "undefined") return null;
  // Portal to <body> so the panel sits above the Leaflet map and the
  // Asset Register's own inspector drawer, whatever their stacking contexts.
  return createPortal(<TwinPanel key={twinId} twinId={twinId} onClose={onClose} />, document.body);
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------
function TwinPanel({ twinId, onClose }: { twinId: string; onClose: () => void }) {
  const has = (_permission: string) => true;
  const [load, setLoad] = useState<LoadState>({ state: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");
  const [reporting, setReporting] = useState(false);
  const [lastReported, setLastReported] = useState<string | null>(null);

  const alive = useRef(true);
  const closeRef = useRef<HTMLButtonElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const fetchTwin = useCallback(
    (silent: boolean) => {
      if (silent) setRefreshing(true);
      else setLoad({ state: "loading" });
      return fetchDigitalTwin(twinId)
        .then((twin) => {
          if (!alive.current) return;
          setLoad({ state: "ready", twin });
          setRefreshError(false);
        })
        .catch((err) => {
          if (!alive.current) return;
          // A failed refresh keeps the data already on screen.
          if (silent) setRefreshError(true);
          else setLoad({ state: "error", message: loadErrorMessage(err) });
        })
        .finally(() => alive.current && setRefreshing(false));
    },
    [twinId]
  );

  useEffect(() => {
    alive.current = true;
    fetchTwin(false);
    return () => {
      alive.current = false;
    };
  }, [fetchTwin]);

  // Esc closes; the page behind does not scroll while the panel is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const go = (t: TabKey) => {
    setTab(t);
    requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const twin = load.state === "ready" ? load.twin : null;
  const meta = twin ? STATUS_META[twin.condition.status] : null;

  return (
    <div className="fixed inset-0 z-[1100] flex justify-end" role="dialog" aria-modal="true" aria-label="Asset Digital Twin">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className="relative flex h-full w-full flex-col border-l border-border bg-card shadow-2xl sm:max-w-xl lg:max-w-3xl">
        {/* ---------------- Header ---------------- */}
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          {twin ? (
            <AssetGlyph category={twin.identity.category} status={twin.condition.status} size={34} />
          ) : (
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-primary/15 text-primary">
              <Boxes className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Digital Twin</div>
            <h2 className="truncate text-base font-semibold leading-tight">
              {twin ? twin.identity.asset_id : twinId.replace(/^(REG|MNT):/, "").split(":")[0]}
            </h2>
            {twin && (
              <p className="truncate text-[11px] text-muted-foreground">
                {RAW_TYPE_LABEL[twin.identity.asset_type] ?? twin.identity.asset_type} · {twin.location.corridor_id} ·{" "}
                {twin.location.section_label.replace(/_/g, " ")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => fetchTwin(true)}
            disabled={refreshing || load.state !== "ready"}
            aria-label="Refresh digital twin"
            title={twin ? `Data generated ${twin.generated_at}` : "Refresh"}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close digital twin"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* ---------------- Body ---------------- */}
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          {load.state === "loading" && (
            <div className="flex flex-col gap-3 p-4" aria-busy="true">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading digital twin…
              </p>
              <div className="h-40 animate-pulse rounded-xl bg-muted/50" />
              <div className="h-20 animate-pulse rounded-xl bg-muted/40" />
              <div className="h-56 animate-pulse rounded-xl bg-muted/30" />
            </div>
          )}

          {load.state === "error" && (
            <div className="p-4">
              <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                <span className="flex items-center gap-2 font-medium">
                  <CircleAlert className="h-4 w-4" /> {load.message}
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => fetchTwin(false)} className="rounded border border-danger/40 px-2.5 py-1 text-xs hover:bg-danger/10">
                    Retry
                  </button>
                  <button type="button" onClick={onClose} className="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {twin && meta && (
            <div className="flex flex-col gap-4 p-4 pb-28">
              {refreshError && (
                <div role="alert" className="rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">
                  Could not refresh. Showing data generated {twin.generated_at}.
                </div>
              )}

              <Hero twin={twin} onGo={go} />
              <Alerts twin={twin} />

              {/* ---------------- Actions ---------------- */}
              <div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <ActionButton icon={Wrench} label="View Maintenance" onClick={() => go("maintenance")} />
                  <ActionButton icon={AlertTriangle} label="View Failure History" onClick={() => go("failures")} />
                  <ActionButton
                    icon={FileWarning}
                    label="Report Problem"
                    tone="danger"
                    disabled={!twin.actions.report_problem.available}
                    title={twin.actions.report_problem.reason ?? undefined}
                    onClick={() => {
                      setReporting(true);
                      go("problems");
                    }}
                  />
                  <ActionButton icon={History} label="View Full History" onClick={() => go("history")} />
                </div>
                {twin.actions.report_problem.reason && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">Report Problem: {twin.actions.report_problem.reason}</p>
                )}
              </div>

              {/* ---------------- Tabs ---------------- */}
              <div ref={tabsRef} className="sticky top-0 z-10 -mx-4 border-b border-border bg-card px-4">
                <div role="tablist" aria-label="Digital twin sections" className="scrollbar-thin flex gap-1 overflow-x-auto">
                  {(
                    [
                      ["overview", "Overview", null],
                      ["maintenance", "Maintenance", `${twin.maintenance.counts.open}/${twin.maintenance.counts.total}`],
                      ["failures", "Failures", `${twin.failures.counts.open}/${twin.failures.counts.total}`],
                      ["problems", "Problems", twin.problem_reports.available ? String(twin.problem_reports.items.length) : "—"],
                      ["history", "History", String(twin.timeline.length)],
                    ] as [TabKey, string, string | null][]
                  ).map(([key, label, count]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={tab === key}
                      onClick={() => setTab(key)}
                      className={`flex-none whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                        tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                      {count !== null && <span className="ml-1.5 text-[10px] text-muted-foreground">{count}</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div role="tabpanel" className="flex flex-col gap-4">
                {tab === "overview" && <Overview twin={twin} onGo={go} />}
                {tab === "maintenance" && <MaintenanceTab twin={twin} canOpenQueue={has("signalling.maintenance.view")} />}
                {tab === "failures" && <FailuresTab twin={twin} canOpenPage={has("signalling.failures.view")} />}
                {tab === "problems" && (
                  <ProblemsTab
                    twin={twin}
                    reporting={reporting}
                    lastReported={lastReported}
                    onStartReport={() => setReporting(true)}
                    onCancelReport={() => setReporting(false)}
                    onSubmitted={(r: ProblemReport) => {
                      setReporting(false);
                      setLastReported(r.report_id);
                      fetchTwin(true);
                    }}
                  />
                )}
                {tab === "history" && <HistoryTab twin={twin} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
function ActionButton({
  icon: Icon,
  label,
  onClick,
  tone,
  disabled,
  title,
}: {
  icon: typeof Wrench;
  label: string;
  onClick: () => void;
  tone?: "danger";
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-center text-[11px] font-semibold leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === "danger"
          ? "border-danger/40 bg-danger/10 text-danger hover:bg-danger/15"
          : "border-border bg-background/40 hover:border-primary/50 hover:bg-primary/5"
      }`}
    >
      <Icon className="h-3.5 w-3.5 flex-none" />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Hero — the asset's current condition, prominently
// ---------------------------------------------------------------------------
function Hero({ twin, onGo }: { twin: DigitalTwin; onGo: (t: TabKey) => void }) {
  const c = twin.condition;
  const meta = STATUS_META[c.status];
  const healthColor = STATUS_META[c.health.status].color;
  const s = twin.summary;

  const kpi = (label: string, value: number | null, tab: TabKey, hot: boolean) => (
    <button
      type="button"
      onClick={() => onGo(tab)}
      className="rounded-lg border border-border bg-background/50 px-2.5 py-2 text-left hover:border-primary/50"
    >
      <div className={`text-lg font-semibold leading-none ${hot && value ? "text-danger" : ""}`}>{value ?? "—"}</div>
      <div className="mt-1 text-[10px] leading-tight text-muted-foreground">{label}</div>
    </button>
  );

  return (
    <section
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: `${meta.color}66`, background: `linear-gradient(135deg, ${meta.color}1f, transparent 65%)` }}
      aria-label="Current condition"
    >
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold"
          style={{ borderColor: `${meta.color}77`, background: `${meta.color}26`, color: meta.color }}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
          {c.status_label}
        </span>
        {c.is_critical_asset && (
          <span className="rounded border border-slate-300/40 bg-slate-100/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-100">
            Critical asset
          </span>
        )}
      </div>
      <p className="px-4 pt-1.5 text-[11px] leading-snug text-muted-foreground">{c.status_basis}</p>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-3">
          <HealthRing percent={c.health.percent} color={healthColor} />
          <div className="min-w-0 text-xs">
            <div className="font-semibold">Health index</div>
            <div className="text-muted-foreground">{c.health.percent === null ? <NotAvailable reason={c.health.basis} /> : c.health.status_label}</div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-3 text-xs">
          <div className="font-semibold">Risk level</div>
          <div className="mt-1.5">
            {c.risk.level ? (
              <Pill label={c.risk.level} styleClass={SEVERITY_STYLE[c.risk.level] ?? NEUTRAL_PILL} />
            ) : (
              <NotAvailable reason={c.risk.basis} />
            )}
          </div>
          <div className="mt-1.5 text-muted-foreground">
            Failure risk {c.risk.failure_risk !== null ? `${Math.round(c.risk.failure_risk * 100)}%` : <NotAvailable />}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-3 text-xs">
          <div className="font-semibold">Criticality</div>
          <div className="mt-1.5 text-base font-semibold leading-none">
            {c.criticality_rating !== null ? `${c.criticality_rating} / 5` : <NotAvailable />}
          </div>
          <div className="mt-1.5 text-muted-foreground">
            Availability target {c.availability_target_pct !== null ? `${c.availability_target_pct}%` : <NotAvailable />}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 px-4 pb-3 sm:grid-cols-4">
        {kpi("Open failures", s.open_failures, "failures", true)}
        {kpi("Open maintenance", s.open_maintenance, "maintenance", false)}
        {kpi("Overdue tasks", s.overdue_maintenance, "maintenance", true)}
        {kpi("Open problem reports", s.open_problem_reports, "problems", true)}
      </div>

      <details className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
        <summary className="flex cursor-pointer items-center gap-1.5 hover:text-foreground">
          <Info className="h-3 w-3" /> How health and risk are worked out
        </summary>
        <ul className="mt-1.5 space-y-1 leading-snug">
          <li>
            <span className="text-foreground">Health:</span> {c.health.basis}
          </li>
          <li>
            <span className="text-foreground">Risk:</span> {c.risk.basis}
          </li>
        </ul>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
const ALERT_STYLE: Record<DigitalTwinAlert["level"], { box: string; icon: typeof CircleAlert; label: string }> = {
  critical: { box: "border-danger/30 bg-danger/10", icon: CircleAlert, label: "text-danger" },
  warning: { box: "border-warning/30 bg-warning/10", icon: AlertTriangle, label: "text-warning" },
  info: { box: "border-info/30 bg-info/10", icon: Info, label: "text-info" },
};

function Alerts({ twin }: { twin: DigitalTwin }) {
  const reportsMissing = !twin.problem_reports.available;
  return (
    <Panel
      title="Current alerts & issues"
      icon={<AlertTriangle className="h-3.5 w-3.5 text-warning" />}
      aside={<span className="text-[10px] text-muted-foreground">{twin.alerts.length} active</span>}
    >
      {twin.alerts.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-success">
          <ShieldCheck className="h-4 w-4" /> No active alerts or issues are recorded for this asset.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {twin.alerts.map((a, i) => {
            const st = ALERT_STYLE[a.level];
            const Icon = st.icon;
            return (
              <li key={`${a.source}-${a.ref ?? i}-${i}`} className={`flex gap-2.5 rounded-md border p-2.5 text-xs ${st.box}`}>
                <Icon className={`mt-0.5 h-3.5 w-3.5 flex-none ${st.label}`} />
                <div className="min-w-0">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-muted-foreground">{a.detail}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{a.source}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {reportsMissing && (
        <p className="mt-2 text-[11px] text-muted-foreground">Problem reports are not included: {twin.problem_reports.reason}</p>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
function SectionStrip({ twin }: { twin: DigitalTwin }) {
  const loc = twin.location;
  const color = STATUS_META[twin.condition.status].color;
  const frac =
    loc.position_exact && loc.section_length_km > 0 ? Math.max(0, Math.min(1, loc.location_km / loc.section_length_km)) : null;
  const from = loc.station_from.name ?? stationLabel(loc.station_from.id);
  const to = loc.station_to.name ?? stationLabel(loc.station_to.id);

  return (
    <div>
      <div className="relative mx-6 mb-1 mt-7 h-8">
        <div
          className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 ${frac === null ? "border-t-2 border-dashed border-border" : "h-[3px] rounded bg-border"}`}
        />
        <span className="absolute left-0 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted-foreground bg-card" />
        <span className="absolute right-0 top-1/2 h-3 w-3 translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted-foreground bg-card" />
        {frac !== null && (
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${frac * 100}%` }}>
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold" style={{ color }}>
              km {loc.location_km}
            </span>
            <span className="block h-4 w-4 rounded-full border-2 border-card" style={{ background: color, boxShadow: `0 0 0 3px ${color}55` }} />
          </div>
        )}
      </div>
      <div className="mx-1 flex justify-between gap-3 text-[10px] text-muted-foreground">
        <span className="min-w-0 truncate">{from}</span>
        <span className="flex-none">{loc.section_length_km} km</span>
        <span className="min-w-0 truncate text-right">{to}</span>
      </div>
      {frac === null && (
        <p className="mt-2 text-[11px] leading-snug text-warning">
          Recorded chainage km {loc.location_km} lies outside this {loc.section_length_km} km section, so the exact position on the line
          cannot be shown.
        </p>
      )}
    </div>
  );
}

function Overview({ twin, onGo }: { twin: DigitalTwin; onGo: (t: TabKey) => void }) {
  const { identity: id, location: loc, maintenance: m } = twin;
  const sameDivision = loc.station_from.division === loc.station_to.division;
  const stationText = (s: DigitalTwin["location"]["station_from"]) =>
    s.name ? `${s.name}${s.code ? ` (${s.code})` : ""}` : stationLabel(s.id);

  return (
    <>
      <Panel title="Location on the section" icon={<MapPin className="h-3.5 w-3.5 text-primary" />}>
        <SectionStrip twin={twin} />
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Asset">
          <dl>
            <Field label="Asset ID">{id.asset_id}</Field>
            <Field label="Equipment type">
              {RAW_TYPE_LABEL[id.asset_type] ?? id.asset_type}
              <span className="text-muted-foreground"> · {id.category}</span>
            </Field>
            <Field label="Data source">
              {id.source === "register" ? (
                "Signalling asset register"
              ) : (
                <>SMMS maintenance records{id.maintenance_record_ids.length ? ` (${id.maintenance_record_ids.join(", ")})` : ""}</>
              )}
            </Field>
            <Field label="Register status">{twin.condition.register_status ?? <NotAvailable reason="Not in the asset register" />}</Field>
          </dl>
        </Panel>

        <Panel title="Location">
          <dl>
            <Field label="Section">
              {loc.corridor_id} · {loc.section_label.replace(/_/g, " ")}
            </Field>
            <Field label="Between">
              {stationText(loc.station_from)} ↔ {stationText(loc.station_to)}
            </Field>
            <Field label="Chainage">
              km {loc.location_km}
              <span className="text-muted-foreground"> of {loc.section_length_km} km{loc.position_exact ? "" : " · outside section length"}</span>
            </Field>
            <Field label="Division">
              {loc.station_from.division ? (
                sameDivision ? loc.station_from.division : `${loc.station_from.division} / ${loc.station_to.division ?? "—"}`
              ) : (
                <NotAvailable />
              )}
            </Field>
            <Field label="Line">
              {loc.track_count !== null ? (
                <>
                  {loc.track_count} track{loc.track_count > 1 ? "s" : ""} · {loc.section_type} · electrified {loc.electrified}
                  <span className="text-muted-foreground"> · {loc.traffic_density} traffic</span>
                </>
              ) : (
                <NotAvailable />
              )}
            </Field>
            <Field label="Coordinates">
              {loc.latitude !== null && loc.longitude !== null ? (
                <span className="font-mono">
                  {loc.latitude}, {loc.longitude}
                </span>
              ) : (
                <NotAvailable reason="Exact position cannot be derived from the recorded chainage" />
              )}
            </Field>
          </dl>
        </Panel>
      </div>

      <Panel title="Maintenance schedule" icon={<Wrench className="h-3.5 w-3.5 text-info" />}>
        <ScheduleFields twin={twin} />
      </Panel>

      <Panel
        title="Lifecycle timeline"
        icon={<History className="h-3.5 w-3.5 text-primary" />}
        aside={
          <button type="button" onClick={() => onGo("history")} className="text-[11px] font-medium text-primary hover:underline">
            View Full History
          </button>
        }
      >
        <TwinTimeline events={twin.timeline} limit={5} />
      </Panel>

      {twin.notes.length > 0 && (
        <Panel title="Data notes" icon={<Info className="h-3.5 w-3.5 text-warning" />}>
          <ul className="space-y-2">
            {twin.notes.map((n, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-snug text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 flex-none text-warning" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <UnavailableList twin={twin} />
      {m.counts.total === 0 && twin.failures.counts.total === 0 && (
        <EmptyNote>No maintenance or failure records exist for this asset.</EmptyNote>
      )}
    </>
  );
}

function ScheduleFields({ twin }: { twin: DigitalTwin }) {
  const { last, next } = twin.maintenance;
  return (
    <dl>
      <Field label="Last maintenance">
        {last ? (
          <>
            {last.date}
            <span className="text-muted-foreground"> · {last.source}</span>
          </>
        ) : (
          <NotAvailable reason="No completion date is recorded for this asset" />
        )}
      </Field>
      <Field label="Next maintenance">
        {next ? (
          <>
            {next.date}
            {next.overdue_days ? <span className="text-danger"> · {next.overdue_days} day(s) overdue</span> : null}
            <span className="text-muted-foreground"> · {next.source}</span>
          </>
        ) : (
          <NotAvailable reason="No next-due date or open maintenance task is recorded" />
        )}
      </Field>
    </dl>
  );
}

function UnavailableList({ twin }: { twin: DigitalTwin }) {
  if (twin.unavailable.length === 0) return null;
  return (
    <details className="rounded-xl border border-border bg-background/40 px-3.5 py-2.5 text-xs">
      <summary className="cursor-pointer font-medium">Not available in the current data ({twin.unavailable.length})</summary>
      <ul className="mt-2 space-y-1.5">
        {twin.unavailable.map((u) => (
          <li key={u.key} className="leading-snug">
            <span className="font-medium">{u.label}</span>
            <span className="text-muted-foreground"> — {u.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Maintenance / Failures
// ---------------------------------------------------------------------------
function MaintenanceTab({ twin, canOpenQueue }: { twin: DigitalTwin; canOpenQueue: boolean }) {
  const [show, setShow] = useState<"open" | "all">("open");
  const m = twin.maintenance;
  const rows = show === "open" ? m.open : m.history;
  return (
    <>
      <Panel title="Maintenance schedule" icon={<Wrench className="h-3.5 w-3.5 text-info" />}>
        <ScheduleFields twin={twin} />
      </Panel>
      <Panel
        title="Maintenance records"
        aside={
          <span className="text-[10px] text-muted-foreground">
            {m.counts.open} open · {m.counts.completed} completed{m.counts.overdue ? ` · ${m.counts.overdue} overdue` : ""}
          </span>
        }
      >
        {m.counts.total === 0 ? (
          <EmptyNote>No maintenance records are linked to this asset.</EmptyNote>
        ) : (
          <>
            <div className="mb-3 flex gap-1.5" role="group" aria-label="Maintenance records shown">
              {(["open", "all"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={show === k}
                  onClick={() => setShow(k)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    show === k ? "border-primary/60 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {k === "open" ? `Open · ${m.counts.open}` : `All history · ${m.counts.total}`}
                </button>
              ))}
            </div>
            {rows.length === 0 ? (
              <EmptyNote>No open maintenance for this asset.</EmptyNote>
            ) : (
              <div className="flex flex-col gap-2">
                {rows.map((r) => (
                  <RecordCard key={r.task_id} r={r} />
                ))}
              </div>
            )}
          </>
        )}
        {canOpenQueue && (
          <Link href="/smms?view=maintenance" className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
            Open the Maintenance Queue <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </Panel>
    </>
  );
}

function FailuresTab({ twin, canOpenPage }: { twin: DigitalTwin; canOpenPage: boolean }) {
  const f = twin.failures;
  return (
    <Panel
      title="Failure history"
      icon={<AlertTriangle className="h-3.5 w-3.5 text-warning" />}
      aside={
        <span className="text-[10px] text-muted-foreground">
          {f.counts.open} open · {f.counts.completed} completed
        </span>
      }
    >
      {f.counts.total === 0 ? (
        <EmptyNote>
          No failure (corrective or emergency) records are held for this asset.
          {twin.condition.register_status === "Critical" && " The asset register lists it as Critical, but no failure record backs that up."}
        </EmptyNote>
      ) : (
        <div className="flex flex-col gap-2">
          {f.history.map((r) => (
            <RecordCard key={r.task_id} r={r} />
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
        Failures are Corrective and Emergency maintenance records; severity comes from their criticality and safety-risk scores.
      </p>
      {canOpenPage && (
        <Link href="/smms?view=failures" className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
          Open Signalling Failures <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------
function ProblemsTab({
  twin,
  reporting,
  lastReported,
  onStartReport,
  onCancelReport,
  onSubmitted,
}: {
  twin: DigitalTwin;
  reporting: boolean;
  lastReported: string | null;
  onStartReport: () => void;
  onCancelReport: () => void;
  onSubmitted: (r: ProblemReport) => void;
}) {
  const p = twin.problem_reports;
  const canReport = twin.actions.report_problem.available;
  return (
    <>
      {lastReported && (
        <div role="status" className="rounded-md border border-success/30 bg-success/10 p-2.5 text-xs text-success">
          Problem report {lastReported} was submitted.
        </div>
      )}

      {reporting && canReport && (
        <TwinReportProblem assetId={twin.identity.asset_id} onSubmitted={onSubmitted} onCancel={onCancelReport} />
      )}

      <Panel
        title="Problem reports"
        icon={<FileWarning className="h-3.5 w-3.5 text-danger" />}
        aside={
          canReport && !reporting ? (
            <button type="button" onClick={onStartReport} className="text-[11px] font-medium text-danger hover:underline">
              Report Problem
            </button>
          ) : undefined
        }
      >
        {!p.available ? (
          <EmptyNote>{p.reason}</EmptyNote>
        ) : p.items.length === 0 ? (
          <EmptyNote>{p.note ?? `No problem reports have been raised for ${twin.identity.asset_id}.`}</EmptyNote>
        ) : (
          <div className="flex flex-col gap-2">
            {p.items.map((r) => (
              <div key={r.report_id} className="rounded-md border border-border bg-muted/30 p-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{r.report_id}</span>
                  <span className="flex items-center gap-1">
                    <Pill label={r.status} styleClass={NEUTRAL_PILL} />
                    <Pill label={`${r.severity} severity`} styleClass={SEVERITY_STYLE[r.severity] ?? NEUTRAL_PILL} />
                  </span>
                </div>
                <div className="mt-1">{r.problem_type}</div>
                <div className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">{r.description}</div>
                <div className="mt-1 text-muted-foreground">
                  {r.reported_at.slice(0, 10)} · {r.reported_by} · action: {r.immediate_action}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
function HistoryTab({ twin }: { twin: DigitalTwin }) {
  const lifecycleGaps = twin.unavailable.filter((u) =>
    ["installation_date", "inspections", "status_history", "completion_dates"].includes(u.key)
  );
  return (
    <>
      <Panel title="Full lifecycle history" icon={<History className="h-3.5 w-3.5 text-primary" />}>
        <TwinTimeline events={twin.timeline} filterable />
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          Dates mean different things: <span className="text-foreground">Performed</span> is when work was done,{" "}
          <span className="text-foreground">Due</span> is a task&apos;s due date, <span className="text-foreground">Reported</span> is when a
          problem was raised.
        </p>
      </Panel>
      {lifecycleGaps.length > 0 && (
        <Panel title="Not recorded in the data" icon={<Info className="h-3.5 w-3.5 text-muted-foreground" />}>
          <ul className="space-y-1.5">
            {lifecycleGaps.map((u) => (
              <li key={u.key} className="text-xs leading-snug">
                <span className="font-medium">{u.label}</span>
                <span className="text-muted-foreground"> — {u.reason}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
