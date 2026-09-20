"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Gauge,
  Layers,
  Lock,
  PowerOff,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";

import { TopBar } from "@/components/TopBar";

import {
  AssetRecord,
  MaintenanceTask,
  NetworkCorridor,
  MaintenanceRequest,
  fetchAssetsDataset,
  fetchDataset,
  fetchNetworkDataset,
  fetchMaintenanceRequests,
  createMaintenanceRequest,
} from "@/lib/api";

import { useAuth, Department, DEPARTMENT_LABELS } from "@/lib/auth";

/* ========================================================================== */
/* TYPES                                                                      */
/* ========================================================================== */

type ViewId =
  | "dashboard"
  | "report-problem"
  | "maintenance"
  | "assets"
  | "history"
  | "recommendations"
  | "power-sections";

type HorizonId = "weekly" | "monthly";

type SortKey = "priority" | "safety" | "overdue" | "duration" | "corridor";

type ProblemForm = {
  assetId: string;
  locationKm: string;
  defectType: string;
  maintenanceType: string;
  criticality: number;
  urgency: number;
  safetyRisk: number;
  durationHrs: number;
  crewRequired: number;
};

type QueueItem = {
  id: string;
  assetId: string;
  assetLabel: string;
  corridorId: string;
  defectType: string;
  maintenanceType: string;
  criticality: number;
  urgency: number;
  safetyRisk: number;
  overdueDays: number;
  durationMin: number;
  crewRequired: number;
  status: string;
  source: "TDMS" | "NEW";
  requestId?: string | number;
};

type WizardStep = { id: number; label: string };

/* ========================================================================== */
/* CONSTANTS                                                                  */
/* ========================================================================== */

/**
 * Access policy for this module.
 *
 * TRACTION  -> owner of TDMS. Full read + write (report problems, plan blocks).
 * COA/ADMIN -> oversight. Can see every departmental dashboard, TDMS included.
 * TMS/SMMS  -> no access. They have their own departmental modules.
 */
const TDMS_OWNER: Department = "TRACTION";
const TDMS_OVERSIGHT: Department[] = ["COA", "ADMIN"];

/** How many rows each table shows before "Show all". */
const PREVIEW_ROWS = 5;

const HORIZONS: { id: HorizonId; label: string; days: number; hours: number }[] =
  [
    { id: "weekly", label: "Weekly", days: 7, hours: 168 },
    { id: "monthly", label: "Monthly", days: 30, hours: 720 },
  ];

const VIEW_TITLES: Record<ViewId, string> = {
  dashboard: "Traction Control Overview",
  "report-problem": "Report Traction Problem",
  maintenance: "Maintenance Tasks",
  assets: "Traction Assets",
  history: "Maintenance History",
  recommendations: "AI Recommendations",
  "power-sections": "Power Sections",
};

const EMPTY_FORM: ProblemForm = {
  assetId: "",
  locationKm: "",
  defectType: "OHE Wire Sag",
  maintenanceType: "Corrective",
  criticality: 5,
  urgency: 5,
  safetyRisk: 5,
  durationHrs: 2,
  crewRequired: 5,
};

const DEFECT_TYPES = [
  "OHE Wire Sag",
  "Catenary Damage",
  "Pole Damage",
  "Insulator Failure",
  "Feeder Fault",
];

const MAINTENANCE_TYPES = [
  "Preventive",
  "Predictive",
  "Corrective",
  "Emergency",
];

/** The 4 wizard steps on the Report Problem page. */
const REPORT_STEPS: WizardStep[] = [
  { id: 1, label: "Problem" },
  { id: 2, label: "Maintenance" },
  { id: 3, label: "Resources & Block" },
  { id: 4, label: "AI Review" },
];

/** Pipeline bar shown above the wizard. */
const PIPELINE = [
  "Problem",
  "AI Analysis",
  "Recommended Maintenance",
  "Resources",
  "Block Readiness",
  "Request to COA",
];

/** How many pipeline stages are highlighted for each wizard step. */
const PIPELINE_LIT: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 6 };

/** Label on the "next" button for each wizard step. */
const NEXT_LABELS: Record<number, string> = {
  1: "Continue to Maintenance",
  2: "Continue to Resources",
  3: "Continue to AI Review",
};

/**
 * Traction work on live 25 kV equipment cannot start on a traffic block alone —
 * it also needs an OHE power block (isolation + earthing) cleared by the
 * Traction Power Controller. These defect classes touch live equipment.
 */
const POWER_BLOCK_DEFECTS = [
  "OHE Wire Sag",
  "Catenary Damage",
  "Insulator Failure",
  "Feeder Fault",
];

const OVERDUE_BUCKETS = [
  { id: "1-7", label: "1–7 days", min: 1, max: 7 },
  { id: "8-30", label: "8–30 days", min: 8, max: 30 },
  { id: "31-90", label: "31–90 days", min: 31, max: 90 },
  { id: "90+", label: "Over 90 days", min: 91, max: Infinity },
];

/* ========================================================================== */
/* PURE HELPERS                                                               */
/* ========================================================================== */

function priorityScore(item: QueueItem) {
  return (
    item.criticality * 4 +
    item.urgency * 3 +
    item.safetyRisk * 4 +
    item.overdueDays * 2
  );
}

function priorityLabel(score: number) {
  if (score >= 45) return "CRITICAL";
  if (score >= 32) return "HIGH";
  if (score >= 20) return "MEDIUM";
  return "LOW";
}

function priorityClass(priority: string) {
  if (priority === "CRITICAL") return "border-danger/25 bg-danger/10 text-danger";
  if (priority === "HIGH") return "border-warning/25 bg-warning/10 text-warning";
  if (priority === "MEDIUM") return "border-info/25 bg-info/10 text-info";
  return "border-success/25 bg-success/10 text-success";
}

function riskLabel(value: number) {
  if (value >= 0.8) return "High";
  if (value >= 0.6) return "Moderate";
  return "Lower";
}

function riskClass(value: number) {
  if (value >= 0.8) return "border-danger/25 bg-danger/10 text-danger";
  if (value >= 0.6) return "border-warning/25 bg-warning/10 text-warning";
  return "border-success/25 bg-success/10 text-success";
}

function statusClass(status: string) {
  const value = status.toLowerCase();
  if (value === "critical") return "border-danger/25 bg-danger/10 text-danger";
  if (value === "degraded") return "border-warning/25 bg-warning/10 text-warning";
  if (value === "completed") return "border-success/25 bg-success/10 text-success";
  return "border-border bg-muted/40 text-muted-foreground";
}

function trafficClass(density: string) {
  if (density === "High") return "border-danger/25 bg-danger/10 text-danger";
  if (density === "Med") return "border-warning/25 bg-warning/10 text-warning";
  return "border-success/25 bg-success/10 text-success";
}

/** Does this task need an OHE power block (isolation + earthing), not just a traffic block? */
function needsPowerBlock(item: QueueItem) {
  return (
    POWER_BLOCK_DEFECTS.includes(item.defectType) ||
    item.maintenanceType === "Emergency"
  );
}

function buildQueue(
  tasks: MaintenanceTask[],
  requests: MaintenanceRequest[]
): QueueItem[] {
  const existing: QueueItem[] = tasks
    .filter((task) => task.status !== "Completed")
    .map((task) => ({
      id: task.task_id,
      assetId: task.asset_id,
      assetLabel: task.asset_id,
      corridorId: task.corridor_id,
      defectType: task.defect_type,
      maintenanceType: task.maintenance_type,
      criticality: Number(task.criticality),
      urgency: Number(task.urgency),
      safetyRisk: Number(task.safety_risk),
      overdueDays: Number(task.overdue_days),
      durationMin: Number(task.estimated_duration_min),
      crewRequired: Number(task.crew_required),
      status: task.status,
      source: "TDMS" as const,
    }));

  const newlyReported: QueueItem[] = requests.map((request) => ({
    id: `REQ-${request.id}`,
    assetId: request.asset_id,
    assetLabel: request.asset_label || request.asset_id,
    corridorId: request.corridor_id,
    defectType: request.defect_type || request.maintenance_type || "Maintenance",
    maintenanceType: request.maintenance_type || "Corrective",
    criticality: Number(request.criticality ?? 3),
    urgency: Number(request.urgency ?? 3),
    safetyRisk: Number(request.safety_risk ?? 3),
    overdueDays: 0,
    durationMin: Math.round(Number(request.required_duration_hrs || 1) * 60),
    crewRequired: Number(request.crew_required ?? 1),
    status: request.status,
    source: "NEW" as const,
    requestId: request.id,
  }));

  return [...newlyReported, ...existing].sort(
    (a, b) => priorityScore(b) - priorityScore(a)
  );
}

function sortQueue(items: QueueItem[], key: SortKey, dir: "asc" | "desc") {
  const factor = dir === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    if (key === "corridor") {
      return a.corridorId.localeCompare(b.corridorId) * factor;
    }

    const value = (item: QueueItem) =>
      key === "priority"
        ? priorityScore(item)
        : key === "safety"
        ? item.safetyRisk
        : key === "overdue"
        ? item.overdueDays
        : item.durationMin;

    return (value(a) - value(b)) * factor;
  });
}

/* ========================================================================== */
/* PAGE                                                                       */
/* ========================================================================== */

