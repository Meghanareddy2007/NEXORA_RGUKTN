"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import WhatIfModal from "@/components/whatif/whatif";

import { api } from "@/lib/api";
import { TopBar } from "@/components/TopBar";
import TmsDashboard from "@/components/tms/TmsDashboard";
import BackToCOA from "@/components/BackToCOA";

import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Gauge,
  FileBarChart2,
  Loader2,
  Minus,
  ShieldAlert,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  TrainFront,
  Wrench,
  Zap,
  BrainCircuit,
  Route,
  History,
  Download,
  FileSpreadsheet,
  FileDown,
} from "lucide-react";

/*
 * IMPORTANT
 * ----------
 * Do NOT directly import:
 *
 * import SMMSPage from "@/app/smms/page";
 * import TDMSPage from "@/app/tdms/page";
 *
 * Those are Next.js route entry files.
 * Importing them directly into another page can cause:
 *
 * "Could not find the module ... page.tsx#default
 *  in the React Client Manifest"
 *
 * Instead, load them client-side.
 */

const SMMSPage = dynamic(
  () => import("@/app/smms/page"),
  {
    ssr: false,
    loading: () => (
      <ModuleLoading
        title="SMMS"
        message="Loading Signal & Telecom Management System..."
      />
    ),
  }
);

const TDMSPage = dynamic(
  () => import("@/app/tdms/page"),
  {
    ssr: false,
    loading: () => (
      <ModuleLoading
        title="TDMS"
        message="Loading Traction & Diesel Management System..."
      />
    ),
  }
);

/* =========================================================
   TYPES
========================================================= */

type View =
  | "dashboard"
  | "reports"
  | "audit"
  | "equipment"
  | "priority"
  | "what-if"
  | "optimizer";

type Module =
  | "coa"
  | "tms"
  | "smms"
  | "tdms";

type Asset = {
  asset_id: string;
  asset_type: string;
  department: string;
  corridor_id: string;
  location_km: number;
  asset_criticality: number;
  availability_target_pct: number;
  current_status: string;
  last_maintenance_date: string;
  next_due_date: string;
  failure_risk: number;
};

type Block = {
  block_id: string;
  corridor_id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  traffic_level: string;
  train_conflict_count: number;
  block_type: string;
  existing_block: string;
  allowed_departments: string;
  status: string;
};

type Task = {
  task_id: string;
  asset_id: string;
  corridor_id: string;
  defect_type: string;
  maintenance_type: string;
  criticality: number;
  urgency: number;
  safety_risk: number;
  due_date: string;
  overdue_days: number;
  estimated_duration_min: number;
  crew_required: number;
  status: string;
};

type Overview = {
  assets: Asset[];
  blocks: Block[];
  tasks: Task[];

  kpis: {
    assets: number;
    available_blocks: number;
    booked_blocks: number;
    pending_tasks: number;
    critical_tasks: number;
    backlog_level: string;
  };
};

type OptimizeResult = {
  scheduled: any[];
  unscheduled: any[];
  kpis: any;
};

type WhatIfResult = {
  baseline: OptimizeResult;
  what_if: OptimizeResult;

  impact: {
    affected_blocks: string[];
    newly_scheduled_tasks: string[];
    unscheduled_tasks_delta: number;
    scheduled_count_delta: number;
    priority_pct_delta: number;
  };
};

/* =========================================================
   COMMON STYLES
========================================================= */

const card =
  "rounded-xl border border-border bg-card";

const input =
  "rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary";

const score = (t: Task) =>
  t.criticality * 2.5 +
  t.urgency * 2 +
  t.safety_risk * 3 +
  (Math.min(t.overdue_days, 30) / 30) * 10;

/* =========================================================
   MODULE LOADING
========================================================= */

