import axios from "axios";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE,
});

// Attach the logged-in user's token to every outgoing request.
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem("nexora_auth");

    if (raw) {
      try {
        const { access_token } = JSON.parse(raw);

        if (access_token) {
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${access_token}`;
        }
      } catch {
        /* ignore malformed storage */
      }
    }
  }

  return config;
});

// If the backend returns 401, clear stale authentication.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      err?.response?.status === 401 &&
      typeof window !== "undefined"
    ) {
      window.localStorage.removeItem("nexora_auth");
      window.dispatchEvent(new Event("nexora-auth-changed"));
    }

    return Promise.reject(err);
  }
);

// ============================================================================
// CORE DASHBOARD TYPES
// ============================================================================

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

  delay_avoided_chart: {
    manual_min: number;
    ai_optimized_min: number;
  };

  alerts: Alert[];
}

// ============================================================================
// ANALYTICS DATASET TYPES
// ============================================================================

export interface RawMaintenanceTask {
  task_id: string;
  asset_id: string;
  corridor_id: string;
  location_km: number;
  asset_type?: string;
  defect_type: string;
  maintenance_type: string;
  criticality: number;
  urgency: number;
  safety_risk: number;
  due_date: string;
  overdue_days: number;
  estimated_duration_min: number;
  crew_required: number;
  status:
    | "Pending"
    | "In Progress"
    | "Scheduled"
    | "Completed"
    | string;
}

export interface MaintenanceTask extends RawMaintenanceTask {
  source: "TMS" | "SMMS" | "TDMS";
  department: "Engineering" | "Signal" | "Traction";
}

export interface NetworkCorridor {
  corridor_id: string;
  station_from: string;
  station_to: string;
  distance_km: number;
  track_count: number;
  electrified: "Yes" | "No";
  section_type: string;
  traffic_density: "Low" | "Med" | "High";
}

export interface AssetRecord {
  asset_id: string;
  asset_type: string;
  department: string;
  corridor_id: string;
  location_km: number;
  asset_criticality: number;
  availability_target_pct: number;
  current_status:
    | "Normal"
    | "Degraded"
    | "Critical"
    | string;
  last_maintenance_date: string;
  next_due_date: string;
  failure_risk: number;
}

export interface CorridorRisk {
  corridor_id: string;
  avg_failure_risk: number;
  asset_count: number;
  critical_assets: number;
}

// ============================================================================
// TDMS
// ============================================================================

export interface TDMSProblemFormData {
  asset_id: string;
  asset_type: string;
  corridor_id: string;
  location_km: string;
  defect_type: string;
  problem_description: string;
  criticality: number;
  urgency: number;
  safety_risk: number;
  maintenance_type: string;
  required_duration_hrs: number;
  preferred_date?: string;
  time_window?: string;
}

const TASK_SOURCE_MAP: {
  name: string;
  source: MaintenanceTask["source"];
  department: MaintenanceTask["department"];
}[] = [
  {
    name: "tms_maintenance",
    source: "TMS",
    department: "Engineering",
  },
  {
    name: "smms_maintenance",
    source: "SMMS",
    department: "Signal",
  },
  {
    name: "tdms_maintenance",
    source: "TDMS",
    department: "Traction",
  },
];

export const fetchDataset = <T,>(
  name: string,
  corridor_id?: string
) =>
  api
    .get<T[]>(`/api/datasets/${name}`, {
      params: {
        corridor_id,
        limit: 2000,
      },
    })
    .then((r) => r.data);

/**
 * Combines TMS + SMMS + TDMS maintenance tasks
 * into one common task pool.
 */
export const fetchAllTasks = (): Promise<MaintenanceTask[]> =>
  Promise.all(
    TASK_SOURCE_MAP.map(
      ({ name, source, department }) =>
        fetchDataset<RawMaintenanceTask>(name).then(
          (rows) =>
            rows.map((r) => ({
              ...r,
              source,
              department,
            }))
        )
    )
  ).then((groups) => groups.flat());

export const fetchNetworkDataset = () =>
  fetchDataset<NetworkCorridor>("railway_network");

export const fetchAssetsDataset = () =>
  fetchDataset<AssetRecord>("assets");

// ============================================================================
// ANALYTICS / DASHBOARD APIs
// ============================================================================

export const fetchDashboard = () =>
  api
    .get<DashboardSummary>("/api/analytics/dashboard")
    .then((r) => r.data);

export const approveBlock = (block_id: string) =>
  api
    .post<{ block_id: string; status: string }>(
      `/api/blocks/${block_id}/approve`
    )
    .then((r) => r.data);

export const fetchKpis = () =>
  api
    .get<KpiSummary>("/api/analytics/kpi")
    .then((r) => r.data);

export const fetchBlocks = (corridor_id?: string) =>
  api
    .get<Block[]>("/api/blocks", {
      params: { corridor_id },
    })
    .then((r) => r.data);

export const fetchNetwork = () =>
  api.get("/api/network").then((r) => r.data);

export const fetchCorridorRisk = () =>
  api
    .get<CorridorRisk[]>("/api/analytics/corridor-risk")
    .then((r) => r.data);

export const runOptimization = (
  max_tasks = 150,
  max_blocks = 60
) =>
  api
    .post<OptimizeResult>(
      "/api/optimize/run",
      null,
      {
        params: {
          max_tasks,
          max_blocks,
        },
      }
    )
    .then((r) => r.data);

// ============================================================================
// RAILWAY OPERATIONS
// ============================================================================

export type RouteStatus =
  | "AVAILABLE"
  | "MAINTENANCE_SCHEDULED"
  | "UNDER_MAINTENANCE"
  | "BLOCKED"
  | "EMERGENCY_BLOCK"
  | "ACTIVE_TRAIN"
  | "ALTERNATIVE_AVAILABLE";

export interface Station {
  id: string;
  name: string;
  code: string;
  division: string;
  zone: string;
  platforms: number;
  latitude: number;
  longitude: number;
  schematic_x: number;
  schematic_y: number;
  is_junction: boolean;
}

export interface Route {
  id: string;
  source_station: string;
  destination_station: string;
  status: RouteStatus;
  distance: number;
  capacity: number;
  track_count: number;
  electrified: string;
  speed_limit_kmh: number;
  category: string;
}

export type TrainType =
  | "Express"
  | "Passenger"
  | "Freight";

export type TrainStatus =
  | "RUNNING"
  | "SCHEDULED"
  | "DELAYED"
  | "REROUTED"
  | "ARRIVED";

export interface Train {
  id: string;
  name: string;
  type: TrainType;
  origin: string;
  destination: string;
  current_route: string;
  progress_percentage: number;
  speed: number;
  direction: "Up" | "Down";
  status: TrainStatus;
  scheduled_route: string[];
  alternative_route?: string[];
  is_rerouted: boolean;
  departure_time: string;
  expected_arrival: string;
  delay_minutes: number;
  color: string;
}

export interface MaintenanceBlock {
  id: string;
  route_id: string;
  location: string;
  source_station: string;
  destination_station: string;
  departments: string;
  department_list: string[];
  activity: string;
  start_time: string;
  end_time: string;
  priority:
    | "High"
    | "Medium"
    | "Low"
    | "Emergency";
  status:
    | "SCHEDULED"
    | "IN_PROGRESS"
    | "UNDER_MAINTENANCE"
    | "COMPLETED";
  estimated_delay_min: number;
  alternative_corridor?: string;
  allowed_tracks?: string;
  description?: string;
}

export interface AlertItem {
  id: string;
  type:
    | "ROUTE_BLOCKED"
    | "TRAIN_CONFLICT"
    | "EMERGENCY_BLOCK";
  severity:
    | "CRITICAL"
    | "HIGH"
    | "MEDIUM"
    | "INFO";
  title: string;
  message: string;
  route_id?: string;
  block_id?: string;
  train_id?: string;
  suggested_action?: string;
  alternative_route?: string[];
}

export interface LiveOpsMetrics {
  active_trains: number;
  active_maintenance_blocks: number;
  unavailable_routes: number;
  delayed_trains: number;
}

export interface SimulationState {
  simulation_time?: string;
  active_date?: string;
  available_dates?: string[];
  metrics: LiveOpsMetrics;
  stations: Station[];
  routes: Route[];
  trains: Train[];
  maintenance_blocks: MaintenanceBlock[];
  alerts: AlertItem[];
}

// ============================================================================
// RAILWAY OPERATIONS APIs
// ============================================================================

export const fetchStations = () =>
  api
    .get<Station[]>("/api/stations")
    .then((r) => r.data);

export const fetchRoutes = (date?: string) =>
  api
    .get<Route[]>("/api/routes", {
      params: { date },
    })
    .then((r) => r.data);

export const fetchTrains = (date?: string) =>
  api
    .get<Train[]>("/api/trains", {
      params: { date },
    })
    .then((r) => r.data);

export const fetchMaintenanceBlocks = (date?: string) =>
  api
    .get<MaintenanceBlock[]>(
      "/api/maintenance-blocks",
      {
        params: { date },
      }
    )
    .then((r) => r.data);

export const fetchRouteStatus = (date?: string) =>
  api
    .get<Record<string, any>>(
      "/api/route-status",
      {
        params: { date },
      }
    )
    .then((r) => r.data);

export const fetchAlerts = (date?: string) =>
  api
    .get<AlertItem[]>("/api/alerts", {
      params: { date },
    })
    .then((r) => r.data);

export const fetchLiveState = (
  date?: string,
  time?: string
) =>
  api
    .get<SimulationState>("/api/live/state", {
      params: {
        date,
        time,
      },
    })
    .then((r) => r.data);

export const fetchSimulationState = (
  time: string,
  date?: string
) =>
  api
    .get<SimulationState>("/api/simulation/state", {
      params: {
        time,
        date,
      },
    })
    .then((r) => r.data);

// ============================================================================
// SIMULATION APIs
// ============================================================================

export const triggerReroute = (train_id: string) =>
  api
    .post<{
      success: boolean;
      train_id: string;
      new_route: string[];
      delay_minutes: number;
      status: string;
    }>(
      "/api/simulation/reroute",
      {
        train_id,
      }
    )
    .then((r) => r.data);

export const triggerEmergencyBlock = (
  route_id: string,
  reason: string
) =>
  api
    .post<{
      success: boolean;
      block: MaintenanceBlock;
    }>(
      "/api/simulation/emergency-block",
      {
        route_id,
        reason,
      }
    )
    .then((r) => r.data);

export const triggerReoptimize = (
  train_id?: string
) =>
  api
    .post(
      "/api/reoptimize",
      null,
      {
        params: {
          train_id,
        },
      }
    )
    .then((r) => r.data);

export const triggerScheduleOptimization = () =>
  api
    .post("/api/optimize-schedule")
    .then((r) => r.data);

export const predictAiPriority = (payload: {
  criticality: number;
  urgency: number;
  safety_risk: number;
  overdue_days: number;
  gross_million_tonnes?: number;
  track_age_years?: number;
  is_peak_hour?: boolean;
}) =>
  api
    .post("/api/ai/predict-priority", payload)
    .then((r) => r.data);

// ============================================================================
// BLOCK PLANNER
// ============================================================================

export interface Asset {
  asset_id: string;
  asset_type: string;
  department: string;
  corridor_id: string;
  corridor_label: string;
  current_status: string;
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
  recommendation: string;
  reasons: string[];
}

export interface MaintenanceRequest {
  id: number;

  asset_id: string;
  asset_label?: string;

  corridor_id: string;
  corridor_label?: string;

  maintenance_type?: string;
  defect_type?: string;

  location_km?: number;
  criticality?: number;
  urgency?: number;
  safety_risk?: number;
  crew_required?: number;

  required_duration_hrs?: number;
  priority?: string;
  preferred_date?: string;
  time_window?: string;

  reported_by?: string;

  status: string;

  candidates: CandidateOption[];

  selected_option_index?: number;
  selected_block_id?: string;

  created_at: string;
  updated_at: string;
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

// ============================================================================
// BLOCK PLANNER APIs
// ============================================================================

export const fetchAssets = () =>
  api
    .get<Asset[]>("/api/plan/assets")
    .then((r) => r.data);

export const fetchMaintenanceTypes = () =>
  api
    .get<string[]>("/api/plan/maintenance-types")
    .then((r) => r.data);

export const createMaintenanceRequest = (
  payload: any
) =>
  api
    .post<MaintenanceRequest>(
      "/api/plan/requests",
      payload
    )
    .then((r) => r.data);

export const fetchMaintenanceRequests = () =>
  api
    .get<MaintenanceRequest[]>(
      "/api/plan/requests"
    )
    .then((r) => r.data);

export const fetchMaintenanceRequest = (
  requestId: number
) =>
  api
    .get<MaintenanceRequest>(
      `/api/plan/requests/${requestId}`
    )
    .then((r) => r.data);

export const fetchPlanPreview = (
  requestId: number,
  option: number
) =>
  api
    .get<PlanVisualization>(
      `/api/plan/requests/${requestId}/preview/${option}`
    )
    .then((r) => r.data);

export const selectPlanOption = (
  requestId: number,
  option: number
) =>
  api
    .post<MaintenanceRequest>(
      `/api/plan/requests/${requestId}/select`,
      {
        option,
      }
    )
    .then((r) => r.data);

// ============================================================================
// REINFORCEMENT LEARNING
// ============================================================================

export type RlTrafficLevel =
  | "Low"
  | "Med"
  | "High";

export type RlBacklogLevel =
  | "Low"
  | "Med"
  | "High";

export type RlAction =
  | "DEFER"
  | "MODERATE_RELEASE"
  | "AGGRESSIVE_RELEASE";

export interface RlPolicyRow {
  traffic_level: RlTrafficLevel;
  backlog_level: RlBacklogLevel;
  best_action: RlAction;
  best_action_label: string;
  q_values: Record<RlAction, number>;
}

export interface RlSummary {
  trained_episodes: number;
  epsilon: number;
  reward_curve: number[];
  avg_reward_first_10: number;
  avg_reward_last_20: number;
  policy: RlPolicyRow[];
}

export interface RlRecommendation {
  state: {
    traffic_level: RlTrafficLevel;
    backlog_level: RlBacklogLevel;
  };

  recommended_action: RlAction;
  recommended_action_label: string;

  q_values: Record<RlAction, number>;

  confidence_gap: number;
  trained_episodes: number;
}

export const fetchRlSummary = () =>
  api
    .get<RlSummary>("/api/rl/summary")
    .then((r) => r.data);

export const trainRlAgent = (
  episodes = 200
) =>
  api
    .post<RlSummary>(
      "/api/rl/train",
      null,
      {
        params: {
          episodes,
        },
      }
    )
    .then((r) => r.data);

export const fetchRlRecommendation = (
  traffic_level: RlTrafficLevel,
  backlog_level: RlBacklogLevel
) =>
  api
    .get<RlRecommendation>(
      "/api/rl/recommend",
      {
        params: {
          traffic_level,
          backlog_level,
        },
      }
    )
    .then((r) => r.data);