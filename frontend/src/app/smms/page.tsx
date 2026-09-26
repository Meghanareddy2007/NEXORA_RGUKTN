"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AnalyticsPage from "@/app/analytics/page";
import SMMSMapView from "@/components/smms/SMMSMapView";
import { DigitalTwinDrawer } from "@/components/smms/digital-twin/DigitalTwinDrawer";
import {
  Activity, AlertOctagon, AlertTriangle, BarChart3, CalendarClock, CheckCircle2,
  ChevronDown, CircleAlert, ClipboardList, Download, Eye, FileBarChart2, FileDown,
  FileSpreadsheet, FileText, Filter, HeartPulse, History, LayoutDashboard, Loader2,
  Map as MapIcon, MapPin, RefreshCw, Search, Send, ShieldCheck, Signal, Siren,
  SlidersHorizontal, Target, Wrench, X, Zap
} from "lucide-react";

type ViewId =
  | "dashboard" | "assets" | "failures" | "map" | "maintenance" | "report-problem"
  | "insights" | "reports" | "conflicts" | "analytics" | "audit";

type Severity = "Low" | "Medium" | "High" | "Critical";
type Status = "Pending" | "Scheduled" | "In Progress" | "Completed";

interface Asset {
  asset_id: string; asset_type: string; corridor_id: string; corridor_label?: string;
  location_km?: number; asset_criticality?: number; availability_target_pct?: number;
  current_status: string; failure_risk?: number; last_maintenance_date?: string;
  next_due_date?: string; maintenance_status?: string; open_problem_count?: number;
}
interface Failure {
  failure_id: string; asset_id: string; asset_type: string; corridor_id: string;
  affected_section?: string; defect_type: string; maintenance_type: string;
  severity: Severity; due_date: string; overdue_days: number;
  estimated_duration_min: number; crew_required: number; status: Status;
}
interface MaintenanceTask {
  maintenance_id: string; asset_id: string; asset_type: string; corridor_id: string;
  location?: string; maintenance_type: string; defect_type: string; priority: Severity;
  due_date: string; overdue_days: number; estimated_duration_min: number;
  crew_required: number; status: Status;
}
interface MaintenanceQueue {
  pending: MaintenanceTask[]; scheduled: MaintenanceTask[];
  in_progress: MaintenanceTask[]; completed: MaintenanceTask[]; overdue: MaintenanceTask[];
}
interface ProblemReport {
  report_id: string; reported_at: string; reported_by: string; asset_id: string;
  problem_type: string; severity: Severity; description: string;
  immediate_action: string; status: string;
}
interface CorridorHealth {
  corridor_id: string; corridor_label: string; asset_count: number;
  avg_failure_risk: number; critical_assets: number; open_failures: number; health_score: number;
}
interface WatchlistAsset {
  asset_id: string; asset_type: string; corridor_label: string; current_status: string;
  failure_risk: number; next_due_date: string;
}
interface RepeatedFailure {
  asset_id: string; asset_type: string; corridor_label: string;
  open_failure_count: number; failure_ids: string[]; defect_types: string[];
}
interface TimelineEntry {
  maintenance_id: string; asset_id: string; corridor_label: string; due_date: string;
  overdue_days: number; priority: Severity; status: Status;
}
interface Conflict {
  maintenance_id: string; asset_id: string; corridor_id: string; corridor_label: string;
  conflict_date: string; block_id: string; block_window: string; block_status: string;
}
interface MapStation {
  id: string; code: string; name: string; latitude: number; longitude: number;
  x: number; y: number; is_junction: boolean; platforms: number; division: string;
}
interface MapSection {
  corridor_id: string; station_from: string; station_to: string; distance_km: number; track_count: number;
}
interface MapPosition {
  exact: boolean; latitude: number; longitude: number; x: number; y: number;
  station_from?: string; station_to?: string;
}
interface MapAsset extends Asset {
  map_id: string; source: string; category: string; status: string; status_label: string;
  position: MapPosition; is_critical_asset: boolean; is_failure: boolean;
  failure_severity?: Severity | null; has_open_maintenance: boolean;
  maintenance: Record<string, unknown>[]; notes: string[];
}
interface MapData {
  generated_at: string; sections: MapSection[]; stations: MapStation[];
  assets: MapAsset[]; coverage: Record<string, unknown>;
}
interface DashboardData {
  kpis?: Record<string, number>; [key: string]: unknown;
}
interface TwinData {
  [key: string]: any;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

function token() {
  if (typeof window === "undefined") return "";
  try { return JSON.parse(localStorage.getItem("nexora_auth") || "{}").access_token || ""; }
  catch { return ""; }
}
async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const t = token();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const body = await res.json(); msg = body?.detail?.message || body?.detail || msg; } catch {}
    throw new Error(typeof msg === "string" ? msg : "Request failed");
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
const severityClass = (s: string) =>
  s === "Critical" ? "border-danger/30 bg-danger/10 text-danger" :
  s === "High" ? "border-warning/30 bg-warning/10 text-warning" :
  s === "Medium" ? "border-info/30 bg-info/10 text-info" :
  "border-success/30 bg-success/10 text-success";
