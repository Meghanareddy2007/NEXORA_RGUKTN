import axios from "axios";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
export const api = axios.create({ baseURL: API_BASE });

export interface KpiSummary {
  avg_availability_target_pct: number;
  assets_by_status: Record<string, number>;
  assets_by_department: Record<string, number>;
  total_blocks: number;
  blocks_by_status: Record<string, number>;
  blocks_by_traffic_level: Record<string, number>;
  total_pending_tasks: number;
  overdue_tasks: number;
  tasks_by_department: Record<string, number>;
  tasks_by_criticality: Record<string, number>;
}

export interface Block {
  block_id: string;
  corridor_id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  traffic_level: "Low" | "Med" | "High";
  train_conflict_count: number;
  block_type: string;
  existing_block: string;
  allowed_departments: string;
  status: string;
}

export interface ScheduledTask {
  task_id: string;
  source: string;
  department: string;
  corridor_id: string;
  defect_type: string;
  priority_score: number;
  estimated_duration_min: number;
  block_id: string;
  date: string;
  start_time: string;
  end_time: string;
  traffic_level: string;
  train_conflict_count: number;
}

export interface OptimizeResult {
  scheduled: ScheduledTask[];
  unscheduled: any[];
  kpis: {
    total_tasks_considered: number;
    scheduled_count: number;
    unscheduled_count: number;
    scheduled_pct: number;
    total_priority_scheduled: number;
    total_priority_pct: number;
    blocks_used: number;
    blocks_available: number;
    solver_status: string;
    solve_time_sec: number;
  };
}

export interface RecommendedBlock {
  block_id: string;
  corridor_id: string;
  corridor_label: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  block_type: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  trains_affected: number;
  expected_delay_min: number;
  availability_gain_pct: number;
  reasons: string[];
}

export interface UpcomingBlock {
  block_id: string;
  corridor_id: string;
  corridor_label: string;
  date: string;
  start_time: string;
  end_time: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: string;
}

export interface Alert {
  severity: "warning" | "info" | "critical";
  message: string;
  detail: string;
}

export interface DashboardSummary {
  today: string;
  kpis: {
    active_trains_today: number;
    maintenance_requests_pending: number;
    maintenance_requests_high_priority: number;
    assets_monitored: number;
    assets_healthy_pct: number;
    blocks_planned_today: number;
    asset_availability_pct: number;
    delay_avoided_min: number;
    delay_avoided_label: string;
  };
  recommended_block: RecommendedBlock | null;
  upcoming_blocks: UpcomingBlock[];
  train_impact_summary: Record<string, number>;
  delay_avoided_chart: { manual_min: number; ai_optimized_min: number };
  alerts: Alert[];
}

/* -------------------------------------------------------------------------- */
/* Existing dashboard APIs - these map directly to backend/app/main.py.       */
/* -------------------------------------------------------------------------- */

export const fetchDashboard = () =>
  api.get<DashboardSummary>("/api/analytics/dashboard").then((r) => r.data);

export const approveBlock = (block_id: string) =>
  api
    .post<{ block_id: string; status: string }>(`/api/blocks/${encodeURIComponent(block_id)}/approve`)
    .then((r) => r.data);

export const fetchKpis = () =>
  api.get<KpiSummary>("/api/analytics/kpi").then((r) => r.data);

export const fetchBlocks = (corridor_id?: string) =>
  api
    .get<Block[]>("/api/blocks", { params: corridor_id ? { corridor_id } : undefined })
    .then((r) => r.data);

export const fetchNetwork = () => api.get("/api/network").then((r) => r.data);

export const fetchCorridorRisk = () =>
  api.get("/api/analytics/corridor-risk").then((r) => r.data);

export const runOptimization = (max_tasks = 150, max_blocks = 60) =>
  api
    .post<OptimizeResult>("/api/optimize/run", null, {
      params: { max_tasks, max_blocks },
    })
    .then((r) => r.data);

/* -------------------------------------------------------------------------- */
/* Block Planning                                                             */
/*                                                                            */
/* The current FastAPI backend does NOT expose POST /api/maintenance-requests */
/* or /api/plan-preview. It exposes the datasets and /api/blocks instead.     */
/* Therefore these functions use those real backend endpoints and perform     */
/* candidate generation/visualization in the browser. Approval still uses    */
/* the real POST /api/blocks/{block_id}/approve endpoint.                     */
/* -------------------------------------------------------------------------- */