export default function TDMSPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { user, ready } = useAuth();

  const rawView = searchParams.get("view") || "dashboard";

  /**
   * "network" is kept as an alias so the existing sidebar href keeps working
   * after the label was changed to Power Sections.
   */
  const view: ViewId = (
    rawView === "network"
      ? "power-sections"
      : [
          "report-problem",
          "maintenance",
          "assets",
          "history",
          "recommendations",
          "power-sections",
        ].includes(rawView)
      ? rawView
      : "dashboard"
  ) as ViewId;

  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [network, setNetwork] = useState<NetworkCorridor[]>([]);
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null);
  const [selectedTask, setSelectedTask] = useState<QueueItem | null>(null);
  const [selectedCorridor, setSelectedCorridor] =
    useState<NetworkCorridor | null>(null);

  const [showImpact, setShowImpact] = useState(false);

  const [form, setForm] = useState<ProblemForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [sendingTaskId, setSendingTaskId] = useState<string | null>(null);
  const [reportStep, setReportStep] = useState(1);

  /* interactive controls */
  const [horizon, setHorizon] = useState<HorizonId>("weekly");
  const [queueSearch, setQueueSearch] = useState("");
  const [queuePriority, setQueuePriority] = useState("ALL");
  const [queueBucket, setQueueBucket] = useState<string | null>(null);
  const [queuePowerOnly, setQueuePowerOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [assetExpanded, setAssetExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [sectionsExpanded, setSectionsExpanded] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetStatus, setAssetStatus] = useState("ALL");
  const [openClub, setOpenClub] = useState<string | null>(null);

  const horizonConfig =
    HORIZONS.find((h) => h.id === horizon) || HORIZONS[0];

  /* ---------------------------------------------------------------------- */
  /* ACCESS                                                                  */
  /* ---------------------------------------------------------------------- */

  const isOwner = user?.department === TDMS_OWNER;
  const isOversight = !!user && TDMS_OVERSIGHT.includes(user.department);
  const canView = isOwner || isOversight;
  const canWrite = isOwner || user?.department === "ADMIN";

  /* ---------------------------------------------------------------------- */
  /* DATA                                                                    */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!ready || !canView) return;

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);

        const [assetData, taskData, networkData, requestData] =
          await Promise.all([
            fetchAssetsDataset(),
            fetchDataset<MaintenanceTask>("tdms_maintenance"),
            fetchNetworkDataset(),
            fetchMaintenanceRequests().catch(() => [] as MaintenanceRequest[]),
          ]);

        if (cancelled) return;

        const tractionAssets = assetData.filter(
          (a) =>
            a.department.toLowerCase() === "traction" ||
            a.department.toLowerCase() === "tdms"
        );

        setAssets(tractionAssets);
        setTasks(taskData);
        setNetwork(networkData);
        setRequests(requestData);

        if (tractionAssets.length) {
          setForm((previous) => ({
            ...previous,
            assetId: previous.assetId || tractionAssets[0].asset_id,
            locationKm:
              previous.locationKm || String(tractionAssets[0].location_km),
          }));
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(
            "Could not load TDMS data. Check that the backend is running on the configured API base."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [ready, canView]);

  /* ---------------------------------------------------------------------- */
  /* DERIVED                                                                 */
  /* ---------------------------------------------------------------------- */

  const queue = useMemo(() => buildQueue(tasks, requests), [tasks, requests]);

  const filteredQueue = useMemo(() => {
    const term = queueSearch.trim().toLowerCase();
    const bucket = OVERDUE_BUCKETS.find((b) => b.id === queueBucket);

    const filtered = queue.filter((item) => {
      if (
        queuePriority !== "ALL" &&
        priorityLabel(priorityScore(item)) !== queuePriority
      )
        return false;

      if (queuePowerOnly && !needsPowerBlock(item)) return false;

      if (
        bucket &&
        (item.overdueDays < bucket.min || item.overdueDays > bucket.max)
      )
        return false;

      if (!term) return true;

      return (
        item.id.toLowerCase().includes(term) ||
        item.assetLabel.toLowerCase().includes(term) ||
        item.corridorId.toLowerCase().includes(term) ||
        item.defectType.toLowerCase().includes(term)
      );
    });

    return sortQueue(filtered, sortKey, sortDir);
  }, [
    queue,
    queueSearch,
    queuePriority,
    queueBucket,
    queuePowerOnly,
    sortKey,
    sortDir,
  ]);

  const filteredAssets = useMemo(() => {
    const term = assetSearch.trim().toLowerCase();

    return assets.filter((asset) => {
      if (assetStatus !== "ALL" && asset.current_status !== assetStatus)
        return false;

      if (!term) return true;

      return (
        asset.asset_id.toLowerCase().includes(term) ||
        asset.asset_type.toLowerCase().includes(term) ||
        asset.corridor_id.toLowerCase().includes(term)
      );
    });
  }, [assets, assetSearch, assetStatus]);

  const highRiskAssets = assets.filter((a) => a.failure_risk >= 0.6);
  const criticalAssets = assets.filter((a) => a.current_status === "Critical");
  const completedTasks = tasks.filter((t) => t.status === "Completed");
  const safetyCriticalTasks = queue.filter((t) => t.safetyRisk >= 4);
  const overdueItems = queue.filter((t) => t.overdueDays > 0);

  const fleetHealthPct = assets.length
    ? Math.round(
        (assets.filter(
          (a) => a.current_status !== "Critical" && a.failure_risk < 0.6
        ).length /
          assets.length) *
          100
      )
    : 0;

  const avgAvailabilityTarget = assets.length
    ? Math.round(
        assets.reduce((sum, a) => sum + a.availability_target_pct, 0) /
          assets.length
      )
    : 0;

  /* --- power block workload ---------------------------------------------- */
  const powerBlockItems = queue.filter(needsPowerBlock);

  const powerBlockBySection = useMemo(() => {
    const map = new Map<string, QueueItem[]>();

    powerBlockItems.forEach((item) => {
      const list = map.get(item.corridorId) || [];
      list.push(item);
      map.set(item.corridorId, list);
    });

    return [...map.entries()]
      .map(([corridorId, items]) => ({
        corridorId,
        items,
        totalMin: items.reduce((sum, i) => sum + i.durationMin, 0),
        maxSafety: Math.max(...items.map((i) => i.safetyRisk)),
        traffic:
          network.find((n) => n.corridor_id === corridorId)?.traffic_density ||
          "Unknown",
      }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [powerBlockItems, network]);

  /* --- block clubbing ----------------------------------------------------- */
  /**
   * Two or more traction tasks on the same corridor can share a single block:
   * one isolation, one traffic disruption. Serial time is what they cost if
   * planned separately; clubbed time assumes parallel crews within one window.
   */
  const clubbingGroups = useMemo(
    () =>
      powerBlockBySection
        .filter((group) => group.items.length >= 2)
        .map((group) => {
          const serialMin = group.totalMin;
          const clubbedMin = Math.max(...group.items.map((i) => i.durationMin));
          const crew = group.items.reduce((sum, i) => sum + i.crewRequired, 0);

          return {
            ...group,
            serialMin,
            clubbedMin,
            savedMin: serialMin - clubbedMin,
            blocksSaved: group.items.length - 1,
            crew,
          };
        })
        .sort((a, b) => b.savedMin - a.savedMin),
    [powerBlockBySection]
  );

  const totalBlocksSaved = clubbingGroups.reduce(
    (sum, g) => sum + g.blocksSaved,
    0
  );
  const totalHoursSaved =
    Math.round(
      (clubbingGroups.reduce((sum, g) => sum + g.savedMin, 0) / 60) * 10
    ) / 10;

  /* --- horizon capacity --------------------------------------------------- */
  /**
   * Traction blocks realistically only run in night windows. Assume one usable
   * ~4 h window per corridor per night across the selected horizon.
   */
  const corridorsWithWork = new Set(queue.map((i) => i.corridorId)).size;
  const capacityHours = corridorsWithWork * horizonConfig.days * 4;
  const demandHours =
    Math.round((queue.reduce((sum, i) => sum + i.durationMin, 0) / 60) * 10) /
    10;
  const capacityUsedPct = capacityHours
    ? Math.min(Math.round((demandHours / capacityHours) * 100), 999)
    : 0;
  const crewHours =
    Math.round(
      (queue.reduce((sum, i) => sum + (i.durationMin / 60) * i.crewRequired, 0)) *
        10
    ) / 10;

  /* --- overdue ageing ----------------------------------------------------- */
  const overdueBuckets = OVERDUE_BUCKETS.map((bucket) => ({
    ...bucket,
    count: queue.filter(
      (item) => item.overdueDays >= bucket.min && item.overdueDays <= bucket.max
    ).length,
  }));

  const maxBucket = Math.max(...overdueBuckets.map((b) => b.count), 1);

  /* --- chart data --------------------------------------------------------- */
  const priorityMix = [
    { label: "CRITICAL", strokeClass: "stroke-danger", dotClass: "bg-danger" },
    { label: "HIGH", strokeClass: "stroke-warning", dotClass: "bg-warning" },
    { label: "MEDIUM", strokeClass: "stroke-info", dotClass: "bg-info" },
    { label: "LOW", strokeClass: "stroke-success", dotClass: "bg-success" },
  ].map((band) => ({
    ...band,
    value: queue.filter(
      (item) => priorityLabel(priorityScore(item)) === band.label
    ).length,
  }));

  const blockTypeMix = [
    {
      label: "Power block (isolation)",
      value: powerBlockItems.length,
      strokeClass: "stroke-warning",
      dotClass: "bg-warning",
    },
    {
      label: "Traffic block only",
      value: queue.length - powerBlockItems.length,
      strokeClass: "stroke-info",
      dotClass: "bg-info",
    },
  ];

  /* --- availability compliance -------------------------------------------- */
  /**
   * Projected availability = horizon hours minus the open maintenance hours
   * already booked against that asset, expressed as a percentage, then compared
   * with the asset's contractual availability target.
   */
  const availabilityWatch = useMemo(
    () =>
      assets
        .map((asset) => {
          const openMin = queue
            .filter((item) => item.assetId === asset.asset_id)
            .reduce((sum, item) => sum + item.durationMin, 0);

          const projected =
            100 - (openMin / 60 / horizonConfig.hours) * 100;

          return {
            asset,
            projected,
            gap: projected - asset.availability_target_pct,
            openMin,
          };
        })
        .filter((row) => row.openMin > 0)
        .sort((a, b) => a.gap - b.gap),
    [assets, queue, horizonConfig.hours]
  );

  const breachingAssets = availabilityWatch.filter((row) => row.gap < 0);

  const selectedAssetTasks = selectedAsset
    ? tasks.filter((task) => task.asset_id === selectedAsset.asset_id)
    : [];

  const riskWatch = [...assets]
    .sort((a, b) => {
      const scoreA = a.failure_risk * 0.6 + (a.asset_criticality / 5) * 0.4;
      const scoreB = b.failure_risk * 0.6 + (b.asset_criticality / 5) * 0.4;
      return scoreB - scoreA;
    })
    .slice(0, PREVIEW_ROWS);

  const corridorStats = useMemo(
    () =>
      network.map((corridor) => {
        const corridorAssets = assets.filter(
          (a) => a.corridor_id === corridor.corridor_id
        );

        const corridorTasks = tasks.filter(
          (t) =>
            t.corridor_id === corridor.corridor_id && t.status !== "Completed"
        );

        const critical = corridorAssets.filter(
          (a) => a.current_status === "Critical"
        ).length;

        const safetyCritical = corridorTasks.filter(
          (t) => t.safety_risk >= 4
        ).length;

        const averageRisk = corridorAssets.length
          ? corridorAssets.reduce((sum, a) => sum + a.failure_risk, 0) /
            corridorAssets.length
          : 0;

        const attention =
          averageRisk * 0.35 +
          Math.min(corridorTasks.length / 10, 1) * 0.25 +
          Math.min(critical / 5, 1) * 0.25 +
          Math.min(safetyCritical / 5, 1) * 0.15;

        return {
          corridor,
          assets: corridorAssets,
          tasks: corridorTasks,
          critical,
          safetyCritical,
          averageRisk,
          attention,
        };
      }),
    [network, assets, tasks]
  );

  const importantCorridors = [...corridorStats]
    .sort((a, b) => b.attention - a.attention)
    .slice(0, PREVIEW_ROWS);

  const heatCells = [...corridorStats]
    .filter((item) => item.assets.length > 0)
    .sort((a, b) => b.attention - a.attention)
    .map((item) => ({
      id: item.corridor.corridor_id,
      label: item.corridor.corridor_id,
      attention: item.attention,
      openTasks: item.tasks.length,
      critical: item.critical,
    }));

  const maintenanceTypeCounts = MAINTENANCE_TYPES.map((type) => ({
    label: type,
    value: tasks.filter((task) => task.maintenance_type === type).length,
  }));

  const defectCounts = DEFECT_TYPES.map((type) => ({
    label: type,
    value: tasks.filter((task) => task.defect_type === type).length,
  })).sort((a, b) => b.value - a.value);

  /* --- report problem wizard --------------------------------------------- */
  /**
   * NOTE: named formScore (not priorityScore) so it does not shadow the
   * priorityScore(item) helper used everywhere else in this file.
   */
  const formScore =
    form.criticality * 4 + form.urgency * 3 + form.safetyRisk * 4;
  const formPriority = priorityLabel(formScore);
  const formAsset = assets.find((a) => a.asset_id === form.assetId);

  /** A step must be valid before its "Continue" button is enabled. */
  const stepValid =
    reportStep === 1
      ? Boolean(form.assetId) &&
        Boolean(form.defectType) &&
        form.locationKm.trim() !== ""
      : reportStep === 2
      ? Boolean(form.maintenanceType) && form.durationHrs > 0
      : reportStep === 3
      ? form.crewRequired > 0
      : true;

  const goNext = () =>
    setReportStep((s) => Math.min(s + 1, REPORT_STEPS.length));
  const goBack = () => setReportStep((s) => Math.max(s - 1, 1));

  /* ---------------------------------------------------------------------- */
  /* ACTIONS                                                                 */
  /* ---------------------------------------------------------------------- */

  function go(next: ViewId) {
    router.push(next === "dashboard" ? "/tdms" : `/tdms?view=${next}`);
  }

  function selectAsset(asset: AssetRecord) {
    setSelectedAsset(asset);
    setMessage(null);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  /** Jump to the queue with a filter already applied. */
  function drillToQueue(options: {
    bucket?: string | null;
    priority?: string;
    powerOnly?: boolean;
  }) {
    setQueueBucket(options.bucket ?? null);
    setQueuePriority(options.priority ?? "ALL");
    setQueuePowerOnly(options.powerOnly ?? false);
    setQueueExpanded(true);
    go("maintenance");
  }

  function clearQueueFilters() {
    setQueueSearch("");
    setQueuePriority("ALL");
    setQueueBucket(null);
    setQueuePowerOnly(false);
  }

  function handleFormAssetChange(assetId: string) {
    const asset = assets.find((a) => a.asset_id === assetId);

    setForm((previous) => ({
      ...previous,
      assetId,
      locationKm: asset ? String(asset.location_km) : "",
    }));
  }

  async function submitProblem() {
    const asset = assets.find((a) => a.asset_id === form.assetId);

    if (!asset) {
      setError("Please select a traction asset.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const score = form.criticality * 4 + form.urgency * 3 + form.safetyRisk * 4;
      const priority = score >= 45 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";

      const request = await createMaintenanceRequest({
        asset_id: asset.asset_id,
        asset_label: `${asset.asset_id} • ${asset.asset_type}`,
        corridor_id: asset.corridor_id,
        maintenance_type: form.maintenanceType,
        defect_type: form.defectType,
        location_km: Number(form.locationKm),
        criticality: form.criticality,
        urgency: form.urgency,
        safety_risk: form.safetyRisk,
        crew_required: form.crewRequired,
        required_duration_hrs: form.durationHrs,
        priority,
        preferred_date: undefined,
        time_window: "Anytime (00:00-23:59)",
        reported_by: user?.username || "traction_user",
      });

      setRequests((previous) => [request, ...previous]);

      setMessage(
        `Problem reported. Request #${request.id} entered the TDMS priority queue.`
      );

      setForm({
        ...EMPTY_FORM,
        assetId: asset.asset_id,
        locationKm: String(asset.location_km),
      });

      setReportStep(1);

      go("maintenance");
    } catch (err) {
      console.error(err);
      setError("Could not submit the maintenance problem.");
    } finally {
      setSubmitting(false);
    }
  }

  async function sendToBlockPlanner(item: QueueItem) {
    setSendingTaskId(item.id);
    setError(null);

    try {
      let requestId = item.requestId;

      if (!requestId) {
        const label = priorityLabel(priorityScore(item));

        const request = await createMaintenanceRequest({
          asset_id: item.assetId,
          asset_label: item.assetLabel,
          corridor_id: item.corridorId,
          maintenance_type: item.maintenanceType,
          defect_type: item.defectType,
          location_km: undefined,
          criticality: item.criticality,
          urgency: item.urgency,
          safety_risk: item.safetyRisk,
          crew_required: item.crewRequired,
          required_duration_hrs: Math.max(item.durationMin / 60, 0.5),
          priority: label === "CRITICAL" ? "HIGH" : label,
          time_window: "Anytime (00:00-23:59)",
          reported_by: user?.username || "traction_user",
        });

        requestId = request.id;
        setRequests((previous) => [request, ...previous]);
      }

      router.push(`/blocks/generate?requestId=${requestId}`);
    } catch (err) {
      console.error(err);
      setError("Could not send this maintenance request to the Block Planner.");
    } finally {
      setSendingTaskId(null);
    }
  }

  function checkImpact(item: QueueItem) {
    setSelectedTask(item);
    setShowImpact(true);
  }

  /* ---------------------------------------------------------------------- */
  /* GUARDS (after every hook, so hook order never changes)                  */
  /* ---------------------------------------------------------------------- */

  if (!ready) {
    return <ShellMessage title="TDMS" text="Checking your session…" />;
  }

  if (!canView) {
    return (
      <AccessDenied
        department={user?.department}
        onBack={() => router.push("/")}
      />
    );
  }

  if (loading) {
    return (
      <ShellMessage
        title="TDMS • Traction Intelligence"
        text="Loading traction maintenance intelligence…"
      />
    );
  }

  const visibleQueue = queueExpanded
    ? filteredQueue
    : filteredQueue.slice(0, PREVIEW_ROWS);

  const visibleAssets = assetExpanded
    ? filteredAssets
    : filteredAssets.slice(0, PREVIEW_ROWS);

  const visibleHistory = historyExpanded
    ? completedTasks.slice(0, 50)
    : completedTasks.slice(0, PREVIEW_ROWS);

  const filtersActive =
    !!queueSearch || queuePriority !== "ALL" || !!queueBucket || queuePowerOnly;

  /* ---------------------------------------------------------------------- */
  /* RENDER                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar
        title="TDMS • Traction Distribution"
        subtitle="Asset health, power-block readiness and maintenance scheduling"
      />

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <Banner tone="danger" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        {message && (
          <Banner tone="success" onDismiss={() => setMessage(null)}>
            {message}
          </Banner>
        )}

        {isOversight && !isOwner && (
          <Banner tone="info">
            Oversight view — you are seeing the Traction department&apos;s module
            as {DEPARTMENT_LABELS[user!.department]}. Reporting new traction
            defects is done by the Traction department.
          </Banner>
        )}

        {/* PAGE HEADER --------------------------------------------------- */}
        <header className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/15">
              <Zap className="h-4 w-4 text-info" />
            </span>

            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight">
                {VIEW_TITLES[view]}
              </h2>
              <p className="text-xs text-muted-foreground">
                {assets.length} traction assets · {queue.length} open tasks ·{" "}
                {powerBlockItems.length} need an OHE power block
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {view === "report-problem" ? (
              <button
                onClick={() => go("dashboard")}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : (
              <HorizonToggle value={horizon} onChange={setHorizon} />
            )}
          </div>
        </header>

        {/* KPI STRIP ----------------------------------------------------- */}
        {view !== "report-problem" && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              title="Traction Assets"
              value={assets.length}
              caption={`${avgAvailabilityTarget}% avg availability target`}
              icon={<Zap className="h-4 w-4" />}
              onClick={() => go("assets")}
            />
            <KpiCard
              title="Fleet Health"
              value={`${fleetHealthPct}%`}
              caption="Assets outside the risk band"
              tone={
                fleetHealthPct >= 75
                  ? "success"
                  : fleetHealthPct >= 50
                  ? "warning"
                  : "danger"
              }
              icon={<Activity className="h-4 w-4" />}
              onClick={() => go("assets")}
            />
            <KpiCard
              title="High-Risk Assets"
              value={highRiskAssets.length}
              caption={`${criticalAssets.length} in Critical status`}
              tone={highRiskAssets.length ? "warning" : "success"}
              icon={<Gauge className="h-4 w-4" />}
              onClick={() => go("assets")}
            />
            <KpiCard
              title="Power Blocks Needed"
              value={powerBlockItems.length}
              caption="Tasks requiring OHE isolation"
              tone={powerBlockItems.length ? "warning" : "success"}
              icon={<PowerOff className="h-4 w-4" />}
              onClick={() => drillToQueue({ powerOnly: true })}
            />
            <KpiCard
              title="Open Tasks"
              value={queue.length}
              caption={`${safetyCriticalTasks.length} safety-critical`}
              icon={<ClipboardList className="h-4 w-4" />}
              onClick={() => drillToQueue({})}
            />
            <KpiCard
              title="Overdue"
              value={overdueItems.length}
              caption="Past scheduled due date"
              tone={overdueItems.length ? "danger" : "success"}
              icon={<CalendarClock className="h-4 w-4" />}
              onClick={() => drillToQueue({ bucket: null, priority: "ALL" })}
            />
          </div>
        )}

        {/* ============================ OVERVIEW ========================= */}
        {view === "dashboard" && (
          <>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* CAPACITY GAUGE */}
              <Card
                title={`${horizonConfig.label} Block Capacity`}
                description={`Demand against night windows over ${horizonConfig.days} days.`}
              >
                <div className="mt-1 flex flex-col items-center">
                  <CapacityGauge
                    value={capacityUsedPct}
                    tone={
                      capacityUsedPct > 90
                        ? "danger"
                        : capacityUsedPct > 65
                        ? "warning"
                        : "success"
                    }
                  />

                  <div className="-mt-2 text-center text-[11px] text-muted-foreground">
                    {demandHours} h demand · {capacityHours} h available
                  </div>

                  <div className="mt-3 grid w-full grid-cols-2 gap-2">
                    <MiniStat
                      label="Crew-hours"
                      value={crewHours}
                      icon={<Users className="h-3.5 w-3.5" />}
                    />
                    <MiniStat
                      label="Corridors"
                      value={corridorsWithWork}
                      icon={<Layers className="h-3.5 w-3.5" />}
                    />
                  </div>
                </div>
              </Card>

              {/* PRIORITY MIX */}
              <Card
                title="Priority Mix"
                description="Open traction work by computed priority. Select a band to open it."
              >
                <div className="mt-1 flex items-center gap-3">
                  <Donut
                    segments={priorityMix}
                    centerValue={queue.length}
                    centerLabel="open tasks"
                  />

                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {priorityMix.map((segment) => (
                      <button
                        key={segment.label}
                        onClick={() => drillToQueue({ priority: segment.label })}
                        disabled={!segment.value}
                        className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-[11px] hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
                      >
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full ${segment.dotClass}`}
                          />
                          {segment.label}
                        </span>
                        <span className="font-medium tabular-nums">
                          {segment.value}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </Card>

              {/* BLOCK TYPE SPLIT */}
              <Card
                title="Block Type Split"
                description="Work on live 25 kV equipment needs a TPC power block, not just a traffic block."
              >
                <div className="mt-1 flex items-center gap-3">
                  <Donut
                    segments={blockTypeMix}
                    centerValue={powerBlockItems.length}
                    centerLabel="power blocks"
                  />

                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {blockTypeMix.map((segment) => (
                      <div
                        key={segment.label}
                        className="flex items-center justify-between gap-2 px-1.5 text-[11px]"
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${segment.dotClass}`}
                          />
                          <span className="truncate">{segment.label}</span>
                        </span>
                        <span className="font-medium tabular-nums">
                          {segment.value}
                        </span>
                      </div>
                    ))}

                    <button
                      onClick={() => go("recommendations")}
                      className="mt-1 rounded-md border border-success/25 bg-success/10 px-2 py-1.5 text-left text-[10px] text-success hover:bg-success/15"
                    >
                      <span className="font-semibold tabular-nums">
                        {totalBlocksSaved} blocks · {totalHoursSaved} h
                      </span>{" "}
                      saveable by clubbing
                    </button>
                  </div>
                </div>
              </Card>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* CORRIDOR HEAT MAP */}
              <Card
                className="lg:col-span-2"
                title="Corridor Workload Heat Map"
                description="Every corridor carrying traction assets, shaded by attention score. Darker means more risk, more open work and more safety-critical tasks. Click to inspect."
              >
                <HeatGrid
                  cells={heatCells}
                  onSelect={(corridorId) => {
                    const corridor = network.find(
                      (n) => n.corridor_id === corridorId
                    );
                    if (corridor) setSelectedCorridor(corridor);
                  }}
                />
              </Card>

              {/* OVERDUE AGEING */}
              <Card
                title="Overdue Ageing"
                description="How long overdue work has waited. Select a band to open it."
              >
                <div className="mt-4 flex flex-col gap-3">
                  {overdueBuckets.map((bucket) => (
                    <button
                      key={bucket.id}
                      onClick={() => drillToQueue({ bucket: bucket.id })}
                      disabled={!bucket.count}
                      className="group text-left disabled:cursor-default disabled:opacity-40"
                    >
                      <div className="mb-1 flex justify-between text-[11px]">
                        <span className="group-enabled:group-hover:text-primary">
                          {bucket.label}
                        </span>
                        <span className="font-medium tabular-nums">
                          {bucket.count}
                        </span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            bucket.id === "90+"
                              ? "bg-danger"
                              : bucket.id === "31-90"
                              ? "bg-warning"
                              : "bg-info"
                          }`}
                          style={{
                            width: `${(bucket.count / maxBucket) * 100}%`,
                          }}
                        />
                      </div>
                    </button>
                  ))}

                  {!overdueItems.length && (
                    <EmptyState text="Nothing is currently overdue." />
                  )}

                  <button
                    onClick={() => drillToQueue({})}
                    className="mt-1 flex items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Open the full task list
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </Card>
            </div>
          </>
        )}
        {/* ========================= MAINTENANCE ========================= */}
        {view === "maintenance" && (
          <>
            <Card
              className="mt-5"
              title="TDMS Maintenance Priority Queue"
              description="Ranked by criticality, urgency, safety risk and overdue days. Click a column header to re-sort."
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <SearchBox
                    value={queueSearch}
                    onChange={setQueueSearch}
                    placeholder="Task, asset, corridor…"
                  />

                  <select
                    value={queuePriority}
                    onChange={(e) => setQueuePriority(e.target.value)}
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                  >
                    <option value="ALL">All priorities</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>

                  <button
                    onClick={() => setQueuePowerOnly(!queuePowerOnly)}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      queuePowerOnly
                        ? "border-warning/40 bg-warning/10 text-warning"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <PowerOff className="h-3 w-3" />
                    Power block
                  </button>
                </div>
              }
            >
              {filtersActive && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground">
                    Showing {filteredQueue.length} of {queue.length}
                  </span>

                  {queueBucket && (
                    <Pill className="border-info/25 bg-info/10 text-info">
                      Overdue{" "}
                      {
                        OVERDUE_BUCKETS.find((b) => b.id === queueBucket)?.label
                      }
                    </Pill>
                  )}

                  <button
                    onClick={clearQueueFilters}
                    className="rounded border border-border px-2 py-0.5 hover:bg-muted"
                  >
                    Clear filters
                  </button>
                </div>
              )}

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-2 py-3 font-medium">Task</th>
                      <th className="px-2 py-3 font-medium">Asset</th>
                      <th className="px-2 py-3 font-medium">Problem</th>
                      <SortableTh
                        label="Corridor"
                        column="corridor"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Safety"
                        column="safety"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Overdue"
                        column="overdue"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Duration"
                        column="duration"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Priority"
                        column="priority"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <th className="px-2 py-3 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleQueue.map((item) => {
                      const priority = priorityLabel(priorityScore(item));

                      return (
                        <tr
                          key={item.id}
                          className="border-b border-border/50 transition-colors hover:bg-muted/20"
                        >
                          <td className="px-2 py-3 font-medium">
                            {item.id}
                            {item.source === "NEW" && (
                              <div className="mt-0.5 text-[9px] font-semibold text-primary">
                                NEW REPORT
                              </div>
                            )}
                          </td>

                          <td className="px-2 py-3">{item.assetLabel}</td>

                          <td className="px-2 py-3">
                            <div className="flex items-center gap-1.5">
                              {item.defectType}
                              {needsPowerBlock(item) && (
                                <PowerOff
                                  className="h-3 w-3 text-warning"
                                  aria-label="Needs OHE power block"
                                />
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {item.maintenanceType}
                            </div>
                          </td>

                          <td className="px-2 py-3">{item.corridorId}</td>
                          <td className="px-2 py-3">{item.safetyRisk}/5</td>

                          <td className="px-2 py-3">
                            {item.overdueDays > 0 ? (
                              <span className="text-danger">
                                {item.overdueDays}d
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>

                          <td className="px-2 py-3 tabular-nums">
                            {Math.round((item.durationMin / 60) * 10) / 10} h
                          </td>

                          <td className="px-2 py-3">
                            <Pill className={priorityClass(priority)}>
                              {priority}
                            </Pill>
                          </td>

                          <td className="px-2 py-3">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  const asset = assets.find(
                                    (a) => a.asset_id === item.assetId
                                  );
                                  if (asset) selectAsset(asset);
                                  setSelectedTask(item);
                                }}
                                className="rounded border border-border px-2 py-1 hover:bg-muted"
                              >
                                View
                              </button>

                              <button
                                onClick={() => checkImpact(item)}
                                className="rounded border border-info/30 bg-info/5 px-2 py-1 text-info hover:bg-info/10"
                              >
                                Impact
                              </button>

                              <button
                                onClick={() => sendToBlockPlanner(item)}
                                disabled={sendingTaskId === item.id}
                                className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-primary-foreground hover:opacity-90 disabled:opacity-50"
                              >
                                {sendingTaskId === item.id
                                  ? "Opening…"
                                  : "Plan Block"}
                                <ArrowRight className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {!filteredQueue.length && (
                  <EmptyState
                    text={
                      queue.length
                        ? "No maintenance tasks match the current filters."
                        : "No TDMS maintenance tasks are currently available."
                    }
                  />
                )}

                <ShowMore
                  total={filteredQueue.length}
                  shown={visibleQueue.length}
                  expanded={queueExpanded}
                  onToggle={() => setQueueExpanded(!queueExpanded)}
                  noun="tasks"
                />
              </div>
            </Card>

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card
                title="Workload by Maintenance Type"
                description="Preventive and predictive work is schedulable; corrective and emergency work compresses the planning window."
              >
                <BarList items={maintenanceTypeCounts} />
              </Card>

              <Card
                title="Defect Profile"
                description="Traction defect classes currently represented in the TDMS data."
              >
                <BarList items={defectCounts} />
              </Card>
            </div>
          </>
        )}

        {/* ============================ ASSETS =========================== */}
        {view === "assets" && (
          <>
            <Card
              className="mt-5"
              title="Asset Criticality vs Failure Risk"
              description="Each point is a traction asset. Move right for higher current risk, up for higher operational criticality. Hover a point for details, click to open the asset."
            >
              <RiskMatrix assets={assets} onSelect={selectAsset} />
            </Card>

            <Card
              className="mt-4"
              title="Availability Compliance Watch"
              description={`Projected ${horizonConfig.label.toLowerCase()} availability for assets with open work, against their contractual target. The tick mark is the target; a negative gap breaches it.`}
            >
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {availabilityWatch.slice(0, PREVIEW_ROWS).map((row) => (
                  <button
                    key={row.asset.asset_id}
                    onClick={() => selectAsset(row.asset)}
                    className="rounded-lg border border-border p-3 text-left hover:bg-muted/30"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {row.asset.asset_id}
                      </span>

                      <span
                        className={`text-xs font-semibold tabular-nums ${
                          row.gap < 0 ? "text-danger" : "text-success"
                        }`}
                      >
                        {row.gap >= 0 ? "+" : ""}
                        {row.gap.toFixed(2)} pts
                      </span>
                    </div>

                    <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${
                          row.gap < 0 ? "bg-danger" : "bg-success"
                        }`}
                        style={{
                          width: `${Math.max(Math.min(row.projected, 100), 0)}%`,
                        }}
                      />
                      <div
                        className="absolute top-0 h-full w-0.5 bg-foreground/60"
                        style={{ left: `${row.asset.availability_target_pct}%` }}
                      />
                    </div>

                    <div className="mt-1.5 text-[11px] text-muted-foreground">
                      Projected {row.projected.toFixed(2)}% · target{" "}
                      {row.asset.availability_target_pct}% ·{" "}
                      {Math.round((row.openMin / 60) * 10) / 10} h booked
                    </div>
                  </button>
                ))}
              </div>

              {!availabilityWatch.length && (
                <EmptyState text="No assets currently have open maintenance booked against them." />
              )}
            </Card>

            <Card
              className="mt-4"
              title="Traction Asset Register"
              description="Status, criticality and next due date for every traction asset."
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <SearchBox
                    value={assetSearch}
                    onChange={setAssetSearch}
                    placeholder="Asset, type, corridor…"
                  />

                  <select
                    value={assetStatus}
                    onChange={(e) => setAssetStatus(e.target.value)}
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                  >
                    <option value="ALL">All statuses</option>
                    <option value="Normal">Normal</option>
                    <option value="Degraded">Degraded</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              }
            >
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-2 py-3 font-medium">Asset</th>
                      <th className="px-2 py-3 font-medium">Type</th>
                      <th className="px-2 py-3 font-medium">Corridor</th>
                      <th className="px-2 py-3 font-medium">Location</th>
                      <th className="px-2 py-3 font-medium">Criticality</th>
                      <th className="px-2 py-3 font-medium">Risk</th>
                      <th className="px-2 py-3 font-medium">Status</th>
                      <th className="px-2 py-3 font-medium">Next Due</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleAssets.map((asset) => (
                      <tr
                        key={asset.asset_id}
                        onClick={() => selectAsset(asset)}
                        className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/20"
                      >
                        <td className="px-2 py-3 font-medium">
                          {asset.asset_id}
                        </td>
                        <td className="px-2 py-3">{asset.asset_type}</td>
                        <td className="px-2 py-3">{asset.corridor_id}</td>
                        <td className="px-2 py-3">{asset.location_km} km</td>
                        <td className="px-2 py-3">
                          {asset.asset_criticality}/5
                        </td>
                        <td className="px-2 py-3">
                          <Pill className={riskClass(asset.failure_risk)}>
                            {asset.failure_risk.toFixed(2)}
                          </Pill>
                        </td>
                        <td className="px-2 py-3">
                          <Pill className={statusClass(asset.current_status)}>
                            {asset.current_status}
                          </Pill>
                        </td>
                        <td className="px-2 py-3 text-muted-foreground">
                          {asset.next_due_date}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!filteredAssets.length && (
                  <EmptyState text="No traction assets match the current filters." />
                )}

                <ShowMore
                  total={filteredAssets.length}
                  shown={visibleAssets.length}
                  expanded={assetExpanded}
                  onToggle={() => setAssetExpanded(!assetExpanded)}
                  noun="assets"
                />
              </div>
            </Card>
          </>
        )}

        {/* ======================== POWER SECTIONS ======================= */}
        {view === "power-sections" && (
          <>
            <Card
              className="mt-5"
              title="OHE Power Block Requirements"
              description="Work on live 25 kV equipment needs an isolation and earthing permit cleared by the Traction Power Controller, not just a traffic block. Grouped by feeding section."
            >
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {powerBlockBySection.map((group) => (
                  <div
                    key={group.corridorId}
                    className="rounded-lg border border-border p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <PowerOff className="h-3.5 w-3.5 text-warning" />
                        <span className="text-sm font-medium">
                          {group.corridorId}
                        </span>
                      </div>

                      <Pill className={trafficClass(group.traffic)}>
                        {group.traffic}
                      </Pill>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                      <Metric label="Tasks" value={group.items.length} />
                      <Metric
                        label="Hours"
                        value={Math.round((group.totalMin / 60) * 10) / 10}
                      />
                      <Metric label="Max safety" value={`${group.maxSafety}/5`} />
                    </div>
                  </div>
                ))}
              </div>

              {!powerBlockBySection.length && (
                <EmptyState text="No open work currently requires an OHE power block." />
              )}

              {powerBlockItems.length > 0 && (
                <button
                  onClick={() => drillToQueue({ powerOnly: true })}
                  className="mt-4 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Open all {powerBlockItems.length} power-block tasks
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </Card>

            <Card
              className="mt-4"
              title="Feeding Section Register"
              description="Every corridor carrying traction assets, with its isolation load and traffic density from the Control Office feed."
            >
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-2 py-3 font-medium">Section</th>
                      <th className="px-2 py-3 font-medium">Route</th>
                      <th className="px-2 py-3 font-medium">Distance</th>
                      <th className="px-2 py-3 font-medium">Tracks</th>
                      <th className="px-2 py-3 font-medium">Electrified</th>
                      <th className="px-2 py-3 font-medium">Traffic</th>
                      <th className="px-2 py-3 font-medium">Assets</th>
                      <th className="px-2 py-3 font-medium">Open</th>
                      <th className="px-2 py-3 font-medium">Avg Risk</th>
                    </tr>
                  </thead>

                  <tbody>
                    {corridorStats
                      .filter((item) => item.assets.length > 0)
                      .sort((a, b) => b.attention - a.attention)
                      .slice(0, sectionsExpanded ? undefined : PREVIEW_ROWS)
                      .map((item) => (
                        <tr
                          key={item.corridor.corridor_id}
                          onClick={() => setSelectedCorridor(item.corridor)}
                          className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/20"
                        >
                          <td className="px-2 py-3 font-medium">
                            {item.corridor.corridor_id}
                          </td>
                          <td className="px-2 py-3">
                            {item.corridor.station_from} →{" "}
                            {item.corridor.station_to}
                          </td>
                          <td className="px-2 py-3">
                            {item.corridor.distance_km} km
                          </td>
                          <td className="px-2 py-3">
                            {item.corridor.track_count}
                          </td>
                          <td className="px-2 py-3">
                            {item.corridor.electrified === "Yes" ? (
                              <span className="text-success">Yes</span>
                            ) : (
                              <span className="text-muted-foreground">No</span>
                            )}
                          </td>
                          <td className="px-2 py-3">
                            <Pill
                              className={trafficClass(
                                item.corridor.traffic_density
                              )}
                            >
                              {item.corridor.traffic_density}
                            </Pill>
                          </td>
                          <td className="px-2 py-3">{item.assets.length}</td>
                          <td className="px-2 py-3">{item.tasks.length}</td>
                          <td className="px-2 py-3 tabular-nums">
                            {item.averageRisk.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>

                {!corridorStats.length && (
                  <EmptyState text="No corridor data is currently available." />
                )}

                <ShowMore
                  total={corridorStats.filter((i) => i.assets.length > 0).length}
                  shown={
                    sectionsExpanded
                      ? corridorStats.filter((i) => i.assets.length > 0).length
                      : Math.min(
                          PREVIEW_ROWS,
                          corridorStats.filter((i) => i.assets.length > 0).length
                        )
                  }
                  expanded={sectionsExpanded}
                  onToggle={() => setSectionsExpanded(!sectionsExpanded)}
                  noun="sections"
                />
              </div>
            </Card>
          </>
        )}

        {/* ======================= RECOMMENDATIONS ======================= */}
        {view === "recommendations" && (
          <>
            <Card
              className="mt-5"
              title="Corridor Maintenance Attention"
              description="Decision support combining traction asset risk, open maintenance volume and safety-critical workload per corridor."
            >
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {importantCorridors.map((item) => (
                  <button
                    key={item.corridor.corridor_id}
                    onClick={() => setSelectedCorridor(item.corridor)}
                    className="rounded-lg border border-border p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold">
                          {item.corridor.corridor_id}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {item.corridor.station_from} →{" "}
                          {item.corridor.station_to}
                        </div>
                      </div>

                      <span className="text-sm font-semibold tabular-nums">
                        {Math.round(item.attention * 100)}%
                      </span>
                    </div>

                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          item.attention >= 0.7
                            ? "bg-danger"
                            : item.attention >= 0.45
                            ? "bg-warning"
                            : "bg-success"
                        }`}
                        style={{
                          width: `${Math.max(item.attention * 100, 4)}%`,
                        }}
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                      <Metric label="Open" value={item.tasks.length} />
                      <Metric label="Critical" value={item.critical} />
                      <Metric label="Safety" value={item.safetyCritical} />
                    </div>
                  </button>
                ))}
              </div>

              {!importantCorridors.length && (
                <EmptyState text="No corridor data is currently available." />
              )}
            </Card>

            <Card
              className="mt-4"
              title="Block Clubbing Opportunities"
              description="Tasks on the same feeding section can share one isolation and one traffic disruption. Expand a section to see what would be combined."
              action={
                totalBlocksSaved > 0 ? (
                  <Pill className="border-success/25 bg-success/10 text-success">
                    {totalBlocksSaved} blocks · {totalHoursSaved} h saved
                  </Pill>
                ) : undefined
              }
            >
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {clubbingGroups.slice(0, PREVIEW_ROWS).map((group) => {
                  const open = openClub === group.corridorId;

                  return (
                    <div
                      key={group.corridorId}
                      className="rounded-lg border border-border"
                    >
                      <button
                        onClick={() =>
                          setOpenClub(open ? null : group.corridorId)
                        }
                        className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-muted/30"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Layers className="h-3.5 w-3.5 text-primary" />
                            <span className="text-sm font-medium">
                              {group.corridorId}
                            </span>
                          </div>

                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {group.items.length} tasks ·{" "}
                            {Math.round((group.serialMin / 60) * 10) / 10} h
                            separately →{" "}
                            <span className="text-success">
                              {Math.round((group.clubbedMin / 60) * 10) / 10} h
                              clubbed
                            </span>
                          </div>
                        </div>

                        {open ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>

                      {open && (
                        <div className="border-t border-border p-3">
                          <div className="flex flex-col gap-1.5">
                            {group.items.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between gap-2 text-[11px]"
                              >
                                <span className="truncate">
                                  {item.id} · {item.defectType}
                                </span>
                                <span className="shrink-0 text-muted-foreground tabular-nums">
                                  {Math.round((item.durationMin / 60) * 10) / 10}{" "}
                                  h · {item.crewRequired} crew
                                </span>
                              </div>
                            ))}
                          </div>

                          <button
                            onClick={() => sendToBlockPlanner(group.items[0])}
                            className="mt-3 flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90"
                          >
                            Plan a combined block
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {!clubbingGroups.length && (
                <EmptyState text="No two open tasks currently share a feeding section." />
              )}
            </Card>

            <Card
              className="mt-4"
              title="Recommended Next Actions"
              description="Generated from asset risk, overdue ageing, corridor traffic and isolation requirements. Each recommendation can be taken straight into the Block Planner."
            >
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {queue.slice(0, PREVIEW_ROWS).map((item) => {
                  const priority = priorityLabel(priorityScore(item));
                  const corridor = network.find(
                    (n) => n.corridor_id === item.corridorId
                  );

                  return (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border p-4 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {item.defectType} on {item.assetLabel}
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {item.corridorId}
                            {corridor
                              ? ` · ${corridor.traffic_density} traffic`
                              : ""}
                          </div>
                        </div>

                        <Pill className={priorityClass(priority)}>
                          {priority}
                        </Pill>
                      </div>

                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        {item.overdueDays > 0
                          ? `Overdue by ${item.overdueDays} days. `
                          : ""}
                        Safety risk {item.safetyRisk}/5, criticality{" "}
                        {item.criticality}/5.{" "}
                        {needsPowerBlock(item)
                          ? "Requires OHE isolation — book a TPC power block alongside the traffic block. "
                          : "No isolation required; a traffic block alone is sufficient. "}
                        {corridor?.traffic_density === "High"
                          ? "High corridor traffic — schedule inside a night window."
                          : "Corridor traffic allows a wider block window."}
                      </p>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => checkImpact(item)}
                          className="rounded border border-border px-2.5 py-1.5 text-[11px] hover:bg-muted"
                        >
                          Check impact
                        </button>

                        <button
                          onClick={() => sendToBlockPlanner(item)}
                          disabled={sendingTaskId === item.id}
                          className="flex items-center gap-1 rounded bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {sendingTaskId === item.id ? "Opening…" : "Plan Block"}
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!queue.length && (
                <EmptyState text="No recommendations — there is no open traction maintenance." />
              )}
            </Card>
          </>
        )}

        {/* =========================== HISTORY =========================== */}
        {view === "history" && (
          <Card
            className="mt-5"
            title="Maintenance History"
            description={`${completedTasks.length} completed traction maintenance tasks in the TDMS dataset.`}
          >
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-2 py-3 font-medium">Task</th>
                    <th className="px-2 py-3 font-medium">Asset</th>
                    <th className="px-2 py-3 font-medium">Problem</th>
                    <th className="px-2 py-3 font-medium">Maintenance</th>
                    <th className="px-2 py-3 font-medium">Corridor</th>
                    <th className="px-2 py-3 font-medium">Duration</th>
                    <th className="px-2 py-3 font-medium">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleHistory.map((task) => (
                    <tr
                      key={task.task_id}
                      className="border-b border-border/50 transition-colors hover:bg-muted/20"
                    >
                      <td className="px-2 py-3 font-medium">{task.task_id}</td>
                      <td className="px-2 py-3">{task.asset_id}</td>
                      <td className="px-2 py-3">{task.defect_type}</td>
                      <td className="px-2 py-3">{task.maintenance_type}</td>
                      <td className="px-2 py-3">{task.corridor_id}</td>
                      <td className="px-2 py-3 tabular-nums">
                        {Math.round((task.estimated_duration_min / 60) * 10) /
                          10}{" "}
                        h
                      </td>
                      <td className="px-2 py-3">
                        <Pill className={statusClass(task.status)}>
                          {task.status}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!completedTasks.length && (
                <EmptyState text="No completed maintenance history is currently available." />
              )}

              <ShowMore
                total={Math.min(completedTasks.length, 50)}
                shown={visibleHistory.length}
                expanded={historyExpanded}
                onToggle={() => setHistoryExpanded(!historyExpanded)}
                noun="records"
              />
            </div>
          </Card>
        )}

        {/* ======================= REPORT PROBLEM ======================== */}
        {view === "report-problem" && (
          <>
            {!canWrite ? (
              <Card
                className="mt-5"
                title="Reporting restricted"
                description="New traction defects are filed by the Traction department. Your role has read-only oversight of this module."
              >
                <EmptyState text="Switch to a Traction account to report a problem." />
              </Card>
            ) : (
              <div className="mx-auto max-w-5xl">
                <PipelineBar step={reportStep} />

                <Card
                  className="mt-4"
                  title="Report Traction Problem"
                  description="Problem → Understand → Recommend → Prepare → Block-ready request"
                >
                  {/* ---------- STEPPER ---------- */}
                  <div className="mt-5">
                    <Stepper
                      steps={REPORT_STEPS}
                      current={reportStep}
                      onStepClick={setReportStep}
                    />
                  </div>

                  <div className="mt-6">
                    {/* ============ STEP 1 : PROBLEM ============ */}
                    {reportStep === 1 && (
                      <div>
                        <div className="mb-5">
                          <h3 className="text-sm font-semibold">
                            Problem Details
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Record the asset defect and the priority factors.
                          </p>
                        </div>

                        <div className="grid gap-4">
                          <label className="text-xs">
                            <span className="mb-1 block text-muted-foreground">
                              Traction Asset
                            </span>
                            <select
                              value={form.assetId}
                              onChange={(e) =>
                                handleFormAssetChange(e.target.value)
                              }
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                            >
                              {assets.map((asset) => (
                                <option
                                  key={asset.asset_id}
                                  value={asset.asset_id}
                                >
                                  {asset.asset_id} • {asset.asset_type} •{" "}
                                  {asset.corridor_id}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <InputField
                              label="Location (km)"
                              type="number"
                              value={form.locationKm}
                              onChange={(value) =>
                                setForm({ ...form, locationKm: value })
                              }
                            />

                            <SelectField
                              label="Problem Type"
                              value={form.defectType}
                              options={DEFECT_TYPES}
                              onChange={(value) =>
                                setForm({ ...form, defectType: value })
                              }
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <NumberSelect
                              label="Criticality"
                              value={form.criticality}
                              onChange={(value) =>
                                setForm({ ...form, criticality: value })
                              }
                            />
                            <NumberSelect
                              label="Urgency"
                              value={form.urgency}
                              onChange={(value) =>
                                setForm({ ...form, urgency: value })
                              }
                            />
                            <NumberSelect
                              label="Safety Risk"
                              value={form.safetyRisk}
                              onChange={(value) =>
                                setForm({ ...form, safetyRisk: value })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ============ STEP 2 : MAINTENANCE ============ */}
                    {reportStep === 2 && (
                      <div>
                        <div className="mb-5">
                          <h3 className="text-sm font-semibold">
                            Maintenance Requirement
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Specify the maintenance activity required to
                            resolve the reported problem.
                          </p>
                        </div>

                        <div className="grid gap-4">
                          <SelectField
                            label="Maintenance Type"
                            value={form.maintenanceType}
                            options={MAINTENANCE_TYPES}
                            onChange={(value) =>
                              setForm({ ...form, maintenanceType: value })
                            }
                          />

                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <InputField
                              label="Duration (hours)"
                              type="number"
                              value={String(form.durationHrs)}
                              onChange={(value) =>
                                setForm({
                                  ...form,
                                  durationHrs: Number(value),
                                })
                              }
                            />

                            <div className="rounded-lg border border-border bg-background p-4">
                              <p className="text-xs text-muted-foreground">
                                Selected Problem
                              </p>
                              <p className="mt-1 text-sm font-medium">
                                {form.defectType || "Not selected"}
                              </p>
                              <p className="mt-2 text-xs text-muted-foreground">
                                Asset: {form.assetId || "Not selected"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ============ STEP 3 : RESOURCES & BLOCK ============ */}
                    {reportStep === 3 && (
                      <div>
                        <div className="mb-5">
                          <h3 className="text-sm font-semibold">
                            Resources &amp; Block
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Define the resources required and prepare the
                            problem for block planning.
                          </p>
                        </div>

                        <div className="grid gap-4">
                          <InputField
                            label="Crew Required"
                            type="number"
                            value={String(form.crewRequired)}
                            onChange={(value) =>
                              setForm({
                                ...form,
                                crewRequired: Number(value),
                              })
                            }
                          />

                          <div className="rounded-lg border border-info/20 bg-info/5 p-4">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-info" />
                              <span className="text-sm font-medium">
                                Block Planning Information
                              </span>
                            </div>

                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                              <div>
                                <p className="text-[11px] text-muted-foreground">
                                  Asset
                                </p>
                                <p className="mt-1 text-sm font-medium">
                                  {form.assetId || "—"}
                                </p>
                              </div>

                              <div>
                                <p className="text-[11px] text-muted-foreground">
                                  Corridor
                                </p>
                                <p className="mt-1 text-sm font-medium">
                                  {formAsset?.corridor_id || "—"}
                                </p>
                              </div>

                              <div>
                                <p className="text-[11px] text-muted-foreground">
                                  Duration
                                </p>
                                <p className="mt-1 text-sm font-medium">
                                  {form.durationHrs} hrs
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-border bg-background p-4">
                            <p className="text-xs font-medium">Planning Flow</p>

                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                              {[
                                "TDMS",
                                "Priority Queue",
                                "Block Planner",
                                "COA",
                              ].map((label, index, all) => (
                                <span
                                  key={label}
                                  className="flex items-center gap-2"
                                >
                                  <span className="rounded-md bg-primary/10 px-3 py-1.5 text-primary">
                                    {label}
                                  </span>
                                  {index < all.length - 1 && (
                                    <span className="text-muted-foreground">
                                      →
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ============ STEP 4 : AI REVIEW ============ */}
                    {reportStep === 4 && (
                      <div>
                        <div className="mb-5">
                          <h3 className="text-sm font-semibold">AI Review</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Review the reported problem and the calculated
                            priority before sending it to the TDMS queue.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div className="rounded-lg border border-border bg-background p-4">
                            <p className="text-xs text-muted-foreground">
                              Asset
                            </p>
                            <p className="mt-1 text-sm font-medium">
                              {form.assetId || "—"}
                              {formAsset ? ` · ${formAsset.corridor_id}` : ""}
                            </p>

                            <div className="mt-4 grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-[11px] text-muted-foreground">
                                  Problem
                                </p>
                                <p className="mt-1 text-sm">
                                  {form.defectType || "—"}
                                </p>
                              </div>

                              <div>
                                <p className="text-[11px] text-muted-foreground">
                                  Location
                                </p>
                                <p className="mt-1 text-sm">
                                  {form.locationKm || "—"} km
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-3 gap-4">
                              <div>
                                <p className="text-[11px] text-muted-foreground">
                                  Criticality
                                </p>
                                <p className="mt-1 text-sm">
                                  {form.criticality}/5
                                </p>
                              </div>
                              <div>
                                <p className="text-[11px] text-muted-foreground">
                                  Urgency
                                </p>
                                <p className="mt-1 text-sm">{form.urgency}/5</p>
                              </div>
                              <div>
                                <p className="text-[11px] text-muted-foreground">
                                  Safety
                                </p>
                                <p className="mt-1 text-sm">
                                  {form.safetyRisk}/5
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-border bg-background p-4">
                            <p className="text-xs text-muted-foreground">
                              Maintenance
                            </p>
                            <p className="mt-1 text-sm font-medium">
                              {form.maintenanceType || "—"}
                            </p>

                            <div className="mt-4 grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-[11px] text-muted-foreground">
                                  Duration
                                </p>
                                <p className="mt-1 text-sm">
                                  {form.durationHrs} hrs
                                </p>
                              </div>

                              <div>
                                <p className="text-[11px] text-muted-foreground">
                                  Crew
                                </p>
                                <p className="mt-1 text-sm">
                                  {form.crewRequired}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 rounded-lg border border-info/20 bg-info/5 p-5">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-info" />
                            <span className="text-sm font-semibold">
                              AI Priority Assessment
                            </span>
                          </div>

                          <div className="mt-4 flex items-center justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Computed Priority
                              </p>
                              <div className="mt-1.5">
                                <Pill className={priorityClass(formPriority)}>
                                  {formPriority}
                                </Pill>
                              </div>
                            </div>

                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">
                                Priority Score
                              </p>
                              <p className="mt-1 text-lg font-semibold tabular-nums">
                                {formScore}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 rounded-lg border border-border bg-background p-4">
                          <p className="text-xs font-medium">
                            After Submission
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Report → TDMS Priority Queue → Block Planner →
                            Candidate Block → COA Approval
                          </p>
                        </div>
                      </div>
                    )}

                    {/* ============ NAVIGATION ============ */}
                    <div className="mt-6 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={goBack}
                        disabled={reportStep === 1 || submitting}
                        className="flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:invisible"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </button>

                      {reportStep < REPORT_STEPS.length ? (
                        <button
                          type="button"
                          onClick={goNext}
                          disabled={!stepValid}
                          className="flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {NEXT_LABELS[reportStep]}
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => submitProblem()}
                          disabled={submitting || !assets.length}
                          className="flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {submitting
                            ? "Submitting…"
                            : "Submit Maintenance Problem"}
                          {!submitting && <ArrowRight className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </>
        )}
      </div>

      {/* ===================== ASSET DETAIL MODAL ====================== */}
      {selectedAsset && !showImpact && (
        <Modal
          title={`Asset ${selectedAsset.asset_id}`}
          subtitle={`${selectedAsset.asset_type} · ${selectedAsset.corridor_id}`}
          onClose={() => {
            setSelectedAsset(null);
            setSelectedTask(null);
          }}
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <InfoBox label="Status" value={selectedAsset.current_status} />
            <InfoBox
              label="Criticality"
              value={`${selectedAsset.asset_criticality}/5`}
            />
            <InfoBox
              label="Failure Risk"
              value={selectedAsset.failure_risk.toFixed(2)}
            />
            <InfoBox
              label="Location"
              value={`${selectedAsset.location_km} km`}
            />
            <InfoBox
              label="Availability Target"
              value={`${selectedAsset.availability_target_pct}%`}
            />
            <InfoBox
              label="Last Maintenance"
              value={selectedAsset.last_maintenance_date}
            />
            <InfoBox label="Next Due" value={selectedAsset.next_due_date} />
            <InfoBox label="Corridor" value={selectedAsset.corridor_id} />
          </div>

          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold">Maintenance History</h3>

            {selectedAssetTasks.length ? (
              <div className="space-y-2">
                {selectedAssetTasks.map((task) => (
                  <div
                    key={task.task_id}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">
                        {task.task_id}
                      </span>
                      <Pill className={statusClass(task.status)}>
                        {task.status}
                      </Pill>
                    </div>

                    <div className="mt-1 text-xs">{task.defect_type}</div>

                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {task.maintenance_type} · {task.estimated_duration_min} min
                      · Safety {task.safety_risk}/5
                      {task.overdue_days > 0
                        ? ` · Overdue ${task.overdue_days}d`
                        : ""}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="No maintenance history is available for this asset." />
            )}
          </div>
        </Modal>
      )}

      {/* ==================== CORRIDOR DETAIL MODAL ==================== */}
      {selectedCorridor && !selectedAsset && !showImpact && (
        <Modal
          title={`Corridor ${selectedCorridor.corridor_id}`}
          subtitle={`${selectedCorridor.station_from} → ${selectedCorridor.station_to}`}
          onClose={() => setSelectedCorridor(null)}
        >
          {(() => {
            const stats = corridorStats.find(
              (item) =>
                item.corridor.corridor_id === selectedCorridor.corridor_id
            );

            return (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <InfoBox
                    label="Distance"
                    value={`${selectedCorridor.distance_km} km`}
                  />
                  <InfoBox
                    label="Tracks"
                    value={String(selectedCorridor.track_count)}
                  />
                  <InfoBox
                    label="Electrified"
                    value={selectedCorridor.electrified}
                  />
                  <InfoBox
                    label="Traffic Density"
                    value={selectedCorridor.traffic_density}
                  />
                  <InfoBox
                    label="Traction Assets"
                    value={String(stats?.assets.length ?? 0)}
                  />
                  <InfoBox
                    label="Open Tasks"
                    value={String(stats?.tasks.length ?? 0)}
                  />
                  <InfoBox
                    label="Critical Assets"
                    value={String(stats?.critical ?? 0)}
                  />
                  <InfoBox
                    label="Avg Risk"
                    value={(stats?.averageRisk ?? 0).toFixed(2)}
                  />
                </div>

                <div className="mt-4 rounded-lg border border-info/20 bg-info/5 p-4 text-xs text-muted-foreground">
                  Attention score{" "}
                  <span className="font-medium text-foreground">
                    {Math.round((stats?.attention ?? 0) * 100)}%
                  </span>{" "}
                  — combines average asset risk, open maintenance volume,
                  critical assets and safety-critical workload on this corridor.
                </div>
              </>
            );
          })()}
        </Modal>
      )}

      {/* ======================== IMPACT MODAL ========================= */}
      {showImpact && selectedTask && (
        <Modal
          title="Maintenance Impact Check"
          subtitle={`${selectedTask.assetLabel} · ${selectedTask.corridorId}`}
          onClose={() => setShowImpact(false)}
        >
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">
                {selectedTask.defectType}
              </div>

              <Pill
                className={priorityClass(
                  priorityLabel(priorityScore(selectedTask))
                )}
              >
                {priorityLabel(priorityScore(selectedTask))}
              </Pill>
            </div>

            <div className="mt-1 text-xs text-muted-foreground">
              {selectedTask.maintenanceType} · Priority score{" "}
              {priorityScore(selectedTask)}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            <InfoBox
              label="Duration"
              value={`${
                Math.round((selectedTask.durationMin / 60) * 10) / 10
              } hrs`}
            />
            <InfoBox label="Crew" value={String(selectedTask.crewRequired)} />
            <InfoBox
              label="Criticality"
              value={`${selectedTask.criticality}/5`}
            />
            <InfoBox
              label="Safety Risk"
              value={`${selectedTask.safetyRisk}/5`}
            />
            <InfoBox
              label="Open Tasks on Corridor"
              value={String(
                tasks.filter(
                  (task) =>
                    task.corridor_id === selectedTask.corridorId &&
                    task.status !== "Completed"
                ).length
              )}
            />
            <InfoBox
              label="Traffic"
              value={
                network.find(
                  (n) => n.corridor_id === selectedTask.corridorId
                )?.traffic_density || "Unknown"
              }
            />
          </div>

          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-4">
            <div className="flex items-center gap-1.5 text-sm font-medium text-warning">
              <AlertTriangle className="h-4 w-4" />
              Planning attention
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              Check this maintenance against corridor traffic, concurrent
              Engineering and S&amp;T work, and available block windows before it
              is submitted for COA approval.
            </p>
          </div>

          <button
            onClick={() => {
              setShowImpact(false);
              sendToBlockPlanner(selectedTask);
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Plan Maintenance Block
            <ArrowRight className="h-4 w-4" />
          </button>
        </Modal>
      )}
    </div>
  );
}

/* ========================================================================== */
/* PRESENTATIONAL COMPONENTS                                                  */
/* ========================================================================== */

function ShellMessage({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex h-full flex-col">
      <TopBar
        title={title}
        subtitle="Traction Distribution Maintenance Intelligence"
      />
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {text}
      </div>
    </div>
  );
}

function AccessDenied({
  department,
  onBack,
}: {
  department?: Department;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <TopBar title="TDMS • Access Restricted" />

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-warning/15">
            <Lock className="h-5 w-5 text-warning" />
          </span>

          <h2 className="mt-4 text-base font-semibold">
            This module belongs to another department
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            TDMS is the Traction Distribution department&apos;s workspace.
            {department
              ? ` You are signed in as ${DEPARTMENT_LABELS[department]}, which has its own module.`
              : ""}{" "}
            Only the Corridor Operating Authority has cross-department visibility.
          </p>

          <button
            onClick={onBack}
            className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to my dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pipeline bar above the Report Problem wizard. */
function PipelineBar({ step }: { step: number }) {
  const lit = PIPELINE_LIT[step] ?? 1;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-card px-4 py-2.5 text-xs">
      {PIPELINE.map((label, index) => (
        <span key={label} className="flex items-center gap-2">
          <span
            className={
              index < lit
                ? "font-semibold text-foreground"
                : "text-muted-foreground"
            }
          >
            {label}
          </span>
          {index < PIPELINE.length - 1 && (
            <span className="text-muted-foreground">›</span>
          )}
        </span>
      ))}
    </div>
  );
}

/** Numbered step indicator. Completed steps are clickable to go back. */
function Stepper({
  steps,
  current,
  onStepClick,
}: {
  steps: WizardStep[];
  current: number;
  onStepClick: (id: number) => void;
}) {
  return (
    <ol className="flex items-center">
      {steps.map((step, index) => {
        const done = step.id < current;
        const active = step.id === current;

        return (
          <li
            key={step.id}
            className="flex flex-1 items-center last:flex-none"
          >
            <button
              type="button"
              disabled={!done}
              onClick={() => done && onStepClick(step.id)}
              aria-current={active ? "step" : undefined}
              className="flex items-center gap-2 disabled:cursor-default"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : step.id}
              </span>

              <span
                className={`hidden whitespace-nowrap text-xs font-medium sm:inline ${
                  active || done ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </button>

            {index < steps.length - 1 && (
              <div
                className={`mx-3 h-px flex-1 ${
                  done ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Card({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-border bg-card p-4 ${className}`}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && (
            <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>

      {children}
    </section>
  );
}

function KpiCard({
  title,
  value,
  caption,
  icon,
  tone = "default",
  onClick,
}: {
  title: string;
  value: string | number;
  caption?: string;
  icon: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
  onClick?: () => void;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
      ? "text-warning"
      : tone === "danger"
      ? "text-danger"
      : "text-primary";

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className={`rounded-xl border border-border bg-card p-4 text-left transition-colors ${
        onClick ? "hover:border-primary/40 hover:bg-muted/30" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{title}</span>
        <span className={toneClass}>{icon}</span>
      </div>

      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>

      {caption && (
        <div className="mt-1 text-[10px] text-muted-foreground">{caption}</div>
      )}
    </Wrapper>
  );
}

/**
 * Semi-circular gauge. The arc is a half circle of radius 52, so its length is
 * PI * 52; the coloured stroke is dashed to that fraction of the total.
 */
function CapacityGauge({
  value,
  tone = "success",
}: {
  value: number;
  tone?: "success" | "warning" | "danger";
}) {
  const length = Math.PI * 52;
  const filled = (Math.min(value, 100) / 100) * length;

  const strokeClass =
    tone === "danger"
      ? "stroke-danger"
      : tone === "warning"
      ? "stroke-warning"
      : "stroke-success";

  const textClass =
    tone === "danger"
      ? "fill-danger"
      : tone === "warning"
      ? "fill-warning"
      : "fill-success";

  return (
    <svg viewBox="0 0 140 84" className="h-[104px] w-full max-w-[180px]">
      <path
        d="M 18 70 A 52 52 0 0 1 122 70"
        fill="none"
        strokeWidth="12"
        strokeLinecap="round"
        className="stroke-muted"
      />
      <path
        d="M 18 70 A 52 52 0 0 1 122 70"
        fill="none"
        strokeWidth="12"
        strokeLinecap="round"
        className={`${strokeClass} transition-all duration-700`}
        strokeDasharray={`${filled} ${length}`}
      />
      <text
        x="70"
        y="64"
        textAnchor="middle"
        className={`${textClass} text-[24px] font-semibold`}
      >
        {value}%
      </text>
      <text
        x="70"
        y="80"
        textAnchor="middle"
        className="fill-muted-foreground text-[9px]"
      >
        capacity used
      </text>
    </svg>
  );
}

/** Donut chart. Segments are drawn as dashed arcs on a single circle. */
function Donut({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: { label: string; value: number; strokeClass: string }[];
  centerValue: string | number;
  centerLabel: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <svg viewBox="0 0 120 120" className="h-[112px] w-[112px] shrink-0">
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        strokeWidth="14"
        className="stroke-muted"
      />

      {total > 0 &&
        segments.map((segment) => {
          const length = (segment.value / total) * circumference;
          const dashOffset = -offset;
          offset += length;

          if (!segment.value) return null;

          return (
            <circle
              key={segment.label}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              strokeWidth="14"
              className={`${segment.strokeClass} transition-all duration-700`}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 60 60)"
            />
          );
        })}

      <text
        x="60"
        y="58"
        textAnchor="middle"
        className="fill-foreground text-[22px] font-semibold"
      >
        {centerValue}
      </text>
      <text
        x="60"
        y="74"
        textAnchor="middle"
        className="fill-muted-foreground text-[8px]"
      >
        {centerLabel}
      </text>
    </svg>
  );
}

/** Corridor heat map. Tile shade encodes the attention score. */
function HeatGrid({
  cells,
  onSelect,
}: {
  cells: {
    id: string;
    label: string;
    attention: number;
    openTasks: number;
    critical: number;
  }[];
  onSelect: (id: string) => void;
}) {
  if (!cells.length) {
    return <EmptyState text="No corridors currently carry traction assets." />;
  }

  function shade(attention: number) {
    if (attention >= 0.7) return "bg-danger/80 text-white border-danger";
    if (attention >= 0.55) return "bg-danger/45 border-danger/40";
    if (attention >= 0.4) return "bg-warning/50 border-warning/40";
    if (attention >= 0.25) return "bg-warning/25 border-warning/25";
    return "bg-success/20 border-success/25";
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
        {cells.map((cell) => (
          <button
            key={cell.id}
            onClick={() => onSelect(cell.id)}
            title={`${cell.label} — attention ${Math.round(
              cell.attention * 100
            )}%, ${cell.openTasks} open, ${cell.critical} critical`}
            className={`rounded-md border p-2 text-left transition-transform hover:scale-[1.04] ${shade(
              cell.attention
            )}`}
          >
            <div className="truncate text-[10px] font-semibold">
              {cell.label}
            </div>
            <div className="mt-0.5 text-[9px] opacity-80 tabular-nums">
              {cell.openTasks} open · {Math.round(cell.attention * 100)}%
            </div>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>Lower attention</span>
        <span className="h-2 w-6 rounded-sm bg-success/20" />
        <span className="h-2 w-6 rounded-sm bg-warning/25" />
        <span className="h-2 w-6 rounded-sm bg-warning/50" />
        <span className="h-2 w-6 rounded-sm bg-danger/45" />
        <span className="h-2 w-6 rounded-sm bg-danger/80" />
        <span>Higher</span>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
      ? "text-warning"
      : tone === "danger"
      ? "text-danger"
      : "text-muted-foreground";

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className={toneClass}>{icon}</span>
        {label}
      </div>

      <div className="mt-1 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function HorizonToggle({
  value,
  onChange,
}: {
  value: HorizonId;
  onChange: (value: HorizonId) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
      {HORIZONS.map((option) => (
        <button
          key={option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === option.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SortableTh({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === column;

  return (
    <th className="px-2 py-3 font-medium">
      <button
        onClick={() => onSort(column)}
        className={`flex items-center gap-1 transition-colors hover:text-foreground ${
          active ? "text-foreground" : ""
        }`}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronDown className="h-3 w-3 opacity-25" />
        )}
      </button>
    </th>
  );
}

function ShowMore({
  total,
  shown,
  expanded,
  onToggle,
  noun,
}: {
  total: number;
  shown: number;
  expanded: boolean;
  onToggle: () => void;
  noun: string;
}) {
  if (total <= PREVIEW_ROWS) return null;

  return (
    <div className="mt-3 flex items-center justify-center">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {expanded ? (
          <>
            <ChevronUp className="h-3 w-3" />
            Show top {PREVIEW_ROWS} only
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3" />
            Show all {total} {noun} ({total - shown} more)
          </>
        )}
      </button>
    </div>
  );
}

function Banner({
  tone,
  children,
  onDismiss,
}: {
  tone: "danger" | "success" | "info";
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const toneClass =
    tone === "danger"
      ? "border-danger/30 bg-danger/10 text-danger"
      : tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : "border-info/30 bg-info/10 text-info";

  const Icon =
    tone === "danger"
      ? AlertTriangle
      : tone === "success"
      ? CheckCircle2
      : Sparkles;

  return (
    <div
      className={`mb-4 flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${toneClass}`}
    >
      <span className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{children}</span>
      </span>

      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function Pill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-48 rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs outline-none focus:border-primary/50"
      />
    </div>
  );
}

function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="mt-4 flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span>{item.label}</span>
            <span className="font-medium tabular-nums">{item.value}</span>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}

      {!items.length && <EmptyState text="No data available." />}
    </div>
  );
}

function RiskMatrix({
  assets,
  onSelect,
}: {
  assets: AssetRecord[];
  onSelect: (asset: AssetRecord) => void;
}) {
  const [hovered, setHovered] = useState<AssetRecord | null>(null);

  return (
    <div className="mt-4">
      <div className="mb-2 h-10 rounded-lg border border-dashed border-border px-3 py-2 text-[11px]">
        {hovered ? (
          <span>
            <span className="font-medium">{hovered.asset_id}</span>
            <span className="text-muted-foreground">
              {" "}
              · {hovered.asset_type} · {hovered.corridor_id} · criticality{" "}
              {hovered.asset_criticality}/5 · risk{" "}
              {hovered.failure_risk.toFixed(2)} · {hovered.current_status}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">
            Hover a point to inspect an asset, click to open its full record.
          </span>
        )}
      </div>

      <div className="relative h-[340px] rounded-lg border border-border bg-background">
        {/* quadrant guides */}
        <div className="absolute inset-10">
          {[0, 25, 50, 75, 100].map((line) => (
            <div
              key={`h-${line}`}
              className="absolute left-0 right-0 border-t border-border/40"
              style={{ bottom: `${line}%` }}
            />
          ))}

          {[0, 25, 50, 75, 100].map((line) => (
            <div
              key={`v-${line}`}
              className="absolute bottom-0 top-0 border-l border-border/40"
              style={{ left: `${line}%` }}
            />
          ))}

          {/* focus quadrant */}
          <div className="absolute right-0 top-0 h-1/2 w-1/2 bg-danger/5" />

          {assets.map((asset) => {
            const left = Math.min(Math.max(asset.failure_risk * 100, 0), 98);
            const bottom = ((asset.asset_criticality - 1) / 4) * 96;

            const dot =
              asset.current_status === "Critical"
                ? "bg-danger"
                : asset.failure_risk >= 0.6
                ? "bg-warning"
                : "bg-success";

            return (
              <button
                key={asset.asset_id}
                title={`${asset.asset_id} • ${asset.asset_type} • Criticality ${asset.asset_criticality}/5 • Risk ${asset.failure_risk.toFixed(2)}`}
                onClick={() => onSelect(asset)}
                onMouseEnter={() => setHovered(asset)}
                onMouseLeave={() => setHovered(null)}
                className={`absolute h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full ${dot} ring-2 ring-background transition-transform hover:scale-[1.8] ${
                  hovered && hovered.asset_id !== asset.asset_id
                    ? "opacity-40"
                    : ""
                }`}
                style={{ left: `${left}%`, bottom: `${bottom}%` }}
              />
            );
          })}
        </div>

        {/* axes */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
          Failure risk score →
        </div>

        <div className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-[10px] text-muted-foreground">
          Operational criticality →
        </div>

        <div className="absolute bottom-6 left-9 text-[9px] text-muted-foreground">
          0.0
        </div>
        <div className="absolute bottom-6 right-9 text-[9px] text-muted-foreground">
          1.0
        </div>
        <div className="absolute left-6 top-8 text-[9px] text-muted-foreground">
          5
        </div>
        <div className="absolute bottom-9 left-6 text-[9px] text-muted-foreground">
          1
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
        <LegendDot className="bg-danger" label="Critical status" />
        <LegendDot className="bg-warning" label="Risk ≥ 0.60" />
        <LegendDot className="bg-success" label="Within tolerance" />
        <span>Shaded quadrant = high risk on high-criticality assets.</span>
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-3 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>

          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function InputField({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-xs">
      <span className="mb-1 block text-muted-foreground">{label}</span>

      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}c