const statusClass = (s: string) =>
  s === "Completed" ? "border-success/30 bg-success/10 text-success" :
  s === "In Progress" ? "border-violet-500/30 bg-violet-500/10 text-violet-300" :
  s === "Scheduled" ? "border-info/30 bg-info/10 text-info" :
  "border-warning/30 bg-warning/10 text-warning";
function Badge({ label }: { label: string }) {
  return <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${severityClass(label)}`}>{label}</span>;
}
function StatusBadge({ label }: { label: string }) {
  return <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${statusClass(label)}`}>{label}</span>;
}
function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-border bg-card/50 ${className}`}>{children}</section>;
}
function SectionTitle({ icon: Icon, title, subtitle, action }: { icon: any; title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
    <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><div><h2 className="text-sm font-semibold">{title}</h2>{subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}</div></div>
    {action}
  </div>;
}
function Empty({ text = "No records found." }: { text?: string }) {
  return <div className="p-5 text-xs text-muted-foreground">{text}</div>;
}
function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">{message}</div>;
}
function Loading() {
  return <div className="flex items-center gap-2 p-5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>;
}

function PageHeader({ title, subtitle, onRefresh, refreshing }: { title: string; subtitle: string; onRefresh?: () => void; refreshing?: boolean }) {
  return <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
    <div><h1 className="text-base font-semibold">{title}</h1><p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p></div>
    {onRefresh && <button onClick={onRefresh} className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh</button>}
  </div>;
}

function Kpi({ label, value, icon: Icon, note }: { label: string; value: ReactNode; icon: any; note?: string }) {
  return <Card className="p-3.5"><div className="flex items-center justify-between"><span className="text-[11px] text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary" /></div><div className="mt-2 text-2xl font-semibold">{value}</div>{note && <div className="mt-1 text-[10px] text-muted-foreground">{note}</div>}</Card>;
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */
function DashboardView() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [queue, setQueue] = useState<MaintenanceQueue | null>(null);
  const [health, setHealth] = useState<CorridorHealth[]>([]);
  const [problems, setProblems] = useState<ProblemReport[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const [d, f, q, h, p, a] = await Promise.all([
    apiFetch<DashboardData>("/api/smms/dashboard"),
    apiFetch<Failure[]>("/api/smms/failures"),
    apiFetch<MaintenanceQueue>("/api/smms/maintenance"),
    apiFetch<CorridorHealth[]>("/api/smms/corridor-health"),
    apiFetch<ProblemReport[]>("/api/smms/problem-reports?limit=8"),
    apiFetch<Asset[]>("/api/smms/assets"),
]);

    setData(d);
    setFailures(f);
    setQueue(q);
    setHealth(h);
    setProblems(p);
    setAssets(a);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load SMMS dashboard."); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const k = data?.kpis || {};
  const pending = queue ? queue.pending.length + queue.scheduled.length + queue.in_progress.length : 0;
  const critical = failures.filter(f => f.severity === "Critical").length;

  const assetsMonitored =
  k.assets_monitored ?? 0;

  const assetsHealthy =
  k.assets_healthy_pct ?? 0;
  return <div>
    <PageHeader title="SMMS Command Center" subtitle="Signalling Maintenance Management System — live operational view" onRefresh={load} />
    {error && <div className="p-4"><ErrorBox message={error} /></div>}
    <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Assets monitored" value={assets.length} icon={Signal} />
<Kpi
  label="Assets healthy"
  value={
    assets.length
      ? `${Math.round(
          (assets.filter(a => a.current_status === "Normal").length / assets.length) * 100
        )}%`
      : "0%"
  }
  icon={HeartPulse}
/>
      <Kpi label="Open failures" value={failures.length} icon={Siren} note={`${critical} critical`} />
      <Kpi label="Open maintenance" value={pending} icon={Wrench} />
    </div>
    <div className="grid gap-4 px-4 pb-5 xl:grid-cols-2">
      <Card><SectionTitle icon={AlertTriangle} title="Signalling Failures" action={<span className="text-[10px] text-muted-foreground">{failures.length} open</span>} />
        {failures.length ? <div className="divide-y divide-border/60">{failures.slice(0,7).map(f => <div key={f.failure_id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs"><div><div className="font-medium">{f.asset_id} · {f.defect_type}</div><div className="mt-0.5 text-muted-foreground">{f.affected_section || f.corridor_id} · due {f.due_date}</div></div><Badge label={f.severity} /></div>)}</div> : <Empty text="No open signalling failures." />}
      </Card>
      <Card><SectionTitle icon={ClipboardList} title="Maintenance Queue" action={<span className="text-[10px] text-muted-foreground">{pending} active</span>} />
        {queue?.overdue?.length ? <div className="divide-y divide-border/60">{queue.overdue.slice(0,7).map(t => <div key={t.maintenance_id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs"><div><div className="font-medium">{t.maintenance_id} · {t.asset_id}</div><div className="mt-0.5 text-muted-foreground">{t.overdue_days} day(s) overdue · {t.corridor_id}</div></div><Badge label={t.priority} /></div>)}</div> : <Empty text="No overdue maintenance tasks." />}
      </Card>
      <Card><SectionTitle icon={HeartPulse} title="Corridor Health" subtitle="Health score derived from signalling assets and open failures" />
        <div className="divide-y divide-border/60">{health.slice(0,8).map(h => <div key={h.corridor_id} className="px-4 py-3"><div className="flex justify-between text-xs"><span>{h.corridor_label}</span><span className={h.health_score < 50 ? "text-danger" : h.health_score < 75 ? "text-warning" : "text-success"}>{h.health_score}</span></div><div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{width:`${Math.max(0,Math.min(100,h.health_score))}%`}} /></div><div className="mt-1 text-[10px] text-muted-foreground">{h.asset_count} assets · {h.open_failures} open failures · {h.critical_assets} critical</div></div>)}</div>
      </Card>
      <Card><SectionTitle icon={FileText} title="Recent Problem Reports" />
        {problems.length ? <div className="divide-y divide-border/60">{problems.map(p => <div key={p.report_id} className="px-4 py-3 text-xs"><div className="flex justify-between gap-2"><span className="font-medium">{p.report_id} · {p.asset_id}</span><Badge label={p.severity} /></div><div className="mt-1 text-muted-foreground">{p.problem_type} · {p.status} · {p.reported_at}</div></div>)}</div> : <Empty text="No problem reports submitted yet." />}
      </Card>
    </div>
  </div>;
}

/* -------------------------------------------------------------------------- */
/* Assets                                                                     */
/* -------------------------------------------------------------------------- */
function AssetsView({ onTwin, onReport }: { onTwin: (id: string) => void; onReport: (id?: string) => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [q, setQ] = useState(""); const [status, setStatus] = useState("ALL"); const [type, setType] = useState("ALL");
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { apiFetch<Asset[]>("/api/smms/assets").then(setAssets).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const types = [...new Set(assets.map(a => a.asset_type))].sort();
  const filtered = assets.filter(a => {
    const s = `${a.asset_id} ${a.asset_type} ${a.corridor_id} ${a.corridor_label || ""}`.toLowerCase();
    return (!q || s.includes(q.toLowerCase())) && (status==="ALL" || a.current_status===status) && (type==="ALL" || a.asset_type===type);
  });
  return <div><PageHeader title="Signalling Assets" subtitle="Register of signalling assets, health, risk and maintenance context" />
    <div className="p-4"><Card><div className="flex flex-wrap gap-2 border-b border-border p-3">
      <div className="relative"><Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search assets…" className="rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-xs"/></div>
      <select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"><option value="ALL">All statuses</option><option>Normal</option><option>Degraded</option><option>Critical</option></select>
      <select value={type} onChange={e=>setType(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"><option value="ALL">All types</option>{types.map(t=><option key={t}>{t}</option>)}</select>
    </div>{error && <div className="p-3"><ErrorBox message={error}/></div>}{loading?<Loading/>:filtered.length===0?<Empty/>:
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="px-3 py-2">Asset</th><th>Type</th><th>Section</th><th>Status</th><th>Risk</th><th>Next due</th><th className="px-3">Actions</th></tr></thead><tbody>{filtered.map(a=><tr key={`${a.asset_id}-${a.corridor_id}`} className="border-b border-border/50 hover:bg-muted/30"><td className="px-3 py-2 font-medium">{a.asset_id}</td><td>{a.asset_type}</td><td>{a.corridor_label||a.corridor_id}</td><td><StatusBadge label={a.current_status}/></td><td>{a.failure_risk!=null?`${Math.round(a.failure_risk*100)}%`:"—"}</td><td>{a.next_due_date||"—"}</td><td className="px-3"><div className="flex gap-1"><button onClick={()=>onTwin(`REG:${a.asset_id}`)} className="rounded border border-border px-2 py-1 text-[10px] hover:bg-muted">Twin</button><button onClick={()=>onReport(a.asset_id)} className="rounded border border-danger/30 px-2 py-1 text-[10px] text-danger hover:bg-danger/10">Report</button></div></td></tr>)}</tbody></table></div>}
    </Card></div></div>;
}

/* -------------------------------------------------------------------------- */
/* Failures                                                                   */
/* -------------------------------------------------------------------------- */
function FailuresView() {
  const [rows,setRows]=useState<Failure[]>([]); const [sev,setSev]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState("");
  const load=useCallback(()=>apiFetch<Failure[]>(`/api/smms/failures${sev?`?severity=${encodeURIComponent(sev)}`:""}`).then(setRows).catch(e=>setError(e.message)),[sev]);
  useEffect(()=>{load();},[load]);
  const next=(s:string)=>s==="Pending"?"Scheduled":s==="Scheduled"?"In Progress":s==="In Progress"?"Completed":"";
  const advance=async(f:Failure)=>{const n=next(f.status);if(!n)return;setBusy(f.failure_id);try{await apiFetch(`/api/smms/failures/${encodeURIComponent(f.failure_id)}/status`,{method:"POST",body:JSON.stringify({status:n})});await load();}catch(e){setError(e instanceof Error?e.message:"Update failed");}finally{setBusy("");}};
  return <div><PageHeader title="Signalling Failures" subtitle="Open signalling failure records and lifecycle status" onRefresh={load}/><div className="p-4"><Card><div className="flex gap-2 border-b border-border p-3"><select value={sev} onChange={e=>setSev(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"><option value="">All severities</option>{(["Critical","High","Medium","Low"] as const).map(x=><option key={x}>{x}</option>)}</select></div>{error&&<div className="p-3"><ErrorBox message={error}/></div>}{!rows.length?<Empty text="No signalling failures match the current filter."/>:<div className="divide-y divide-border/60">{rows.map(f=><div key={f.failure_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"><div className="min-w-[260px]"><div className="font-medium">{f.failure_id} · {f.asset_id} · {f.defect_type}</div><div className="mt-1 text-muted-foreground">{f.affected_section||f.corridor_id} · due {f.due_date} · {f.estimated_duration_min} min · crew {f.crew_required}</div></div><div className="flex items-center gap-2"><Badge label={f.severity}/><StatusBadge label={f.status}/>{next(f.status)&&<button disabled={!!busy} onClick={()=>advance(f)} className="rounded-md bg-primary px-2.5 py-1.5 text-[10px] text-primary-foreground disabled:opacity-50">{busy===f.failure_id?<Loader2 className="h-3 w-3 animate-spin"/>:next(f.status)}</button>}</div></div>)}</div>}</Card></div></div>;
}

/* -------------------------------------------------------------------------- */
/* Maintenance queue                                                          */
/* -------------------------------------------------------------------------- */
function MaintenanceView() {
  const [queue,setQueue]=useState<MaintenanceQueue|null>(null); const [error,setError]=useState(""); const [busy,setBusy]=useState("");
  const load=useCallback(()=>apiFetch<MaintenanceQueue>("/api/smms/maintenance").then(setQueue).catch(e=>setError(e.message)),[]);
  useEffect(()=>{load();},[load]);
  const advance=async(t:MaintenanceTask)=>{const n=t.status==="Pending"?"Scheduled":t.status==="Scheduled"?"In Progress":"";if(!n)return;setBusy(t.maintenance_id);try{await apiFetch(`/api/smms/maintenance/${encodeURIComponent(t.maintenance_id)}/status`,{method:"POST",body:JSON.stringify({status:n})});await load();}catch(e){setError(e instanceof Error?e.message:"Update failed");}finally{setBusy("");}};
  const complete=async(t:MaintenanceTask)=>{setBusy(t.maintenance_id);try{await apiFetch(`/api/smms/maintenance/${encodeURIComponent(t.maintenance_id)}/complete`,{method:"POST"});await load();}catch(e){setError(e instanceof Error?e.message:"Update failed");}finally{setBusy("");}};
  const cols:[keyof MaintenanceQueue,string][]=[["pending","Pending"],["scheduled","Scheduled"],["in_progress","In Progress"],["completed","Completed"]];
  return <div><PageHeader title="Maintenance Queue" subtitle="Signalling maintenance work by lifecycle state" onRefresh={load}/><div className="grid gap-3 p-4 xl:grid-cols-4">{cols.map(([key,label])=><Card key={key}><div className="flex items-center justify-between border-b border-border px-3 py-2.5"><span className="text-xs font-semibold">{label}</span><span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{queue?.[key].length??0}</span></div><div className="flex min-h-[120px] flex-col gap-2 p-2">{queue?.[key].map(t=><div key={t.maintenance_id} className="rounded-lg border border-border bg-background p-2.5 text-[11px]"><div className="flex justify-between gap-2"><b>{t.maintenance_id}</b><Badge label={t.priority}/></div><div className="mt-1">{t.asset_id} · {t.defect_type}</div><div className="mt-0.5 text-muted-foreground">{t.corridor_id} · {t.due_date}</div><div className="mt-1 text-muted-foreground">{t.estimated_duration_min} min · crew {t.crew_required}</div>{t.overdue_days>0&&<div className="mt-1 text-danger">{t.overdue_days} day(s) overdue</div>}<div className="mt-2 flex gap-1">{t.status!=="Completed"&&t.status!=="In Progress"&&<button disabled={!!busy} onClick={()=>advance(t)} className="rounded border border-border px-2 py-1 text-[10px] hover:bg-muted">Advance</button>}{t.status==="In Progress"&&<button disabled={!!busy} onClick={()=>complete(t)} className="rounded bg-success/15 px-2 py-1 text-[10px] text-success">Complete</button>}</div></div>)}</div></Card>)}</div>{error&&<div className="px-4"><ErrorBox message={error}/></div>}</div>;
}

/* -------------------------------------------------------------------------- */
/* Report Problem                                                             */
/* -------------------------------------------------------------------------- */
function ReportProblemView({ initialAsset, onDone }: { initialAsset?: string; onDone?: () => void }) {
  const [assets,setAssets]=useState<Asset[]>([]); const [options,setOptions]=useState<any>(null);
  const [asset,setAsset]=useState(initialAsset||""); const [problem,setProblem]=useState(""); const [severity,setSeverity]=useState("");
  const [action,setAction]=useState(""); const [description,setDescription]=useState(""); const [error,setError]=useState(""); const [ok,setOk]=useState("");
  useEffect(()=>{Promise.all([apiFetch<Asset[]>("/api/smms/assets"),apiFetch<any>("/api/smms/problem-reports/options")]).then(([a,o])=>{setAssets(a);setOptions(o);setProblem(o.problem_types?.[0]||"");setSeverity(o.severities?.[0]||"");setAction(o.immediate_actions?.[0]||"");}).catch(e=>setError(e.message));},[]);
  useEffect(()=>{if(initialAsset)setAsset(initialAsset)},[initialAsset]);
  const submit=async(e:FormEvent)=>{e.preventDefault();setError("");setOk("");const min=options?.description_min_length||10,max=options?.description_max_length||1000;if(!asset||!problem||!severity||!action||description.trim().length<min||description.trim().length>max){setError(`Please complete all fields. Description must be ${min}-${max} characters.`);return;}try{await apiFetch<ProblemReport>("/api/smms/problem-reports",{method:"POST",body:JSON.stringify({asset_id:asset,problem_type:problem,severity,immediate_action:action,description:description.trim()})});setOk("Problem report submitted successfully.");setDescription("");onDone?.();}catch(e){setError(e instanceof Error?e.message:"Could not submit problem report.");}};
  return <div><PageHeader title="Report Problem" subtitle="Raise a signalling problem using the server-validated SMMS workflow"/><div className="max-w-3xl p-4"><Card><SectionTitle icon={Siren} title="New Signalling Problem"/><form onSubmit={submit} className="grid gap-4 p-4 sm:grid-cols-2">
    <label className="text-xs">Asset<select value={asset} onChange={e=>setAsset(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs"><option value="">Select asset…</option>{assets.map(a=><option key={`${a.asset_id}-${a.corridor_id}`} value={a.asset_id}>{a.asset_id} · {a.asset_type} · {a.corridor_id}</option>)}</select></label>
    <label className="text-xs">Problem type<select value={problem} onChange={e=>setProblem(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs">{options?.problem_types?.map((x:string)=><option key={x}>{x}</option>)}</select></label>
    <label className="text-xs">Severity<select value={severity} onChange={e=>setSeverity(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs">{options?.severities?.map((x:string)=><option key={x}>{x}</option>)}</select></label>
    <label className="text-xs">Immediate action<select value={action} onChange={e=>setAction(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs">{options?.immediate_actions?.map((x:string)=><option key={x}>{x}</option>)}</select></label>
    <label className="text-xs sm:col-span-2">Description<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={6} placeholder="Describe the signalling problem…" className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs"/></label>
    {error&&<div className="sm:col-span-2"><ErrorBox message={error}/></div>}{ok&&<div className="sm:col-span-2 rounded-md border border-success/30 bg-success/10 p-3 text-xs text-success">{ok}</div>}
    <div className="sm:col-span-2 flex justify-end"><button type="submit" className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground"><Send className="h-3.5 w-3.5"/> Submit Report</button></div>
  </form></Card></div></div>;
}

/* -------------------------------------------------------------------------- */
/* Signalling map                                                             */
/* -------------------------------------------------------------------------- */
function SignallingMapView({ onTwin }: { onTwin: (id: string) => void }) {
  return <SMMSMapView onTwin={onTwin} />;
}

/* -------------------------------------------------------------------------- */
/* Command Insights                                                           */
/* -------------------------------------------------------------------------- */
function InsightsView() {
  const [watch,setWatch]=useState<WatchlistAsset[]>([]); const [health,setHealth]=useState<CorridorHealth[]>([]); const [repeat,setRepeat]=useState<RepeatedFailure[]>([]); const [timeline,setTimeline]=useState<TimelineEntry[]>([]); const [error,setError]=useState("");
  useEffect(()=>{Promise.all([apiFetch<WatchlistAsset[]>("/api/smms/watchlist?limit=8"),apiFetch<CorridorHealth[]>("/api/smms/corridor-health"),apiFetch<RepeatedFailure[]>("/api/smms/repeated-failures"),apiFetch<TimelineEntry[]>("/api/smms/timeline")]).then(([w,h,r,t])=>{setWatch(w);setHealth(h);setRepeat(r);setTimeline(t)}).catch(e=>setError(e.message));},[]);
  return <div><PageHeader title="Command Insights" subtitle="Risk watchlist, corridor health, repeated failures and maintenance timeline"/>{error&&<div className="p-4"><ErrorBox message={error}/></div>}<div className="grid gap-4 p-4 xl:grid-cols-2">
    <Card><SectionTitle icon={Target} title="Critical Asset Watchlist"/>{watch.length?<div className="divide-y divide-border/60">{watch.map(a=><div key={a.asset_id} className="flex items-center justify-between px-4 py-3 text-xs"><div><b>{a.asset_id}</b><div className="text-muted-foreground">{a.asset_type} · {a.corridor_label}</div></div><div className="text-right"><div className="font-medium">{Math.round(a.failure_risk*100)}% risk</div><div className="text-[10px] text-muted-foreground">Due {a.next_due_date}</div></div></div>)}</div>:<Empty/>}</Card>
    <Card><SectionTitle icon={HeartPulse} title="Corridor Signal Health"/>{health.length?<div className="divide-y divide-border/60">{health.map(h=><div key={h.corridor_id} className="px-4 py-3 text-xs"><div className="flex justify-between"><span>{h.corridor_label}</span><b>{h.health_score}</b></div><div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{width:`${h.health_score}%`}}/></div><div className="mt-1 text-[10px] text-muted-foreground">{h.open_failures} failures · {h.critical_assets} critical assets</div></div>)}</div>:<Empty/>}</Card>
    <Card><SectionTitle icon={RepeatIcon} title="Repeated Failures"/>{repeat.length?<div className="divide-y divide-border/60">{repeat.map(r=><div key={r.asset_id} className="px-4 py-3 text-xs"><b>{r.asset_id}</b> · {r.asset_type}<div className="mt-1 text-muted-foreground">{r.corridor_label} · {r.open_failure_count} open failures · {r.defect_types.join(", ")}</div></div>)}</div>:<Empty text="No assets currently have repeated open failures."/>}</Card>
    <Card><SectionTitle icon={CalendarClock} title="Maintenance Timeline"/>{timeline.length?<div className="divide-y divide-border/60">{timeline.slice(0,12).map(t=><div key={t.maintenance_id} className="flex justify-between px-4 py-3 text-xs"><div><b>{t.maintenance_id}</b> · {t.asset_id}<div className="text-muted-foreground">{t.corridor_label} · {t.status}</div></div><div className="text-right"><Badge label={t.priority}/><div className="mt-1 text-[10px] text-muted-foreground">{t.due_date}{t.overdue_days>0?` · ${t.overdue_days}d overdue`:""}</div></div></div>)}</div>:<Empty/>}</Card>
  </div></div>;
}
function RepeatIcon(){return <Activity className="h-4 w-4"/>}

/* -------------------------------------------------------------------------- */
/* Reports                                                                    */
/* -------------------------------------------------------------------------- */
function ReportsView() {
  const [type,setType]=useState<"daily_failure"|"maintenance"|"asset_health"|"problem"|"corridor_health">("daily_failure");
  const [rows,setRows]=useState<Record<string,any>[]>([]); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  const [from,setFrom]=useState(""); const [to,setTo]=useState(""); const [asset,setAsset]=useState("ALL"); const [section,setSection]=useState("ALL");
  const load=useCallback(async()=>{setLoading(true);setError("");try{
    const [f,m,a,p,c]=await Promise.all([apiFetch<Failure[]>("/api/smms/failures"),apiFetch<MaintenanceQueue>("/api/smms/maintenance"),apiFetch<Asset[]>("/api/smms/assets"),apiFetch<ProblemReport[]>("/api/smms/problem-reports?limit=500"),apiFetch<CorridorHealth[]>("/api/smms/corridor-health")]);
    let data:any[]=type==="daily_failure"?f:type==="maintenance"?[...m.pending,...m.scheduled,...m.in_progress,...m.completed]:type==="asset_health"?a:type==="problem"?p:c;
    if(asset!=="ALL")data=data.filter((r:any)=>(r.asset_id||"")===asset);
    if(section!=="ALL")data=data.filter((r:any)=>(r.corridor_id||r.corridor_label||"").includes(section));
    if(from)data=data.filter((r:any)=>String(r.due_date||r.reported_at||"")>=from);
    if(to)data=data.filter((r:any)=>String(r.due_date||r.reported_at||"")<=to+"T23:59:59");
    setRows(data as Record<string,any>[]);
  }catch(e){setError(e instanceof Error?e.message:"Could not generate report.");}finally{setLoading(false)}},[type,asset,section,from,to]);
  useEffect(()=>{load()},[load]);
  const columns=useMemo(()=>rows.length?Object.keys(rows[0]).slice(0,12):[],[rows]);
  const downloadCSV=()=>{const esc=(v:any)=>`"${String(v??"").replace(/"/g,'""')}"`;const csv=[columns.map(esc).join(","),...rows.map(r=>columns.map(c=>esc(r[c])).join(","))].join("\r\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv"}));a.download=`smms-${type}.csv`;a.click();URL.revokeObjectURL(a.href);};
  const downloadXlsx=async()=>{try{const XLSX:any=await import("xlsx");const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"SMMS Report");XLSX.writeFile(wb,`smms-${type}.xlsx`)}catch(e){setError("Excel export requires the xlsx package. Run npm install after merging.")}};
  const downloadPdf=async()=>{try{const {jsPDF}:any=await import("jspdf");const autoTable:any=(await import("jspdf-autotable")).default;const doc=new jsPDF({orientation:columns.length>6?"landscape":"portrait"});doc.text(`SMMS ${type.replaceAll("_"," ")} Report`,14,16);autoTable(doc,{startY:24,head:[columns],body:rows.map(r=>columns.map(c=>String(r[c]??""))),styles:{fontSize:7}});doc.save(`smms-${type}.pdf`)}catch(e){setError("PDF export requires jspdf and jspdf-autotable. Run npm install after merging.")}};
  const assets=[...new Set(rows.map(r=>r.asset_id).filter(Boolean))]; const sections=[...new Set(rows.map(r=>(r.corridor_id||r.corridor_label)).filter(Boolean))];
  return <div><PageHeader title="Reports" subtitle="Daily failure, maintenance, asset health, problem and corridor health reports"/><div className="p-4"><Card><div className="grid gap-2 border-b border-border p-3 md:grid-cols-5">
    <select value={type} onChange={e=>setType(e.target.value as any)} className="rounded-md border border-border bg-background px-2 py-2 text-xs"><option value="daily_failure">Daily Failure Report</option><option value="maintenance">Maintenance Report</option><option value="asset_health">Asset Health Report</option><option value="problem">Problem Report</option><option value="corridor_health">Corridor Health Report</option></select>
    <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="rounded-md border border-border bg-background px-2 py-2 text-xs"/><input type="date" value={to} onChange={e=>setTo(e.target.value)} className="rounded-md border border-border bg-background px-2 py-2 text-xs"/>
    <select value={asset} onChange={e=>setAsset(e.target.value)} className="rounded-md border border-border bg-background px-2 py-2 text-xs"><option value="ALL">All assets</option>{assets.map(a=><option key={a}>{a}</option>)}</select>
    <select value={section} onChange={e=>setSection(e.target.value)} className="rounded-md border border-border bg-background px-2 py-2 text-xs"><option value="ALL">All corridors</option>{sections.map(s=><option key={s}>{s}</option>)}</select>
  </div><div className="flex flex-wrap gap-2 border-b border-border p-3"><button onClick={load} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"><FileBarChart2 className="mr-1 inline h-3.5 w-3.5"/>Generate Report</button><button onClick={downloadCSV} disabled={!rows.length} className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"><Download className="mr-1 inline h-3.5 w-3.5"/>CSV</button><button onClick={downloadXlsx} disabled={!rows.length} className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"><FileSpreadsheet className="mr-1 inline h-3.5 w-3.5"/>Excel</button><button onClick={downloadPdf} disabled={!rows.length} className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"><FileDown className="mr-1 inline h-3.5 w-3.5"/>PDF</button></div>
  {error&&<div className="p-3"><ErrorBox message={error}/></div>}{loading?<Loading/>:!rows.length?<Empty text="No records match the selected report filters."/>:<div className="overflow-auto max-h-[620px]"><table className="w-full text-[11px]"><thead className="sticky top-0 bg-card"><tr className="border-b border-border text-left text-muted-foreground">{columns.map(c=><th key={c} className="whitespace-nowrap px-3 py-2">{c}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i} className="border-b border-border/40">{columns.map(c=><td key={c} className="max-w-[260px] px-3 py-2">{String(r[c]??"")}</td>)}</tr>)}</tbody></table></div>}</Card></div></div>;
}

