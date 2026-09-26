"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Boxes, FileWarning, Info, X } from "lucide-react";
import type {
  ProblemReport,
  SignallingMapAsset,
  SignallingMapData,
  SignallingMapMaintenanceRecord,
  SignallingMapSection,
} from "@/lib/smmsApi";
import { SEVERITY_STYLE, STATUS_STYLE } from "../badges";
import { AssetGlyph } from "./glyphs";
import {
  RAW_TYPE_LABEL,
  STATUS_META,
  STATUS_ORDER,
  comparePriority,
  rollupBySection,
  stationLabel,
} from "./model";

const NOT_RECORDED = "Not recorded";

function Pill({ label, styleClass }: { label: string; styleClass: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${styleClass}`}>{label}</span>
  );
}

function Block({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-t border-border px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 py-0.5 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

const dash = (v: string | number | null | undefined, suffix = "") =>
  v === null || v === undefined || v === "" ? <span className="text-muted-foreground">{NOT_RECORDED}</span> : <>{v}{suffix}</>;

function StatusPill({ asset }: { asset: SignallingMapAsset }) {
  const m = STATUS_META[asset.status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
      style={{ borderColor: `${m.color}66`, background: `${m.color}22`, color: m.color }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
      {asset.status_label}
    </span>
  );
}

// ---------------------------------------------------------------------------
export interface AssetPanelProps {
  data: SignallingMapData;
  /** assets currently passing the filters */
  visible: SignallingMapAsset[];
  selectedAsset: SignallingMapAsset | null;
  selectedSectionId: string | null;
  onSelectAsset: (mapId: string) => void;
  onSelectSection: (corridorId: string) => void;
  onCloseAsset: () => void;
  onCloseSection: () => void;
  /** null = not loaded / no permission to read reports */
  problemReports: ProblemReport[] | null;
  canReportProblem: boolean;
  /** When provided (the user may view Digital Twins), asset views offer an "Open Digital Twin" button. */
  onOpenTwin?: (mapId: string) => void;
}

export function SMMSInfoPanel(props: AssetPanelProps) {
  const { data, selectedAsset, selectedSectionId } = props;
  const section = selectedSectionId ? data.sections.find((s) => s.corridor_id === selectedSectionId) ?? null : null;

  return (
    <aside
      aria-label="SMMS information panel"
      className="flex h-[700px] flex-col overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {selectedAsset ? (
          <AssetView {...props} asset={selectedAsset} />
        ) : section ? (
          <SectionView {...props} section={section} />
        ) : (
          <OverviewView {...props} />
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Asset
// ---------------------------------------------------------------------------
function AssetView(props: AssetPanelProps & { asset: SignallingMapAsset }) {
  const { asset: a, data } = props;
  const [showDone, setShowDone] = useState(false);
  const section = data.sections.find((s) => s.corridor_id === a.corridor_id);
  const stations = useMemo(() => new Map(data.stations.map((s) => [s.id, s])), [data.stations]);
  const from = stations.get(a.station_from);
  const to = stations.get(a.station_to);

  const open = a.maintenance.filter((m) => m.status !== "Completed");
  const done = a.maintenance.filter((m) => m.status === "Completed");
  const failures = open.filter((m) => m.is_failure);
  const reports = props.problemReports?.filter((r) => r.asset_id === a.asset_id) ?? null;

  return (
    <>
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <AssetGlyph category={a.category} status={a.status} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold leading-tight">{a.asset_id}</h2>
            {a.is_critical_asset && (
              <span className="rounded border border-slate-300/40 bg-slate-100/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-100">
                Critical asset
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{a.category}</div>
        </div>
        <button
          type="button"
          onClick={props.onCloseAsset}
          aria-label="Close asset details"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 pb-3">
        <StatusPill asset={a} />
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{a.status_basis}</p>
      </div>

      {props.onOpenTwin && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => props.onOpenTwin?.(a.map_id)}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/15"
          >
            <Boxes className="h-3.5 w-3.5" /> Open Digital Twin
          </button>
        </div>
      )}

      <Block title="Identification">
        <dl>
          <Row label="Asset ID">{a.asset_id}</Row>
          <Row label="Asset type">
            {RAW_TYPE_LABEL[a.asset_type] ?? a.asset_type}
            <span className="text-muted-foreground"> · recorded as “{a.asset_type}”</span>
          </Row>
          <Row label="Data source">
            {a.source === "register" ? "Signalling asset register" : `SMMS maintenance record (${a.maintenance.map((m) => m.task_id).join(", ")})`}
          </Row>
        </dl>
      </Block>

      <Block title="Location">
        <dl>
          <Row label="Section">
            <button type="button" onClick={() => props.onSelectSection(a.corridor_id)} className="text-left text-primary hover:underline">
              {a.corridor_id} · {a.section_label.replace(/_/g, " ")}
            </button>
          </Row>
          <Row label="Between">
            {stationLabel(a.station_from)} {from ? <span className="text-muted-foreground">({from.code})</span> : null} ↔ {stationLabel(a.station_to)}{" "}
            {to ? <span className="text-muted-foreground">({to.code})</span> : null}
          </Row>
          <Row label="Chainage">
            {a.position.exact ? (
              <>
                km {a.location_km} <span className="text-muted-foreground">of {a.section_length_km} km section</span>
              </>
            ) : (
              <>
                km {a.location_km} recorded{" "}
                <span className="text-warning">· beyond the {a.section_length_km} km section, exact position unknown</span>
              </>
            )}
          </Row>
          {from && to && (
            <Row label="Division">{from.division === to.division ? from.division : `${from.division} / ${to.division}`}</Row>
          )}
          {section && (
            <Row label="Line">
              {section.track_count} track{section.track_count > 1 ? "s" : ""} · {section.section_type} · electrified {section.electrified}
              <span className="text-muted-foreground"> · {section.traffic_density} traffic</span>
            </Row>
          )}
        </dl>
      </Block>

      <Block title="Condition">
        <dl>
          <Row label="Register status">{dash(a.register_status)}</Row>
          <Row label="Criticality">
            {a.criticality_rating !== null ? `${a.criticality_rating} / 5` : dash(null)}
            <span className="text-muted-foreground">
              {a.criticality_rating !== null ? (a.criticality_source === "register" ? " · asset register" : " · maintenance record") : ""}
            </span>
          </Row>
          <Row label="Failure risk">{a.failure_risk !== null ? `${Math.round(a.failure_risk * 100)}%` : dash(null)}</Row>
          <Row label="Availability target">{dash(a.availability_target_pct, "%")}</Row>
        </dl>
      </Block>

      <Block
        title="Maintenance"
        aside={<span className="text-[10px] text-muted-foreground">{open.length} open · {done.length} completed</span>}
      >
        <dl className="mb-2">
          <Row label="Last maintenance">{dash(a.last_maintenance_date)}</Row>
          <Row label="Next due">{dash(a.next_due_date)}</Row>
        </dl>
        {open.length === 0 && <p className="text-xs text-muted-foreground">No open maintenance is linked to this asset.</p>}
        <div className="space-y-2">
          {open.map((m) => (
            <MaintenanceCard key={m.task_id} m={m} />
          ))}
        </div>
        {done.length > 0 && (
          <div className="mt-2">
            <button type="button" onClick={() => setShowDone((v) => !v)} className="text-[11px] text-primary hover:underline">
              {showDone ? "Hide" : "Show"} {done.length} completed record{done.length > 1 ? "s" : ""}
            </button>
            {showDone && (
              <div className="mt-2 space-y-2">
                {done.map((m) => (
                  <MaintenanceCard key={m.task_id} m={m} />
                ))}
              </div>
            )}
          </div>
        )}
      </Block>

      <Block
        title="Failure"
        aside={
          failures.length > 0 ? (
            <span className="text-[10px] text-muted-foreground">{failures.length} open</span>
          ) : undefined
        }
      >
        {failures.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {a.register_status === "Critical"
              ? "The asset register lists this asset as Critical, but the maintenance dataset holds no open failure record for it."
              : "No open failure is recorded for this asset."}
          </p>
        ) : (
          <div className="space-y-2">
            {failures.map((m) => (
              <div key={m.task_id} className="rounded-md border border-border bg-muted/30 p-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{m.task_id}</span>
                  {m.severity && <Pill label={`${m.severity} severity`} styleClass={SEVERITY_STYLE[m.severity]} />}
                </div>
                <div className="mt-1">{m.defect_type}</div>
                <div className="mt-0.5 text-muted-foreground">
                  {m.maintenance_type} · {m.status} · due {m.due_date}
                  {m.overdue_days > 0 ? <span className="text-danger"> · {m.overdue_days} day(s) overdue</span> : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </Block>

      {reports !== null && (
        <Block title="Reported problems">
          {reports.length === 0 ? (
            <p className="text-xs text-muted-foreground">No problem reports have been raised for {a.asset_id}.</p>
          ) : (
            <div className="space-y-2">
              {reports.slice(0, 5).map((r) => (
                <div key={r.report_id} className="rounded-md border border-border bg-muted/30 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.report_id}</span>
                    <Pill label={`${r.severity} severity`} styleClass={SEVERITY_STYLE[r.severity] ?? ""} />
                  </div>
                  <div className="mt-1">{r.problem_type}</div>
                  <div className="mt-0.5 text-muted-foreground">
                    {r.status} · {r.reported_at.slice(0, 10)} · {r.reported_by}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Block>
      )}

      {a.notes.length > 0 && (
        <Block title="Data notes">
          <ul className="space-y-2">
            {a.notes.map((n, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-snug text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 flex-none text-warning" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {props.canReportProblem && (
        <div className="border-t border-border px-4 py-3">
          <Link
            href="/smms?view=report-problem"
            className="flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:border-primary/60 hover:text-foreground"
          >
            <FileWarning className="h-3.5 w-3.5" /> Report a problem
          </Link>
        </div>
      )}
    </>
  );
}

function MaintenanceCard({ m }: { m: SignallingMapMaintenanceRecord }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{m.task_id}</span>
        <span className="flex items-center gap-1">
          <Pill label={m.status} styleClass={STATUS_STYLE[m.status] ?? "bg-muted text-muted-foreground border-border"} />
          <Pill label={`${m.priority} priority`} styleClass={SEVERITY_STYLE[m.priority]} />
        </span>
      </div>
      <div className="mt-1">
        {m.maintenance_type} · {m.defect_type}
      </div>
      <div className="mt-0.5 text-muted-foreground">
        Due {m.due_date}
        {m.overdue_days > 0 ? <span className="text-danger"> · {m.overdue_days} day(s) overdue</span> : ""} · {m.estimated_duration_min} min · crew {m.crew_required}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------
function AssetRow({ a, onSelect }: { a: SignallingMapAsset; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(a.map_id)}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <AssetGlyph category={a.category} status={a.status} size={22} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          {a.asset_id}
          {a.is_critical_asset && <span className="inline-block h-1.5 w-1.5 rotate-45 bg-slate-100" title="Critical asset" />}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {a.category} · {a.position.exact ? `km ${a.location_km}` : "section-level"} · {a.corridor_id}
        </span>
      </span>
      <span className="flex-none text-right text-[10px] leading-tight">
        <span className="block font-medium" style={{ color: STATUS_META[a.status].color }}>
          {STATUS_META[a.status].short}
        </span>
        {a.failure_severity && <span className="block text-muted-foreground">{a.failure_severity} failure</span>}
      </span>
    </button>
  );
}

function SectionView(props: AssetPanelProps & { section: SignallingMapSection }) {
  const { section: s, data, visible } = props;
  const [limit, setLimit] = useState(40);
  const stations = new Map(data.stations.map((x) => [x.id, x]));
  const from = stations.get(s.station_from);
  const to = stations.get(s.station_to);
  const inSection = useMemo(() => visible.filter((a) => a.corridor_id === s.corridor_id).sort(comparePriority), [visible, s.corridor_id]);
  const roll = rollupBySection(inSection).get(s.corridor_id);
  const totalInSection = data.assets.filter((a) => a.corridor_id === s.corridor_id).length;

  return (
    <>
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Railway section</div>
          <h2 className="text-base font-semibold leading-tight">{s.corridor_id}</h2>
          <div className="text-xs">{s.label.replace(/_/g, " ")}</div>
        </div>
        <button
          type="button"
          onClick={props.onCloseSection}
          aria-label="Close section details"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Block title="Section">
        <dl>
          <Row label="Length">{s.distance_km} km</Row>
          <Row label="Tracks">
            {s.track_count} · {s.section_type}
          </Row>
          <Row label="Electrified">{s.electrified}</Row>
          <Row label="Traffic density">{s.traffic_density}</Row>
          <Row label="Stations">
            {from ? `${from.name} (${from.code})` : stationLabel(s.station_from)} ↔ {to ? `${to.name} (${to.code})` : stationLabel(s.station_to)}
          </Row>
        </dl>
      </Block>

      <Block
        title="Assets in this view"
        aside={
          <span className="text-[10px] text-muted-foreground">
            {inSection.length} of {totalInSection}
          </span>
        }
      >
        {roll && (
          <div className="mb-3">
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              {STATUS_ORDER.map((st) =>
                roll.byStatus[st] ? <span key={st} style={{ flex: roll.byStatus[st], background: STATUS_META[st].color }} /> : null
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {STATUS_ORDER.filter((st) => roll.byStatus[st] > 0).map((st) => (
                <span key={st} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: STATUS_META[st].color }} />
                  {roll.byStatus[st]} {STATUS_META[st].label}
                </span>
              ))}
            </div>
            {roll.sectionLevel.length > 0 && (
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                {roll.sectionLevel.length} of these have a recorded km outside this {s.distance_km} km section, so they are
                listed at section level rather than at a point on the line.
              </p>
            )}
          </div>
        )}
        {inSection.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {totalInSection === 0 ? "No assets are recorded for this section." : "No assets in this section match the current filters."}
          </p>
        ) : (
          <div className="-mx-2">
            {inSection.slice(0, limit).map((a) => (
              <AssetRow key={a.map_id} a={a} onSelect={props.onSelectAsset} />
            ))}
            {inSection.length > limit && (
              <button type="button" onClick={() => setLimit((l) => l + 40)} className="mx-2 mt-1 text-[11px] text-primary hover:underline">
                Show more ({inSection.length - limit} remaining)
              </button>
            )}
          </div>
        )}
      </Block>
    </>
  );
}

// ---------------------------------------------------------------------------
// Nothing selected
// ---------------------------------------------------------------------------
function OverviewView(props: AssetPanelProps) {
  const top = useMemo(
    () => props.visible.filter((a) => a.status === "failure" || a.status === "maintenance").sort(comparePriority).slice(0, 8),
    [props.visible]
  );
  return (
    <>
      <div className="px-4 pb-3 pt-4">
        <h2 className="text-sm font-semibold">SMMS information panel</h2>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          Select an asset on the map to see its identity, location, status, maintenance and failure records. Select a
          section marker or track line to see everything in that section.
        </p>
      </div>
      <Block
        title="Needs attention first"
        aside={<span className="text-[10px] text-muted-foreground">failures and work in progress</span>}
      >
        {top.length === 0 ? (
          <p className="text-xs text-muted-foreground">No failures or work in progress in the current view.</p>
        ) : (
          <div className="-mx-2">
            {top.map((a) => (
              <AssetRow key={a.map_id} a={a} onSelect={props.onSelectAsset} />
            ))}
          </div>
        )}
        {top.length > 0 && (
          <p className="mt-2 flex gap-1.5 text-[11px] text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3 w-3 flex-none" /> Ordered by status, then failure severity, then criticality.
          </p>
        )}
      </Block>
    </>
  );
}