export interface Asset {
  asset_id: string;
  asset_type: string;
  department: string;
  corridor_id: string;
  location_km?: number;
  asset_criticality?: number;
  availability_target_pct?: number;
  current_status?: string;
  last_maintenance_date?: string;
  next_due_date?: string;
  failure_risk?: number;
  corridor_label?: string;
  label: string;
}

export interface CandidateOption {
  option: number;
  block_id: string;
  corridor_id: string;
  corridor_label: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  traffic_level: string;
  trains_affected: number;
  expected_delay_min: number;
  score: number;
  recommendation: "Best Option" | "Consider" | "Not Recommended";
  reasons: string[];
}

export interface MaintenanceRequestInput {
  asset_id: string;
  maintenance_type: string;
  required_duration_hrs: number;
  priority: "HIGH" | "MEDIUM" | "LOW";
  preferred_date?: string;
  time_window?: string;
}

export interface PlanVisualization {
  corridor_id: string;
  date: string;
  hours: string[];
  block: {
    asset_label: string;
    start_time: string;
    end_time: string;
    start_pct: number;
    end_pct: number;
  };
  trains: {
    train_id: string;
    train_number: string;
    train_type: string;
    time: string;
    position_pct: number;
    status: "Running" | "Delayed" | "Blocked";
  }[];
}

export interface MaintenanceRequest {
  id: string;
  asset_id: string;
  asset_label: string;
  maintenance_type: string;
  required_duration_hrs: number;
  priority: "HIGH" | "MEDIUM" | "LOW";
  preferred_date?: string;
  time_window?: string;
  candidates: CandidateOption[];
  selected_option?: number | null;
  plan_visualization: PlanVisualization | null;
  created_at: string;
  status: "Generated" | "Approved";
}

interface TrainRecord {
  train_id: string;
  train_number: number | string;
  train_type: string;
  origin: string;
  destination: string;
  corridor_id: string;
  station_from: string;
  station_to: string;
  arrival_time: string;
  departure_time: string;
  scheduled_date: string;
  direction: string;
}

interface NetworkRecord {
  corridor_id: string;
  station_from: string;
  station_to: string;
}

const MAINTENANCE_REQUESTS_KEY = "nexora_maintenance_requests";

const getDataset = <T,>(name: string, limit = 2000) =>
  api.get<T[]>(`/api/datasets/${name}`, { params: { limit } }).then((r) => r.data);

function corridorLabel(corridorId: string, network: NetworkRecord[]) {
  const row = network.find((n) => n.corridor_id === corridorId);
  return row ? `${row.station_from} → ${row.station_to}` : corridorId;
}

function parseTimeWindow(value?: string): [string, string] | null {
  if (!value || value.toLowerCase().includes("anytime")) return null;
  const parts = value.replace(/\s/g, "").split("-");
  if (parts.length !== 2) return null;
  return [parts[0].slice(0, 5), parts[1].slice(0, 5)];
}

function timeToMinutes(value: string) {
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function timeLabelForAxis(hour: number) {
  const h = hour % 24;
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 || 12;
  return `${hour12} ${period}`;
}

function toPct(hhmm: string, baseMinutes: number, totalMinutes: number) {
  const pct = ((timeToMinutes(hhmm) - baseMinutes) / totalMinutes) * 100;
  return Math.max(0, Math.min(100, pct));
}

function readSavedRequests(): MaintenanceRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MAINTENANCE_REQUESTS_KEY);
    return raw ? (JSON.parse(raw) as MaintenanceRequest[]) : [];
  } catch {
    return [];
  }
}

function saveRequests(requests: MaintenanceRequest[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(MAINTENANCE_REQUESTS_KEY, JSON.stringify(requests));
  }
}

export const fetchAssets = async (): Promise<Asset[]> => {
  const [assets, network] = await Promise.all([
    getDataset<any>("assets"),
    getDataset<NetworkRecord>("railway_network"),
  ]);

  return assets.map((a) => {
    const label = `${a.asset_id} · ${a.asset_type} (${corridorLabel(a.corridor_id, network)})`;
    return {
      ...a,
      label,
      corridor_label: corridorLabel(a.corridor_id, network),
    } as Asset;
  });
};

export const fetchMaintenanceTypes = async (): Promise<string[]> => {
  const [tms, smms, tdms] = await Promise.all([
    getDataset<any>("tms_maintenance"),
    getDataset<any>("smms_maintenance"),
    getDataset<any>("tdms_maintenance"),
  ]);

  return Array.from(
    new Set(
      [...tms, ...smms, ...tdms]
        .map((row) => row.maintenance_type)
        .filter(Boolean)
    )
  ).sort();
};

