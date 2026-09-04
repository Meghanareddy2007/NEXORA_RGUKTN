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

export const fetchDashboard = () => api.get<DashboardSummary>("/api/analytics/dashboard").then((r) => r.data);
export const approveBlock = (block_id: string) =>
  api.post<{ block_id: string; status: string }>(`/api/blocks/${block_id}/approve`).then((r) => r.data);
export const fetchKpis = () => api.get<KpiSummary>("/api/analytics/kpi").then((r) => r.data);
export const fetchBlocks = (corridor_id?: string) =>
  api.get<Block[]>("/api/blocks", { params: { corridor_id } }).then((r) => r.data);
export const fetchNetwork = () => api.get("/api/network").then((r) => r.data);
export const fetchCorridorRisk = () => api.get("/api/analytics/corridor-risk").then((r) => r.data);
export const runOptimization = (max_tasks = 150, max_blocks = 60) =>
  api
    .post<OptimizeResult>("/api/optimize/run", null, { params: { max_tasks, max_blocks } })
    .then((r) => r.data);