function ModuleLoading({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="flex min-h-[400px] items-center justify-center p-8">
      <div
        className={`${card} flex w-full max-w-md flex-col items-center justify-center p-8 text-center`}
      >
        <Loader2 className="h-7 w-7 animate-spin text-primary" />

        <div className="mt-4 text-sm font-semibold">
          {title}
        </div>

        <div className="mt-2 text-xs text-muted-foreground">
          {message}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   COA PAGE
========================================================= */

function CoaPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawView =
    searchParams.get("view") || "dashboard";

  const rawModule =
    searchParams.get("module") || "coa";

  const view: View = (
    [
      "dashboard",
      "reports",
      "audit",
      "equipment",
      "priority",
      "what-if",
      "optimizer",
    ].includes(rawView)
      ? rawView
      : "dashboard"
  ) as View;

  const module: Module = (
    ["coa", "tms", "smms", "tdms"].includes(
      rawModule
    )
      ? rawModule
      : "coa"
  ) as Module;

  const [data, setData] =
    useState<Overview | null>(null);

  const [error, setError] = useState("");

  const [lastRefresh, setLastRefresh] =
    useState("");

  /* =======================================================
     LOAD COA DATA
  ======================================================= */

  const load = useCallback(() => {
    api
      .get<Overview>("/api/coa/overview")
      .then((r) => {
        setData(r.data);
        setError("");
        setLastRefresh(
          new Date().toLocaleTimeString()
        );
      })
      .catch((e) => {
        setError(
          e?.response?.data?.detail ||
            "COA data could not be loaded."
        );
      });
  }, []);

  /*
   * COA data is required only for COA views.
   *
   * TMS / SMMS / TDMS should not depend on
   * /api/coa/overview being available.
   */
  useEffect(() => {
    if (module === "coa") {
      load();
    }
  }, [module, load]);

  /* =======================================================
     COA VIEW NAVIGATION
  ======================================================= */

  const navigate = useCallback(
    (v: View) => {
      if (v === "dashboard") {
        router.push("/coa");
        return;
      }

      router.push(`/coa?view=${v}`);
    },
    [router]
  );

  /* =======================================================
     MODULE NAVIGATION
  ======================================================= */

  const navigateModule = useCallback(
    (nextModule: Module) => {
      if (nextModule === "coa") {
        router.push("/coa");
        return;
      }

      router.push(
        `/coa?module=${nextModule}`
      );
    },
    [router]
  );

  /* =======================================================
     TMS
  ======================================================= */

  if (module === "tms") {
    return (
      <div className="min-h-screen">
        <div className="flex items-center justify-end border-b border-border px-6 py-2"><BackToCOA /></div>
        <div className="min-w-0">
          <TmsDashboard />
        </div>
      </div>
    );
  }

  /* =======================================================
     SMMS
  ======================================================= */

  if (module === "smms") {
    return (
      <div className="min-h-screen">
        <div className="flex items-center justify-end border-b border-border px-6 py-2"><BackToCOA /></div>
        <div className="min-w-0">
          <SMMSPage />
        </div>
      </div>
    );
  }

  /* =======================================================
     TDMS
  ======================================================= */

  if (module === "tdms") {
    return (
      <div className="min-h-screen">
        <div className="flex items-center justify-end border-b border-border px-6 py-2"><BackToCOA /></div>
        <div className="min-w-0">
          <TDMSPage />
        </div>
      </div>
    );
  }

  /* =======================================================
     NORMAL COA CONTENT
  ======================================================= */

  const backControl = view !== "dashboard" ? (
    <div className="flex items-center justify-end border-b border-border px-6 py-2">
      <BackToCOA />
    </div>
  ) : null;

  if (!data) {
    return (
      <div className="min-h-screen">
        {backControl}
        <TopBar
          title="COA Command Center"
          subtitle="Corridor Operations Authority"
        />

        <div className="p-6 text-sm text-muted-foreground">
          {error ||
            "Loading COA operational data…"}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {backControl}
      <TopBar
        title="COA Command Center"
        subtitle="Corridor Operations Authority"
      />

      <div className="p-5 md:p-6">
        {error && (
          <div
            className={`${card} mb-4 p-3 text-xs text-danger`}
          >
            {error}
          </div>
        )}

        {view === "dashboard" && (
          <Dashboard
            data={data}
            onNavigate={navigate}
            onModule={navigateModule}
            refresh={load}
            lastRefresh={lastRefresh}
          />
        )}

        {view === "equipment" && (
          <Equipment data={data} />
        )}

        {view === "priority" && (
          <Priority data={data} />
        )}

        {view === "optimizer" && (
          <Optimizer data={data} />
        )}

        {view === "what-if" && (
          <WhatIf data={data} />
        )}

        {view === "reports" && <Reports data={data} />}

        {view === "audit" && <AuditLog />}

      </div>
    </div>
  );
}

/* =========================================================
   KPI
========================================================= */

function Kpi({
  label,
  value,
  icon: Icon,
  detail,
}: {
  label: string;
  value: string | number;
  icon: any;
  detail?: string;
}) {
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {label}
        </span>

        <Icon className="h-4 w-4 text-primary" />
      </div>

      <div className="mt-2 text-2xl font-semibold">
        {value}
      </div>

      {detail && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          {detail}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard({
  data,
  onNavigate,
  onModule,
  refresh,
  lastRefresh,
}: {
  data: Overview;
  onNavigate: (v: View) => void;
  onModule: (module: Module) => void;
  refresh: () => void;
  lastRefresh: string;
}) {
  const available = data.blocks
    .filter((b) => b.status === "Available")
    .slice(0, 8);

  const high = [...data.tasks]
    .filter(
      (t) =>
        t.status === "Pending" ||
        t.status === "Scheduled"
    )
    .sort((a, b) => score(b) - score(a))
    .slice(0, 6);

  return (
    <div className="space-y-5">
      {/* HEADER */}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            Corridor Operations Overview
          </h1>

          <p className="text-sm text-muted-foreground">
            Live-like operational view built from the
            project datasets; it does not claim connection
            to an external railway control system.
          </p>
        </div>

        <button
          onClick={refresh}
          className="rounded-md border border-border px-3 py-2 text-xs"
        >
          <RefreshCw className="mr-1 inline h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* =====================================================
          TMS / SMMS / TDMS
      ===================================================== */}

      <div className="grid gap-3 md:grid-cols-3">
        <button
          onClick={() => onModule("tms")}
          className={`${card} p-4 text-left transition hover:border-primary/60`}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
            <TrainFront className="h-5 w-5 text-primary" />
          </div>

          <div className="mt-3 text-sm font-semibold">
            TMS
          </div>

          <div className="mt-1 text-[11px] text-muted-foreground">
            Train Management System
          </div>

          <div className="mt-3 text-[10px] text-primary">
            Open inside COA →
          </div>
        </button>

        <button
          onClick={() => onModule("smms")}
          className={`${card} p-4 text-left transition hover:border-primary/60`}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
            <Activity className="h-5 w-5 text-primary" />
          </div>

          <div className="mt-3 text-sm font-semibold">
            SMMS
          </div>

          <div className="mt-1 text-[11px] text-muted-foreground">
            Safety & Maintenance Management
          </div>

          <div className="mt-3 text-[10px] text-primary">
            Open inside COA →
          </div>
        </button>

        <button
          onClick={() => onModule("tdms")}
          className={`${card} p-4 text-left transition hover:border-primary/60`}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
            <Route className="h-5 w-5 text-primary" />
          </div>

          <div className="mt-3 text-sm font-semibold">
            TDMS
          </div>

          <div className="mt-1 text-[11px] text-muted-foreground">
            Track & Dispatch Management
          </div>

          <div className="mt-3 text-[10px] text-primary">
            Open inside COA →
          </div>
        </button>
      </div>

      {/* KPIs */}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi
          label="Assets"
          value={data.kpis.assets}
          icon={Wrench}
        />

        <Kpi
          label="Available blocks"
          value={data.kpis.available_blocks}
          icon={Route}
        />

        <Kpi
          label="Booked blocks"
          value={data.kpis.booked_blocks}
          icon={CheckCircle2}
        />

        <Kpi
          label="Pending work"
          value={data.kpis.pending_tasks}
          icon={Clock3}
          detail={`${data.kpis.critical_tasks} critical/high-criticality records`}
        />

        <Kpi
          label="RL backlog state"
          value={data.kpis.backlog_level}
          icon={BrainCircuit}
        />
      </div>

      {/* BLOCKS / PRIORITY */}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section
          className={`${card} overflow-hidden`}
        >
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold">
              Upcoming block windows
            </h2>

            <p className="text-[11px] text-muted-foreground">
              Source: COA_BLOCK_AVAILABILITY.csv
            </p>
          </div>

          <div className="divide-y divide-border/50">
            {available.map((b) => (
              <div
                key={b.block_id}
                className="flex items-center justify-between gap-3 p-3 text-xs"
              >
                <div>
                  <div className="font-medium">
                    {b.block_id} · {b.corridor_id}
                  </div>

                  <div className="text-muted-foreground">
                    {b.date} · {b.start_time}–{b.end_time} ·{" "}
                    {b.allowed_departments}
                  </div>
                </div>

                <div className="text-right">
                  <div>
                    {b.traffic_level} traffic
                  </div>

                  <div className="text-[10px] text-muted-foreground">
                    {b.train_conflict_count} train conflicts
                  </div>
                </div>
              </div>
            ))}

            {!available.length && (
              <div className="p-4 text-xs text-muted-foreground">
                No available blocks in the current dataset.
              </div>
            )}
          </div>
        </section>

        <section className={`${card} p-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Priority watch
            </h2>

            <button
              onClick={() =>
                onNavigate("priority")
              }
              className="text-[11px] text-primary"
            >
              Open priority score →
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {high.map((t) => (
              <div
                key={t.task_id}
                className="rounded-lg border border-border/60 p-3"
              >
                <div className="flex justify-between gap-2 text-xs">
                  <span className="font-medium">
                    {t.task_id} · {t.asset_id}
                  </span>

                  <span className="font-semibold text-primary">
                    {score(t).toFixed(1)}
                  </span>
                </div>

                <div className="mt-1 text-[10px] text-muted-foreground">
                  {t.defect_type} · {t.status} · due{" "}
                  {t.due_date}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* INTERNAL COA TOOLS */}

      <div className="grid gap-3 md:grid-cols-4">
        <button
          onClick={() =>
            onNavigate("reports")
          }
          className={`${card} p-4 text-left hover:border-primary/50`}
        >
          <Sparkles className="h-4 w-4 text-primary" />

          <div className="mt-2 text-sm font-medium">
            Block Planning
          </div>

          <div className="mt-1 text-[11px] text-muted-foreground">
            Generate and review AI maintenance plans
          </div>
        </button>

        <button
          onClick={() =>
            onNavigate("what-if")
          }
          className={`${card} p-4 text-left hover:border-primary/50`}
        >
          <SlidersHorizontal className="h-4 w-4 text-primary" />

          <div className="mt-2 text-sm font-medium">
            What-If Simulation
          </div>

          <div className="mt-1 text-[11px] text-muted-foreground">
            Re-run the real optimizer on scenario copies
          </div>
        </button>

        <button
          onClick={() =>
            onNavigate("optimizer")
          }
          className={`${card} p-4 text-left hover:border-primary/50`}
        >
          <Zap className="h-4 w-4 text-primary" />

          <div className="mt-2 text-sm font-medium">
            Optimizer
          </div>

          <div className="mt-1 text-[11px] text-muted-foreground">
            Inspect why assignments were selected
          </div>
        </button>

        <button
          onClick={() =>
            onNavigate("priority")
          }
          className={`${card} p-4 text-left hover:border-primary/50`}
        >
          <BrainCircuit className="h-4 w-4 text-primary" />

          <div className="mt-2 text-sm font-medium">
            RL Agent
          </div>

          <div className="mt-1 text-[11px] text-muted-foreground">
            View the existing Q-learning implementation
          </div>
        </button>
      </div>

      <div className="text-[10px] text-muted-foreground">
        Last refreshed {lastRefresh || "—"} · data is
        project-local.
      </div>
    </div>
  );
}

/* =========================================================
   EQUIPMENT — live project dataset
========================================================= */
function Equipment({ data }: { data: Overview }) {
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError("");
    api.get<any[]>("/api/coa/equipment", { params: { status, search: search || undefined } })
      .then(r => setRows(r.data)).catch(e => setError(e?.response?.data?.detail || "Equipment data could not be loaded."))
      .finally(() => setLoading(false));
  }, [status, search]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    all: rows.length,
    available: rows.filter(r => r.availability_state === "Available").length,
    inUse: rows.filter(r => r.current_assignment?.length).length,
    maintenance: rows.filter(r => r.maintenance_status === "Under Maintenance").length,
    unavailable: rows.filter(r => r.availability_state === "Unavailable").length,
    critical: rows.filter(r => r.criticality >= 4).length,
  }), [rows]);

  return <div className="space-y-4">
    <Header icon={Wrench} title="Equipment Command" subtitle="Equipment availability feeds directly into the explainable prioritization engine." live />
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      {[["All",counts.all,"ALL"],["Available",counts.available,"Available"],["In Use",counts.inUse,"In Use"],["Under Maintenance",counts.maintenance,"Under Maintenance"],["Unavailable",counts.unavailable,"Unavailable"],["Critical",counts.critical,"Critical"]].map(([label,value,key]) => <button key={String(key)} onClick={() => setStatus(String(key))} className={`${card} p-3 text-left ${status===key ? "ring-1 ring-primary" : ""}`}><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></button>)}
    </div>
    <div className={`${card} p-3`}>
      <div className="flex flex-wrap gap-2">
        <input className={`${input} min-w-[220px] flex-1`} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search equipment, type or corridor…" />
        <button onClick={load} className="rounded-md border border-border px-3 py-2 text-xs hover:bg-muted"><RefreshCw className="mr-1 inline h-3.5 w-3.5"/>Refresh</button>
      </div>
    </div>
    {error && <div className={`${card} p-3 text-xs text-danger`}>{error}</div>}
    <div className={`${card} overflow-auto`}>
      {loading ? <ModuleLoading title="Equipment" message="Refreshing equipment state…"/> : rows.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No equipment matches the selected filter.</div> : <table className="w-full text-xs"><thead className="bg-muted/40 text-muted-foreground"><tr>{["Equipment ID","Type","Availability","Status","Condition","Maintenance","Assignment / Block","Last maintenance","Next maintenance","Criticality","Workload"].map(x=><th key={x} className="whitespace-nowrap px-3 py-2 text-left">{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.equipment_id} onClick={()=>setSelected(r)} className="cursor-pointer border-t border-border/50 hover:bg-muted/30"><td className="px-3 py-2 font-semibold">{r.equipment_id}</td><td className="px-3">{r.equipment_type}</td><td className="px-3"><Badge value={`${r.availability_pct}%`} /><div className="mt-1 text-[9px] text-muted-foreground">{r.availability_state}</div></td><td className="px-3"><Badge value={r.current_status}/></td><td className="px-3">{r.condition}%</td><td className="px-3">{r.maintenance_status}</td><td className="px-3">{r.current_assignment?.length ? r.current_assignment.join(", ") : "No active assignment"}{r.block ? <div className="text-[9px] text-muted-foreground">Block {r.block}</div> : null}</td><td className="px-3">{r.last_maintenance}</td><td className="px-3">{r.next_maintenance}</td><td className="px-3">{r.criticality}/5</td><td className="px-3">{r.workload_utilization_pct}%</td></tr>)}</tbody></table>}
    </div>
    {selected && <div className={`${card} p-4`}><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold">{selected.equipment_id} · AI Prioritizer context</div><div className="mt-1 text-xs text-muted-foreground">Availability is derived from the asset register's target and current status; this value is an input to task priority scoring.</div></div><button onClick={()=>setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground">Close</button></div><div className="mt-4 grid gap-3 md:grid-cols-4"><Kpi label="Availability" value={`${selected.availability_pct}%`} icon={Gauge}/><Kpi label="Condition" value={`${selected.condition}%`} icon={Activity}/><Kpi label="Criticality" value={`${selected.criticality}/5`} icon={AlertTriangle}/><Kpi label="Open tasks" value={selected.open_task_count} icon={Wrench}/></div><div className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-xs"><div className="font-semibold">AI relationship</div><div className="mt-2">{selected.availability_pct < 60 ? "Low equipment availability increases the availability-pressure component for related maintenance tasks." : selected.availability_pct < 80 ? "Reduced equipment availability adds pressure to related maintenance tasks." : "Equipment availability is not currently a major priority-pressure driver."}</div></div></div>}
  </div>;
}

/* =========================================================
   PRIORITY — explainable scoring engine
========================================================= */
function Priority({ data }: { data: Overview }) {
  const [rows, setRows] = useState<any[]>([]);
  const [distribution, setDistribution] = useState<Record<string,number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [referenceDate, setReferenceDate] = useState(new Date().toISOString().slice(0,10));
  const previous = useMemo(() => new Map<string, number>(), []);
  const [priorScores, setPriorScores] = useState<Record<string,number>>({});

  const load = useCallback(() => {
    setLoading(true); setError("");
    api.get<any>("/api/coa/priority", { params: { reference_date: referenceDate } }).then(r=>{
      const next = r.data.tasks || [];
      setPriorScores(Object.fromEntries(next.map((x:any)=>[x.task_id, previous.get(x.task_id) ?? x.priority_score])));
      next.forEach((x:any)=>previous.set(x.task_id, x.priority_score));
      setRows(next); setDistribution(r.data.distribution || {});
    }).catch(e=>setError(e?.response?.data?.detail || "Priority engine could not calculate task scores.")).finally(()=>setLoading(false));
  }, [referenceDate, previous]);

  // Initial load only. Recalculation happens only when the user
  // clicks the Recalculate button; changing the date alone does not
  // trigger another API request.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const high = rows.filter(r=>["CRITICAL","HIGH"].includes(r.priority_level)).length;
  const max = Math.max(1, ...rows.map(r=>r.priority_score));
  const distributionTotal = Object.values(distribution).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const movement = (r:any) => { const p=priorScores[r.task_id]; if (p===undefined || p===r.priority_score) return <Minus className="h-3 w-3 text-muted-foreground"/>; return r.priority_score>p ? <span className="inline-flex items-center text-success"><ArrowUp className="h-3 w-3"/> {r.priority_score-p}</span> : <span className="inline-flex items-center text-danger"><ArrowDown className="h-3 w-3"/> {p-r.priority_score}</span>; };

  return <div className="space-y-4">
    <Header icon={Activity} title="Priority Score Generator" subtitle="Explainable equipment-aware prioritization from the project's maintenance, asset and block data." live />
    <div className="flex flex-wrap items-center gap-2"><label className="text-xs text-muted-foreground">Scoring date</label><input type="date" className={input} value={referenceDate} onChange={e=>setReferenceDate(e.target.value)}/><button onClick={load} disabled={loading} className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50">{loading?<Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin"/>:<RefreshCw className="mr-1 inline h-3.5 w-3.5"/>}Recalculate</button><span className="text-[10px] text-muted-foreground">Last updated {new Date().toLocaleTimeString()}</span></div>
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5"><Kpi label="Tasks ranked" value={rows.length} icon={Gauge}/><Kpi label="High / critical" value={high} icon={AlertTriangle}/><Kpi label="Critical" value={distribution.CRITICAL || 0} icon={ShieldAlert}/><Kpi label="Equipment-aware" value={rows.filter(r=>r.factors?.equipment_availability_pct !== null).length} icon={Wrench}/><Kpi label="Reference date" value={referenceDate} icon={Clock3}/></div>
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className={`${card} overflow-auto`}>
        {error ? <div className="p-5 text-sm text-danger">{error}</div> : loading ? <ModuleLoading title="Priority engine" message="Calculating explainable task scores…"/> : rows.length===0 ? <div className="p-10 text-center text-sm text-muted-foreground">No open maintenance tasks are available for this dataset.</div> : <table className="w-full text-xs"><thead className="bg-muted/40 text-muted-foreground"><tr>{["Rank","Move","Task","Equipment","Block","Score","Level","Reasons"].map(x=><th key={x} className="whitespace-nowrap px-3 py-2 text-left">{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.task_id} onClick={()=>setSelected(r)} className="cursor-pointer border-t border-border/50 hover:bg-muted/30"><td className="px-3 py-2 font-semibold">{r.rank}</td><td className="px-3">{movement(r)}</td><td className="px-3 font-medium">{r.task_id}<div className="text-[9px] text-muted-foreground">{r.defect_type}</div></td><td className="px-3">{r.asset_id}</td><td className="px-3">{r.corridor_id}</td><td className="px-3 min-w-[110px]"><div className="font-semibold">{r.priority_score}</div><div className="mt-1 h-1 rounded bg-muted"><div className="h-1 rounded bg-primary" style={{width:`${Math.min(100,r.priority_score/max*100)}%`}}/></div></td><td className="px-3"><Badge value={r.priority_level}/></td><td className="max-w-[330px] px-3 py-2 text-muted-foreground">{r.reasons?.slice(0,2).join(" ")}</td></tr>)}</tbody></table>}
      </div>
      <div className={`${card} p-4`}><div className="text-sm font-semibold">Priority distribution</div><div className="mt-4 space-y-3">{["CRITICAL","HIGH","MEDIUM","LOW"].map(level=><div key={level}><div className="mb-1 flex justify-between text-[10px]"><span>{level}</span><span>{distribution[level] || 0}</span></div><div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{width:`${distributionTotal ? Math.min(100, ((distribution[level]||0)/distributionTotal)*100) : 0}%`}}/></div></div>)}</div><div className="mt-6 rounded-lg border border-border bg-muted/20 p-3 text-[10px] text-muted-foreground">Weights: severity 18 · urgency 16 · safety 20 · equipment criticality 14 · operational impact 10 · delay impact 8 · deadline 6 · equipment availability 4 · condition 4.</div></div>
    </div>
    {selected && <div className={`${card} p-4`}><div className="flex items-start justify-between"><div><div className="text-sm font-semibold">WHY IS {selected.task_id} HIGH PRIORITY?</div><div className="mt-1 text-xs text-muted-foreground">The explanation below is generated from the same factors used to calculate the displayed score.</div></div><button onClick={()=>setSelected(null)} className="text-xs text-muted-foreground">Close</button></div><div className="mt-4 grid gap-2 md:grid-cols-5">{[["Equipment condition",selected.factors.condition_label],["Equipment availability",selected.factors.equipment_availability_pct == null ? "Not recorded" : `${selected.factors.equipment_availability_pct}%`],["Safety impact",selected.factors.safety_label],["Operational impact",selected.factors.operational_impact_label],["Urgency / deadline",`${selected.factors.urgency_label} / ${selected.factors.deadline_pressure_label}`]].map(([a,b])=><div key={a} className="rounded-lg border border-border p-3"><div className="text-[10px] text-muted-foreground">{a}</div><div className="mt-1 text-xs font-semibold">{b}</div></div>)}</div><div className="my-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center text-[10px]"><div className="rounded-lg border border-border p-3">INPUTS<br/><span className="text-muted-foreground">condition · availability · safety · operations · urgency · deadline</span></div><ArrowRight className="mx-auto h-4 w-4"/><div className="rounded-lg border border-primary/40 bg-primary/5 p-3">PRIORITIZATION ENGINE<br/><span className="text-muted-foreground">weighted project-local scoring</span></div></div><div className="grid gap-2 md:grid-cols-2">{Object.entries(selected.breakdown || {}).map(([key,value]:any)=><div key={key} className="flex justify-between rounded border border-border/60 px-3 py-2 text-xs"><span>{key.replaceAll("_"," ")}</span><span className="font-semibold">+{value}</span></div>)}</div><div className="mt-4 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4"><div><div className="text-xs font-semibold">RECOMMENDED ACTION</div><div className="mt-1 text-[11px] text-muted-foreground">Prioritize according to the calculated ranking and review block/resource feasibility.</div></div><div className="text-right"><div className="text-2xl font-bold">{selected.priority_score}</div><Badge value={selected.priority_level}/></div></div><div className="mt-4 space-y-1 text-xs">{selected.reasons?.map((x:string,i:number)=><div key={i}>✓ {x}</div>)}</div></div>}
  </div>;
}

/* =========================================================
   REPORTS — dynamic daily / weekly / monthly operational plans
========================================================= */
function Reports({ data }: { data: Overview }) {
  const [view, setView] = useState<"daily"|"weekly"|"monthly">("daily");
  const [day, setDay] = useState(new Date().toISOString().slice(0,10));
  const [week, setWeek] = useState(new Date().toISOString().slice(0,10));
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7));
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true); setError("");
    const params = view === "daily" ? { selected_date: day } : view === "weekly" ? { week_start: week } : { month };
    api.get<any>("/api/coa/reports/plans", { params: { view, ...params } }).then(r=>setResult(r.data)).catch(e=>setError(e?.response?.data?.detail || "The operational report could not be generated.")).finally(()=>setLoading(false));
  }, [view, day, week, month]);
  useEffect(()=>{ load(); },[load]);

  const rows = result?.rows || [];
  const byDay = useMemo(() => rows.reduce((acc:any,r:any)=>{ const d=r.date || "Unknown"; acc[d]=(acc[d]||0)+1; return acc; },{}),[rows]);
  const controls = view === "daily" ? <input type="date" className={input} value={day} onChange={e=>setDay(e.target.value)}/> : view === "weekly" ? <input type="date" className={input} value={week} onChange={e=>setWeek(e.target.value)}/> : <input type="month" className={input} value={month} onChange={e=>setMonth(e.target.value)}/>;
  const columns = ["date","task_id","equipment","block_id","priority_level","priority_score","status","start_time","end_time","estimated_duration_min","crew_required","conflict"];
  const exportRows = rows.map((r:any) => Object.fromEntries(columns.map((c) => [c, r[c] ?? ""])));
  const downloadCsv = () => {
    const esc = (v:any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [columns.map(esc).join(","), ...exportRows.map((r:any) => columns.map((c) => esc(r[c])).join(","))].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv" })); a.download = `coa-${view}-report.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const downloadXlsx = async () => {
    try { const XLSX:any = await import("xlsx"); const ws = XLSX.utils.json_to_sheet(exportRows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "COA Report"); XLSX.writeFile(wb, `coa-${view}-report.xlsx`); } catch { setError("Excel export requires the xlsx package."); }
  };
  const downloadPdf = async () => {
    try { const { jsPDF }:any = await import("jspdf"); const autoTable:any = (await import("jspdf-autotable")).default; const doc = new jsPDF({ orientation: "landscape" }); doc.text(`COA ${view} Operational Report`, 14, 16); autoTable(doc, { startY: 24, head: [columns], body: exportRows.map((r:any) => columns.map((c) => String(r[c] ?? ""))), styles: { fontSize: 6 } }); doc.save(`coa-${view}-report.pdf`); } catch { setError("PDF export requires jspdf and jspdf-autotable."); }
  };

  return <div className="space-y-4">
    <Header icon={FileBarChart2} title="Operational Reports" subtitle="Plans are generated from TMS, SMMS, TDMS maintenance tasks and COA block availability." live />
    <div className={`${card} p-3`}><div className="flex flex-wrap items-center gap-2"><div className="flex rounded-md border border-border p-0.5">{(["daily","weekly","monthly"] as const).map(v=><button key={v} onClick={()=>setView(v)} className={`rounded px-3 py-1.5 text-xs capitalize ${view===v?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted"}`}>{v}</button>)}</div>{controls}<button onClick={load} disabled={loading} className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground">{loading?<Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin"/>:<RefreshCw className="mr-1 inline h-3.5 w-3.5"/>}Regenerate</button><button onClick={downloadCsv} disabled={!rows.length} className="rounded-md border border-border px-3 py-2 text-xs disabled:opacity-50"><Download className="mr-1 inline h-3.5 w-3.5"/>CSV</button><button onClick={downloadXlsx} disabled={!rows.length} className="rounded-md border border-border px-3 py-2 text-xs disabled:opacity-50"><FileSpreadsheet className="mr-1 inline h-3.5 w-3.5"/>Excel</button><button onClick={downloadPdf} disabled={!rows.length} className="rounded-md border border-border px-3 py-2 text-xs disabled:opacity-50"><FileDown className="mr-1 inline h-3.5 w-3.5"/>PDF</button><span className="text-[10px] text-muted-foreground">Generated {result?.generated_at ? new Date(result.generated_at).toLocaleTimeString() : "—"}</span></div></div>
    {error && <div className={`${card} p-3 text-xs text-danger`}>{error}</div>}
    {result && <><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">{[["Planned",result.kpis.planned_tasks],["High priority",result.kpis.high_priority],["Completed",result.kpis.completed],["Pending",result.kpis.pending],["Conflicts",result.kpis.conflicts],["Equipment",result.kpis.equipment_involved],["Workload",`${result.kpis.maintenance_workload_min}m`]].map(([label,value])=><Kpi label={String(label)} value={value as any} icon={label==="Conflicts"?AlertTriangle:label==="Completed"?CheckCircle2:Gauge}/>)}</div>
      {view === "weekly" && <div className={`${card} p-4`}><div className="mb-3 text-sm font-semibold">Monday–Sunday workload</div><div className="grid grid-cols-7 gap-2">{Object.entries(byDay).map(([d,c]:any)=><div key={d} className="rounded border border-border p-2 text-center"><div className="text-[9px] text-muted-foreground">{new Date(d).toLocaleDateString(undefined,{weekday:"short"})}</div><div className="mt-2 text-lg font-semibold">{c}</div><div className="text-[9px] text-muted-foreground">tasks</div></div>)}</div></div>}
      <div className={`${card} overflow-auto`}><table className="w-full text-xs"><thead className="bg-muted/40 text-muted-foreground"><tr>{["Date","Task","Equipment","Block","Priority","Status","Window","Duration","Crew","Conflict"].map(x=><th key={x} className="whitespace-nowrap px-3 py-2 text-left">{x}</th>)}</tr></thead><tbody>{rows.length ? rows.map((r:any,i:number)=><tr key={`${r.task_id}-${r.block_id}-${i}`} className="border-t border-border/50"><td className="px-3 py-2">{r.date}</td><td className="px-3 font-medium">{r.task_id}<div className="text-[9px] text-muted-foreground">{r.maintenance_type} · {r.defect_type}</div></td><td className="px-3">{r.equipment}</td><td className="px-3">{r.block_id}</td><td className="px-3"><Badge value={r.priority_level}/><div className="text-[9px]">{r.priority_score}</div></td><td className="px-3"><Badge value={r.status}/></td><td className="px-3">{r.start_time}–{r.end_time}</td><td className="px-3">{r.estimated_duration_min}m</td><td className="px-3">{r.crew_required}</td><td className="px-3">{r.conflict ? "Conflict pressure" : "Clear"}</td></tr>) : <tr><td colSpan={10} className="p-10 text-center text-muted-foreground">No optimized maintenance tasks fall inside this selected period. Try a date/week/month covered by the project dataset.</td></tr>}</tbody></table></div></>}
    {!result && !loading && <div className={`${card} p-10 text-center text-sm text-muted-foreground`}>Select a period and generate the operational plan.</div>}
  </div>;
}


/* =========================================================
   AUDIT LOG
========================================================= */
function AuditLog() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api.get<any[]>("/api/audit?limit=300")
      .then((r) => setRows(r.data || []))
      .catch((e) => setError(e?.response?.data?.detail || "Could not load audit log."));
  }, []);

  return <div className="space-y-4">
    <Header icon={History} title="Audit Log" subtitle="Authentication, authorization and operational activity recorded by NEXORA." live />
    {error && <div className={`${card} p-3 text-xs text-danger`}>{error}</div>}
    <div className={`${card} overflow-auto max-h-[680px]`}>
      {rows.length ? <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-card"><tr className="border-b border-border text-left text-muted-foreground">
          {["timestamp","username","role","action","resource","result","detail"].map((x) => <th key={x} className="whitespace-nowrap px-3 py-2">{x}</th>)}
        </tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className="border-b border-border/50">
          <td className="whitespace-nowrap px-3 py-2">{r.timestamp}</td><td className="px-3">{r.username || "—"}</td><td className="px-3">{r.role || "—"}</td><td className="px-3 font-mono">{r.action}</td><td className="px-3">{r.resource || "—"}{r.resource_id ? ` (${r.resource_id})` : ""}</td><td className={`px-3 font-medium ${r.result === "SUCCESS" ? "text-success" : "text-danger"}`}>{r.result}</td><td className="px-3 text-muted-foreground">{r.detail || ""}</td>
        </tr>)}</tbody>
      </table> : <div className="p-10 text-center text-sm text-muted-foreground">No audit entries recorded yet.</div>}
    </div>
  </div>;
}