/* -------------------------------------------------------------------------- */
/* Conflict Radar                                                             */
/* -------------------------------------------------------------------------- */
function ConflictsView() {
  const [rows,setRows]=useState<Conflict[]>([]); const [error,setError]=useState("");
  const load=()=>apiFetch<Conflict[]>("/api/smms/conflicts").then(setRows).catch(e=>setError(e.message));
  useEffect(()=>{load()},[]);
  return <div><PageHeader title="Conflict Radar" subtitle="Signalling maintenance tasks that share a corridor/date with planned blocks" onRefresh={load}/><div className="p-4">{error&&<ErrorBox message={error}/>}<Card>{rows.length?<div className="divide-y divide-border/60">{rows.map(r=><div key={`${r.maintenance_id}-${r.block_id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"><div><div className="font-medium">{r.maintenance_id} · {r.asset_id}</div><div className="mt-1 text-muted-foreground">{r.corridor_label} · {r.conflict_date} · block {r.block_id}</div></div><div className="text-right"><div className="font-medium text-warning">{r.block_window}</div><div className="text-[10px] text-muted-foreground">{r.block_status}</div></div></div>)}</div>:<Empty text="No maintenance-vs-block conflicts detected for the authorized scope."/>}</Card></div></div>;
}

/* -------------------------------------------------------------------------- */
/* Analytics                                                                  */
/* -------------------------------------------------------------------------- */
function AnalyticsView() {
  return <AnalyticsPage />;
}

function AuditView() {
  const [rows,setRows]=useState<any[]>([]); const [error,setError]=useState("");
  useEffect(()=>{apiFetch<any[]>("/api/audit?limit=300").then(setRows).catch(e=>setError(e.message))},[]);
  return <div><PageHeader title="Audit Trail" subtitle="Logins, authorization events and SMMS operational actions"/><div className="p-4">{error&&<ErrorBox message={error}/>}<Card>{rows.length?<div className="overflow-auto max-h-[680px]"><table className="w-full text-[11px]"><thead className="sticky top-0 bg-card"><tr className="border-b border-border text-left text-muted-foreground">{["timestamp","username","role","action","resource","result","detail"].map(x=><th key={x} className="whitespace-nowrap px-3 py-2">{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-b border-border/50"><td className="whitespace-nowrap px-3 py-2">{r.timestamp}</td><td className="px-3">{r.username||"—"}</td><td className="px-3">{r.role||"—"}</td><td className="px-3 font-mono">{r.action}</td><td className="px-3">{r.resource||"—"}{r.resource_id?` (${r.resource_id})`:""}</td><td className={`px-3 font-medium ${r.result==="SUCCESS"?"text-success":"text-danger"}`}>{r.result}</td><td className="px-3 text-muted-foreground">{r.detail||""}</td></tr>)}</tbody></table></div>:<Empty text="No audit entries recorded yet."/>}</Card></div></div>;
}

/* -------------------------------------------------------------------------- */
/* Root page                                                                  */
/* -------------------------------------------------------------------------- */
export default function SMMSPage() {
  const params=useSearchParams(); const router=useRouter();
  const raw=params.get("view")||"dashboard";
  const view=(["assets","failures","map","maintenance","report-problem","insights","reports","conflicts","analytics","audit"].includes(raw)?raw:"dashboard") as ViewId;
  const [twin,setTwin]=useState<string|null>(null); const [reportAsset,setReportAsset]=useState<string|undefined>();
  const [reportNonce,setReportNonce]=useState(0);
  const report=useCallback((asset?:string)=>{setReportAsset(asset);router.push(`/smms?view=report-problem`);setReportNonce(n=>n+1)},[router]);
  const closeTwin=()=>setTwin(null);
  return <div className="min-h-screen">
    {view==="dashboard"&&<DashboardView/>}
    {view==="assets"&&<AssetsView onTwin={setTwin} onReport={report}/>}
    {view==="failures"&&<FailuresView/>}
    {view==="map"&&<SignallingMapView onTwin={setTwin}/>}
    {view==="maintenance"&&<MaintenanceView/>}
    {view==="report-problem"&&<ReportProblemView key={reportNonce} initialAsset={reportAsset} onDone={()=>{}}/>}
    {view==="insights"&&<InsightsView/>}
    {view==="reports"&&<ReportsView/>}
    {view==="conflicts"&&<ConflictsView/>}
    {view==="analytics"&&<AnalyticsView/>}
    {view==="audit"&&<AuditView/>}
    {twin&&<DigitalTwinDrawer twinId={twin} onClose={closeTwin}/>}
  </div>;
}
