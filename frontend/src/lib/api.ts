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
/* Block Planning APIs                                                        */
/* These functions connect directly to the FastAPI Block Planning module.    */
/* -------------------------------------------------------------------------- */

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

export type TrainType = "Express" | "Passenger" | "Freight";
export type TrainStatus = "RUNNING" | "SCHEDULED" | "DELAYED" | "REROUTED" | "ARRIVED";

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
  priority: "High" | "Medium" | "Low" | "Emergency";
  status: "SCHEDULED" | "IN_PROGRESS" | "UNDER_MAINTENANCE" | "COMPLETED";
  estimated_delay_min: number;
  alternative_corridor?: string;
  allowed_tracks?: string;
  description?: string;
}

export interface AlertItem {
  id: string;
  type: "ROUTE_BLOCKED" | "TRAIN_CONFLICT" | "EMERGENCY_BLOCK";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
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

export const fetchStations = () => api.get<Station[]>("/api/stations").then((r) => r.data);
export const fetchRoutes = (date?: string) => api.get<Route[]>("/api/routes", { params: { date } }).then((r) => r.data);
export const fetchTrains = (date?: string) => api.get<Train[]>("/api/trains", { params: { date } }).then((r) => r.data);
export const fetchMaintenanceBlocks = (date?: string) =>
  api.get<MaintenanceBlock[]>("/api/maintenance-blocks", { params: { date } }).then((r) => r.data);
export const fetchRouteStatus = (date?: string) => api.get<Record<string, any>>("/api/route-status", { params: { date } }).then((r) => r.data);
export const fetchAlerts = (date?: string) => api.get<AlertItem[]>("/api/alerts", { params: { date } }).then((r) => r.data);
export const fetchLiveState = (date?: string, time?: string) =>
  api.get<SimulationState>("/api/live/state", { params: { date, time } }).then((r) => r.data);
export const fetchSimulationState = (time: string, date?: string) =>
  api.get<SimulationState>("/api/simulation/state", { params: { time, date } }).then((r) => r.data);

export const triggerReroute = (train_id: string) =>
  api.post<{ success: boolean; train_id: string; new_route: string[]; delay_minutes: number; status: string }>(
    "/api/simulation/reroute",
    { train_id }
  ).then((r) => r.data);

export const triggerEmergencyBlock = (route_id: string, reason: string) =>
  api.post<{ success: boolean; block: MaintenanceBlock }>("/api/simulation/emergency-block", {
    route_id,
    reason,
  }).then((r) => r.data);

export const triggerReoptimize = (train_id?: string) =>
  api.post("/api/reoptimize", null, { params: { train_id } }).then((r) => r.data);

export const triggerScheduleOptimization = () =>
  api.post("/api/optimize-schedule").then((r) => r.data);

export const predictAiPriority = (payload: {
  criticality: number;
  urgency: number;
  safety_risk: number;
  overdue_days: number;
  gross_million_tonnes?: number;
  track_age_years?: number;
  is_peak_hour?: boolean;
}) => api.post("/api/ai/predict-priority", payload).then((r) => r.data);

// ============================================================================
// BLOCK PLANNER TYPES & APIS
// ============================================================================

export interface Asset {
  asset_id: string;
  asset_type: string;
  department: string;
  corridor_id: string;
  location_km?: number;
  asset_criticality?: number;
  availability_target_pct?: number;
  last_maintenance_date?: string;
  next_due_date?: string;
  failure_risk?: number;
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
  id: number;
  asset_id: string;
  asset_label?: string;
  corridor_id: string;
  corridor_label?: string;
  maintenance_type?: string;
  required_duration_hrs?: number;
  priority?: "HIGH" | "MEDIUM" | "LOW";
  preferred_date?: string;
  time_window?: string;
  status: string;
  candidates: CandidateOption[];
  selected_option_index?: number | null;
  selected_block_id?: string | null;
  created_at: string;
  updated_at: string;
}

export const fetchAssets = () => api.get<Asset[]>("/api/plan/assets").then((r) => r.data);
export const fetchMaintenanceTypes = () => api.get<string[]>("/api/plan/maintenance-types").then((r) => r.data);
export const createMaintenanceRequest = (payload:MaintenanceRequestInput ) =>
  api.post<MaintenanceRequest>("/api/plan/requests", payload).then((r) => r.data);
export const fetchMaintenanceRequests = () =>
  api.get<MaintenanceRequest[]>("/api/plan/requests").then((r) => r.data);
export const fetchPlanPreview = (requestId: number, option: number) =>
  api.get<PlanVisualization>(`/api/plan/requests/${requestId}/preview/${option}`).then((r) => r.data);
export const selectPlanOption = (requestId: number, option: number) =>
  api.post<MaintenanceRequest>(`/api/plan/requests/${requestId}/select`, { option }).then((r) => r.data);