/* =========================================================
   OPTIMIZER
========================================================= */

function Optimizer({
  data,
}: {
  data: Overview;
}) {
  const [result, setResult] =
    useState<OptimizeResult | null>(
      null
    );

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const run = () => {
    setLoading(true);
    setError("");

    api
      .post<OptimizeResult>(
        "/api/optimize/run"
      )
      .then((r) => {
        setResult(r.data);
      })
      .catch((e) => {
        setError(
          e?.response?.data?.detail ||
            "Optimizer failed."
        );
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const selected =
    result?.scheduled?.slice(0, 8) ||
    [];

  return (
    <div className="space-y-4">
      <Header
        icon={Sparkles}
        title="Optimizer"
        subtitle="Existing OR-Tools CP-SAT optimizer with decision explanations derived from the actual task/block constraints."
      />

      <div className="flex gap-2">
        <button
          onClick={run}
          disabled={loading}
          className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground"
        >
          {loading ? (
            <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="mr-1 inline h-3.5 w-3.5" />
          )}

          {loading
            ? "Optimizing…"
            : "Run existing optimizer"}
        </button>

        {result && (
          <div className="rounded-md border border-border px-3 py-2 text-xs">
            Scheduled{" "}
            {result.kpis.scheduled_count} /{" "}
            {result.kpis.total_tasks_considered}
          </div>
        )}
      </div>

      {error && (
        <div className="text-xs text-danger">
          {error}
        </div>
      )}

      {selected.map((item: any) => (
        <DecisionCard
          item={item}
          blocks={data.blocks}
        />
      ))}

      {!result && (
        <div
          className={`${card} p-8 text-center text-sm text-muted-foreground`}
        >
          Run the optimizer to inspect WHY THIS
          BLOCK and the constraint-based reasons
          alternatives were not selected.
        </div>
      )}
    </div>
  );
}

/* =========================================================
   DECISION CARD
========================================================= */

function DecisionCard({
  item,
  blocks,
}: {
  item: any;
  blocks: Block[];
}) {
  const b = blocks.find(
    (x) => x.block_id === item.block_id
  );

  const alternatives = blocks
    .filter(
      (x) =>
        x.corridor_id ===
          item.corridor_id &&
        x.status === "Available"
    )
    .slice(0, 5);

  return (
    <section className={`${card} p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">
            Task {item.task_id}
          </div>

          <h2 className="text-base font-semibold">
            WHY THIS BLOCK?{" "}
            <span className="text-primary">
              {item.block_id}
            </span>
          </h2>
        </div>

        <Badge value={item.traffic_level} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-xs">
          <div className="mb-2 font-semibold text-success">
            Selected because the actual optimizer
            found this assignment feasible
          </div>

          <ul className="space-y-1">
            {b && (
              <>
                <li>
                  ✓ Corridor matches{" "}
                  {item.corridor_id}
                </li>

                <li>
                  ✓ {item.department} is allowed:{" "}
                  {b.allowed_departments}
                </li>

                <li>
                  ✓ Task duration{" "}
                  {item.estimated_duration_min} min
                  fits {b.duration_min} min block
                  capacity
                </li>

                <li>
                  ✓ Block is Available in the
                  optimizer input
                </li>

                <li>
                  ✓ Objective balances task priority
                  against traffic/conflict penalty
                </li>
              </>
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-border p-3 text-xs">
          <div className="mb-2 font-semibold">
            WHY NOT OTHER BLOCKS?
          </div>

          {alternatives
            .filter(
              (x) =>
                x.block_id !==
                item.block_id
            )
            .slice(0, 4)
            .map((x) => (
              <div
                key={x.block_id}
                className="border-b border-border/50 py-2 last:border-0"
              >
                <div className="font-medium">
                  {x.block_id}
                </div>

                <div className="text-muted-foreground">
                  {x.duration_min <
                  item.estimated_duration_min
                    ? "Insufficient duration"
                    : !x.allowed_departments
                        .split("|")
                        .includes(
                          item.department
                        )
                    ? "Department not allowed"
                    : `${x.train_conflict_count} train conflicts · ${x.traffic_level} traffic; optimizer objective penalizes disruption`}
                </div>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   WHAT IF
========================================================= */

function WhatIf({
  data,
}: {
  data: Overview;
}) {
  const [scenario, setScenario] =
    useState("block_unavailable");

  const [value, setValue] =
    useState(
      data.blocks.find(
        (b) => b.status === "Available"
      )?.block_id || ""
    );

  const [result, setResult] =
    useState<WhatIfResult | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const run = () => {
    setLoading(true);

    setError("");

    setResult(null);

    api
      .post<WhatIfResult>(
        "/api/coa/what-if",
        {
          scenario,
          value,
        }
      )
      .then((r) => {
        setResult(r.data);
      })
      .catch((e) => {
        setError(
          e?.response?.data?.detail ||
            "Scenario simulation failed."
        );
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleScenarioChange = (
    nextScenario: string
  ) => {
    setScenario(nextScenario);

    setResult(null);

    setError("");

    if (
      nextScenario ===
      "block_unavailable"
    ) {
      setValue(
        data.blocks.find(
          (b) => b.status === "Available"
        )?.block_id || ""
      );
    } else if (
      nextScenario ===
      "equipment_unavailable"
    ) {
      setValue(
        data.assets[0]?.asset_id || ""
      );
    } else if (
      nextScenario ===
      "duration_increase"
    ) {
      setValue("25");
    } else if (
      nextScenario ===
      "equipment_availability_reduced"
    ) {
      setValue(data.assets[0]?.asset_id || "");
    } else if (
      nextScenario ===
      "resource_unavailable"
    ) {
      setValue("Engineering");
    } else if (
      nextScenario ===
      "high_priority_request"
    ) {
      setValue("HIGH");
    } else if (
      nextScenario ===
      "block_capacity"
    ) {
      setValue("-20");
    } else {
      setValue("");
    }
  };

  const options =
    scenario === "block_unavailable"
      ? data.blocks
          .filter(
            (b) => b.status === "Available"
          )
          .map((b) => ({
            v: b.block_id,
            l: `${b.block_id} · ${b.corridor_id}`,
          }))
      : scenario ===
        "equipment_unavailable" || scenario === "equipment_availability_reduced"
      ? data.assets.map((a) => ({
          v: a.asset_id,
          l: `${a.asset_id} · ${a.asset_type}`,
        }))
      : scenario === "resource_unavailable"
      ? ["Engineering", "Signal", "Traction"].map(v => ({ v, l: `${v} resources unavailable` }))
      : [];

  return (
    <div className="space-y-4">
      <Header
        icon={SlidersHorizontal}
        title="What-If Simulation"
        subtitle="The scenario is run through a temporary copy of the existing optimizer inputs; production data is not modified."
      />

      <div className={`${card} p-4`}>
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className={input}
            value={scenario}
            onChange={(e) =>
              handleScenarioChange(
                e.target.value
              )
            }
          >
            <option value="block_unavailable">
              Block becomes unavailable
            </option>

            <option value="equipment_unavailable">
              Equipment becomes unavailable
            </option>

            <option value="duration_increase">
              Maintenance duration increases
            </option>
            <option value="equipment_availability_reduced">
              Equipment availability reduced
            </option>
            <option value="resource_unavailable">
              Resource unavailable
            </option>
            <option value="deadline_change">
              Maintenance deadline changes
            </option>

            <option value="high_priority_request">
              High-priority request added
            </option>

            <option value="block_capacity">
              Block capacity changes
            </option>
          </select>

          {options.length > 0 ? (
            <select
              className={input}
              value={value}
              onChange={(e) =>
                setValue(e.target.value)
              }
            >
              {options.map((o) => (
                <option
                  key={o.v}
                  value={o.v}
                >
                  {o.l}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={input}
              value={value}
              onChange={(e) =>
                setValue(e.target.value)
              }
              placeholder={
                scenario ===
                "duration_increase"
                  ? "Enter additional duration"
                  : scenario ===
                    "block_capacity"
                  ? "Enter capacity change"
                  : scenario ===
                    "deadline_change"
                  ? "Days to shift deadline (negative = earlier)"
                  : scenario ===
                    "high_priority_request"
                  ? "Enter priority value"
                  : "Enter scenario value"
              }
            />
          )}

          <button
            onClick={run}
            disabled={loading}
            className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground"
          >
            {loading ? (
              <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
            ) : (
              <SlidersHorizontal className="mr-1 inline h-3.5 w-3.5" />
            )}

            {loading
              ? "Running..."
              : "Run What-If"}
          </button>
        </div>

        {error && (
          <div className="mt-3 text-xs text-danger">
            {error}
          </div>
        )}
      </div>

      {result && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Kpi
              label="Scheduled change"
              value={
                result.impact
                  .scheduled_count_delta
              }
              icon={Activity}
            />

            <Kpi
              label="Unscheduled change"
              value={
                result.impact
                  .unscheduled_tasks_delta
              }
              icon={AlertTriangle}
            />

            <Kpi
              label="Priority coverage change"
              value={`${result.impact.priority_pct_delta > 0 ? "+" : ""}${result.impact.priority_pct_delta}%`}
              icon={Gauge}
            />

            <Kpi
              label="Affected blocks"
              value={
                result.impact
                  .affected_blocks.length
              }
              icon={Route}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PlanSide
              title="CURRENT PLAN"
              result={result.baseline}
            />

            <PlanSide
              title="WHAT-IF PLAN"
              result={result.what_if}
            />
          </div>

          <div className={`${card} p-4`}>
            <h3 className="text-sm font-semibold">
              Operational impact
            </h3>

            <div className="mt-2 text-xs text-muted-foreground">
              {result.impact.affected_blocks
                .length > 0
                ? `Affected blocks: ${result.impact.affected_blocks.join(
                    ", "
                  )}`
                : "No block assignment changed."}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* =========================================================
   PLAN SIDE
========================================================= */

function PlanSide({
  title,
  result,
}: {
  title: string;
  result: OptimizeResult;
}) {
  return (
    <section className={`${card} p-4`}>
      <div className="flex justify-between">
        <h3 className="text-sm font-semibold">
          {title}
        </h3>

        <span className="text-[10px] text-muted-foreground">
          {result.kpis.solver_status}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          Scheduled{" "}
          <b>
            {result.kpis.scheduled_count}
          </b>
        </div>

        <div>
          Unscheduled{" "}
          <b>
            {result.kpis.unscheduled_count}
          </b>
        </div>

        <div>
          Priority covered{" "}
          <b>
            {result.kpis.total_priority_pct}%
          </b>
        </div>

        <div>
          Blocks used{" "}
          <b>{result.kpis.blocks_used}</b>
        </div>
      </div>

      <div className="mt-3 max-h-64 overflow-auto">
        {result.scheduled
          .slice(0, 12)
          .map((x: any) => (
            <div
              key={`${x.task_id}-${x.block_id}`}
              className="border-t border-border/50 py-2 text-[11px]"
            >
              <b>{x.task_id}</b> →{" "}
              {x.block_id}

              <span className="ml-2 text-muted-foreground">
                {x.date} {x.start_time}-
                {x.end_time}
              </span>
            </div>
          ))}
      </div>
    </section>
  );
}

/* =========================================================
   HEADER
========================================================= */

function Header({
  icon: Icon,
  title,
  subtitle,
  live,
}: {
  icon: any;
  title: string;
  subtitle: string;
  live?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
        <Icon className="h-5 w-5 text-primary" />
      </span>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">
            {title}
          </h1>

          {live && (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[9px] font-semibold text-success">
              REFRESHING
            </span>
          )}
        </div>

        <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   BADGE
========================================================= */

function Badge({
  value,
}: {
  value: string;
}) {
  const cls =
    value === "Critical" ||
    value === "High" ||
    value === "Locked"
      ? "bg-danger/15 text-danger"
      : value === "Degraded" ||
        value === "Med"
      ? "bg-warning/15 text-warning"
      : "bg-success/15 text-success";

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {value}
    </span>
  );
}

export default function CoaPage() {
  return (
    <Suspense fallback={null}>
      <CoaPageContent />
    </Suspense>
  );
}