async function buildPlanVisualization(
  block: Block,
  assetLabel: string,
  trains?: TrainRecord[]
): Promise<PlanVisualization> {
  const allTrains =
    trains ?? (await getDataset<TrainRecord>("trains", 2000));

  let same = allTrains.filter(
    (t) => t.corridor_id === block.corridor_id && t.scheduled_date === block.date
  );
  if (!same.length) {
    same = allTrains.filter((t) => t.corridor_id === block.corridor_id);
  }
  same = same.slice(0, 4);

  const sh = Number(block.start_time.slice(0, 2));
  const eh = Number(block.end_time.slice(0, 2));
  const rangeStartH = Math.max(0, sh - 1);
  const rangeEndH = Math.min(23, Math.max(eh + 2, rangeStartH + 4));
  const hours = Array.from(
    { length: rangeEndH - rangeStartH + 1 },
    (_, i) => rangeStartH + i
  );

  const baseMinutes = hours[0] * 60;
  const totalMinutes = hours.length * 60;
  const blockStartPct = toPct(block.start_time, baseMinutes, totalMinutes);
  const blockEndPct = toPct(block.end_time, baseMinutes, totalMinutes);

  const trainsOut = same.map((train) => {
    const refTime = train.departure_time || train.arrival_time;
    const pct = toPct(refTime, baseMinutes, totalMinutes);
    let status: "Running" | "Delayed" | "Blocked" = "Running";

    if (pct >= blockStartPct && pct <= blockEndPct) {
      status = "Blocked";
    } else if (
      Math.abs(pct - blockStartPct) <= 6 ||
      Math.abs(pct - blockEndPct) <= 6
    ) {
      status = "Delayed";
    }

    return {
      train_id: train.train_id,
      train_number: String(train.train_number),
      train_type: train.train_type,
      time: refTime,
      position_pct: Number(pct.toFixed(1)),
      status,
    };
  });

  return {
    corridor_id: block.corridor_id,
    date: block.date,
    hours: hours.map(timeLabelForAxis),
    block: {
      asset_label: assetLabel,
      start_time: block.start_time,
      end_time: block.end_time,
      start_pct: Number(blockStartPct.toFixed(1)),
      end_pct: Number(blockEndPct.toFixed(1)),
    },
    trains: trainsOut,
  };
}

