"use client";

export type SignallingMapStatus = "healthy" | "attention" | "failure" | "maintenance" | "inactive";
export type SignallingSeverity = "Low" | "Medium" | "High" | "Critical";

export interface SignallingMapSection { corridor_id:string; label:string; station_from:string; station_to:string; distance_km:number; track_count:number; electrified:string; section_type:string; traffic_density:string; }
export interface SignallingMapStation { id:string; code:string; name:string; division:string; platforms:number; is_junction:boolean; latitude:number; longitude:number; x:number; y:number; }
export interface SignallingMapMaintenanceRecord { task_id:string; maintenance_type:string; defect_type:string; status:string; priority:SignallingSeverity; due_date:string; overdue_days:number; estimated_duration_min:number; crew_required:number; criticality:number; safety_risk:number; is_failure:boolean; severity:SignallingSeverity|null; }
export interface SignallingMapAsset { map_id:string; asset_id:string; asset_type:string; category:string; source:"register"|"maintenance"; corridor_id:string; section_label:string; section_length_km:number; station_from:string; station_to:string; location_km:number; position:{latitude:number;longitude:number;x:number;y:number;exact:boolean}; status:SignallingMapStatus; status_label:string; status_basis:string; register_status:string|null; criticality_rating:number|null; criticality_source:"register"|"maintenance"; availability_target_pct:number|null; failure_risk:number|null; last_maintenance_date:string|null; next_due_date:string|null; is_critical_asset:boolean; is_failure:boolean; has_open_maintenance:boolean; failure_severity:SignallingSeverity|null; maintenance:SignallingMapMaintenanceRecord[]; notes:string[]; }
export interface SignallingMapCategory { category:string; asset_types:string[]; count:number; available:boolean; note:string|null; }
export interface SignallingMapData { generated_at:string; sections:SignallingMapSection[]; stations:SignallingMapStation[]; assets:SignallingMapAsset[]; coverage:{categories:SignallingMapCategory[];register_assets:number;maintenance_records:number;assets_on_map:number;assets_without_exact_position:number;assets_not_placed:number;critical_asset_rule:string}; }

export interface ProblemReportOptions { problem_types:string[]; severities:string[]; immediate_actions:string[]; description_min_length:number; description_max_length:number; }
export interface ProblemReportInput { asset_id:string; problem_type:string; severity:string; immediate_action:string; description:string; }
export interface ProblemReport extends ProblemReportInput { report_id:string; reported_at:string; reported_by:string; status:string; }

export interface DigitalTwinStation { id:string; code:string|null; name:string|null; division:string|null; }
export interface DigitalTwinRecord { task_id:string; maintenance_type:string; defect_type:string; status:string; priority:SignallingSeverity; severity:SignallingSeverity|null; due_date:string; overdue_days:number; estimated_duration_min:number; crew_required:number; criticality:number; safety_risk:number; is_failure_type:boolean; is_open:boolean; }
export interface DigitalTwinAlert { level:"critical"|"warning"|"info"; title:string; detail:string; source:string; ref:string|null; }
export type DigitalTwinEventKind = "maintenance"|"failure"|"problem";
export interface DigitalTwinEvent { id:string; date:string|null; date_kind:"performed"|"due"|"reported"; kind:DigitalTwinEventKind; state:string; title:string; detail:string; severity:string|null; status:string|null; ref:string|null; }
export interface DigitalTwin {
  generated_at:string; twin_id:string;
  identity:{asset_id:string;asset_type:string;category:string;source:"register"|"maintenance";maintenance_record_ids:string[]};
  location:{corridor_id:string;section_label:string;section_length_km:number;location_km:number;position_exact:boolean;latitude:number|null;longitude:number|null;station_from:DigitalTwinStation;station_to:DigitalTwinStation;track_count:number|null;section_type:string|null;electrified:string|null;traffic_density:string|null};
  condition:{status:SignallingMapStatus;status_label:string;status_basis:string;register_status:string|null;health:{percent:number|null;status:SignallingMapStatus;status_label:string;basis:string};risk:{level:SignallingSeverity|null;failure_risk:number|null;basis:string};criticality_rating:number|null;criticality_source:"register"|"maintenance";availability_target_pct:number|null;is_critical_asset:boolean};
  summary:{open_failures:number;open_maintenance:number;overdue_maintenance:number;open_problem_reports:number|null};
  alerts:DigitalTwinAlert[];
  maintenance:{last:{date:string;source:string}|null;next:{date:string;source:string;task_id:string|null;overdue_days:number|null}|null;open:DigitalTwinRecord[];history:DigitalTwinRecord[];counts:{total:number;open:number;completed:number;overdue:number}};
  failures:{open:DigitalTwinRecord[];history:DigitalTwinRecord[];counts:{total:number;open:number;completed:number}};
  problem_reports:{available:boolean;reason:string|null;note:string|null;items:ProblemReport[]};
  timeline:DigitalTwinEvent[]; unavailable:{key:string;label:string;reason:string}[]; notes:string[]; actions:{report_problem:{available:boolean;reason:string|null}};
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
function authToken(){ if(typeof window === "undefined") return ""; try{return JSON.parse(localStorage.getItem("nexora_auth")||"{}").access_token||"";}catch{return "";} }
async function request<T>(path:string, init:RequestInit={}){ const h=new Headers(init.headers); h.set("Content-Type","application/json"); const t=authToken(); if(t) h.set("Authorization",`Bearer ${t}`); const r=await fetch(`${API_BASE}${path}`,{...init,headers:h}); if(!r.ok){let msg=`Request failed (${r.status})`; try{const b=await r.json(); msg=typeof b?.detail==="string"?b.detail:(b?.detail?.message||msg);}catch{} throw new Error(msg);} return r.status===204?undefined as T:r.json() as Promise<T>; }

export const fetchSignallingMap=()=>request<SignallingMapData>("/api/smms/signalling-map");
export const fetchProblemReports=(params?:{status?:string;severity?:string;asset_id?:string;limit?:number})=>{const q=new URLSearchParams(); Object.entries(params||{}).forEach(([k,v])=>v!=null&&q.set(k,String(v))); return request<ProblemReport[]>(`/api/smms/problem-reports${q.toString()?`?${q}`:""}`);};
export const fetchProblemReportOptions=()=>request<ProblemReportOptions>("/api/smms/problem-reports/options");
export const createProblemReport=(payload:ProblemReportInput)=>request<ProblemReport>("/api/smms/problem-reports",{method:"POST",body:JSON.stringify(payload)});
export const fetchDigitalTwin=(twinId:string)=>request<DigitalTwin>(`/api/smms/digital-twin/${encodeURIComponent(twinId)}`);