async function generateCandidates(
  input: MaintenanceRequestInput,
  asset: Asset
): Promise<{ candidates: CandidateOption[]; visualization: PlanVisualization | null }> {
  const [blocks, network, trains] = await Promise.all([
    fetchBlocks(asset.corridor_id),
    getDataset<NetworkRecord>("railway_network"),
    getDataset<TrainRecord>("trains", 2000),
  ]);

  let pool = blocks.filter((b) => b.status === "Available");
  const requiredDurationMin = Math.round(input.required_duration_hrs * 60);

  const fitting = pool.filter((b) => b.duration_min >= requiredDurationMin);
  if (fitting.length) pool = fitting;

  if (input.preferred_date) {
    const onDate = pool.filter((b) => b.date === input.preferred_date);
    if (onDate.length) pool = onDate;
  }

  const window = parseTimeWindow(input.time_window);
  if (window) {
    const [start, end] = window;
    const windowed = pool.filter(
      (b) => b.start_time >= start && b.start_time <= end
    );
    if (windowed.length) pool = windowed;
  }

  const trafficDelay: Record<string, number> = { Low: 4, Med: 8, High: 12 };
  const trafficPenalty: Record<string, number> = { Low: 0, Med: 5, High: 12 };
  const label = corridorLabel(asset.corridor_id, network);

  const scored = pool.map((b) => {
    const trainsAffected = Number(b.train_conflict_count) || 0;
    const expectedDelay =
      trainsAffected * (trafficDelay[b.traffic_level] ?? 8);
    const durationGap = Math.abs(b.duration_min - requiredDurationMin);
    const rawScore =
      100 -
      trainsAffected * 10 -
      (trafficPenalty[b.traffic_level] ?? 5) -
      Math.min(durationGap / 10, 10);
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));

    return {
      block: b,
      corridor_label: label,
      trains_affected: trainsAffected,
      expected_delay_min: expectedDelay,
      score,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.trains_affected !== b.trains_affected)
      return a.trains_affected - b.trains_affected;
    return a.block.start_time.localeCompare(b.block.start_time);
  });

  // Keep one result for each time window, then show the best three.
  const unique: typeof scored = [];
  const seen = new Set<string>();
  for (const item of scored) {
    const key = `${item.block.date}|${item.block.start_time}|${item.block.end_time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= 3) break;
  }

  const candidates: CandidateOption[] = unique.map((item, index) => {
    const recommendation =
      index === 0
        ? "Best Option"
        : item.score >= 55
          ? "Consider"
          : "Not Recommended";

    const reasons: string[] = [];
    if (index === 0) {
      reasons.push("Lowest estimated impact among the candidate windows");
      reasons.push("Fits the required maintenance duration");
      reasons.push("Matches the selected corridor and available block");
    }

    return {
      option: index + 1,
      block_id: item.block.block_id,
      corridor_id: item.block.corridor_id,
      corridor_label: item.corridor_label,
      date: item.block.date,
      start_time: item.block.start_time,
      end_time: item.block.end_time,
      duration_min: item.block.duration_min,
      traffic_level: item.block.traffic_level,
      trains_affected: item.trains_affected,
      expected_delay_min: item.expected_delay_min,
      score: item.score,
      recommendation,
      reasons,
    };
  });

  let visualization: PlanVisualization | null = null;
  if (candidates.length) {
    visualization = await buildPlanVisualization(
      unique[0].block,
      asset.label,
      trains
    );
  }

  return { candidates, visualization };
}

export const createMaintenanceRequest = async (
  input: MaintenanceRequestInput
): Promise<MaintenanceRequest> => {
  const assets = await fetchAssets();
  const asset = assets.find((a) => a.asset_id === input.asset_id);
  if (!asset) throw new Error(`Asset '${input.asset_id}' was not found.`);

  const { candidates, visualization } = await generateCandidates(input, asset);
  const id = `REQ-${Date.now()}`;

  const record: MaintenanceRequest = {
    id,
    asset_id: input.asset_id,
    asset_label: asset.label,
    maintenance_type: input.maintenance_type,
    required_duration_hrs: input.required_duration_hrs,
    priority: input.priority,
    preferred_date: input.preferred_date,
    time_window: input.time_window,
    candidates,
    selected_option: candidates[0]?.option ?? null,
    plan_visualization: visualization,
    created_at: new Date().toISOString(),
    status: "Generated",
  };

  const existing = readSavedRequests();
  saveRequests([record, ...existing.filter((r) => r.id !== id)].slice(0, 50));
  return record;
};

export const fetchPlanPreview = async (
  requestId: string,
  option: number
): Promise<PlanVisualization> => {
  const request = readSavedRequests().find((r) => r.id === requestId);
  if (!request) throw new Error("Maintenance request was not found in this browser.");

  const candidate = request.candidates.find((c) => c.option === option);
  if (!candidate) throw new Error("Selected plan option was not found.");

  const block: Block = {
    block_id: candidate.block_id,
    corridor_id: candidate.corridor_id,
    date: candidate.date,
    start_time: candidate.start_time,
    end_time: candidate.end_time,
    duration_min: candidate.duration_min,
    traffic_level: candidate.traffic_level as Block["traffic_level"],
    train_conflict_count: candidate.trains_affected,
    block_type: "Maintenance",
    existing_block: "Yes",
    allowed_departments: "",
    status: "Available",
  };

  return buildPlanVisualization(block, request.asset_label);
};

export const selectPlanOption = async (
  requestId: string,
  option: number
): Promise<MaintenanceRequest> => {
  const requests = readSavedRequests();
  const index = requests.findIndex((r) => r.id === requestId);
  if (index < 0) throw new Error("Maintenance request was not found in this browser.");

  const request = requests[index];
  const candidate = request.candidates.find((c) => c.option === option);
  if (!candidate) throw new Error("Selected plan option was not found.");

  // This is the real FastAPI approval endpoint.
  await approveBlock(candidate.block_id);

  const updated: MaintenanceRequest = {
    ...request,
    selected_option: option,
    status: "Approved",
    plan_visualization: await fetchPlanPreview(requestId, option),
  };

  requests[index] = updated;
  saveRequests(requests);
  return updated;
};

export const fetchMaintenanceRequests = async (): Promise<MaintenanceRequest[]> => {
  return readSavedRequests();
};
