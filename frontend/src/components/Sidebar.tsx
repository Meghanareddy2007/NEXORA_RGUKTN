"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, GanttChartSquare, BarChart3, TrainFront, LogOut, BrainCircuit, Plus, ClipboardList, Zap, Radio, AlertTriangle, Map, Wrench, FileWarning, Sparkles, FileBarChart2, ShieldAlert, SlidersHorizontal, Activity, History } from "lucide-react";
import { api } from "@/lib/api";
import { getAuth, logout as clearAuth, type AuthUser } from "@/lib/auth";

const COA_NAV = [
  { href: "/coa", label: "COA Dashboard", icon: LayoutDashboard },
  { href: "/coa?module=tms", label: "TMS", icon: TrainFront },
  { href: "/coa?module=smms", label: "SMMS", icon: Radio },
  { href: "/coa?module=tdms", label: "TDMS", icon: Zap },
  { href: "/blocks", label: "Block Planning", icon: GanttChartSquare },
  { href: "/coa?view=reports", label: "Reports", icon: FileBarChart2 },
  { href: "/coa?view=audit", label: "Audit Log", icon: History },
  { href: "/map", label: "Digital Twin", icon: Map },
  { href: "/coa?view=what-if", label: "What-If Simulation", icon: SlidersHorizontal },
  { href: "/coa?view=priority", label: "Priority Score", icon: Activity },
  { href: "/coa?view=equipment", label: "Equipment", icon: Wrench },
  { href: "/coa?view=optimizer", label: "Optimizer", icon: GanttChartSquare },
  { href: "/rl-agent", label: "RL Agent", icon: BrainCircuit },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];
const MAIN_NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/blocks", label: "Block Schedule", icon: GanttChartSquare },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/rl-agent", label: "RL Agent", icon: BrainCircuit },
];
const TDMS_NAV = [
  { href: "/tdms", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tdms?view=report-problem", label: "Report Problem", icon: Plus },
  { href: "/tdms?view=maintenance", label: "Maintenance Tasks", icon: ClipboardList },
  { href: "/tdms?view=assets", label: "Traction Assets", icon: Zap },
  { href: "/tdms?view=history", label: "Maintenance History", icon: History },
  { href: "/tdms?view=recommendations", label: "AI Recommendations", icon: BrainCircuit },
];
const SMMS_NAV = [
  { href: "/smms", label: "Dashboard", icon: LayoutDashboard },
  { href: "/smms?view=assets", label: "Signalling Assets", icon: Radio },
  { href: "/smms?view=failures", label: "Signalling Failures", icon: AlertTriangle },
  { href: "/smms?view=map", label: "Signalling Map", icon: Map },
  { href: "/smms?view=maintenance", label: "Maintenance Queue", icon: Wrench },
  { href: "/smms?view=report-problem", label: "Report Problem", icon: FileWarning },
  { href: "/smms?view=insights", label: "Command Insights", icon: Sparkles },
  { href: "/smms?view=reports", label: "Reports", icon: FileBarChart2 },
  { href: "/smms?view=conflicts", label: "Conflict Radar", icon: ShieldAlert },
  { href: "/smms?view=analytics", label: "Analytics", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => { setUser(getAuth()); api.get("/").then(()=>setOnline(true)).catch(()=>setOnline(false)); }, []);
  useEffect(() => { const onStorage=()=>setUser(getAuth()); window.addEventListener("storage",onStorage); return ()=>window.removeEventListener("storage",onStorage); }, []);

  if (pathname === "/login") return null;
  // TMS renders its own original sidebar inside TmsDashboard.
  if (pathname === "/tms") return null;

  const department = user?.department;
  const isTdms = pathname.startsWith("/tdms") || department === "TRACTION";
  const isSmms = pathname.startsWith("/smms") || department === "SMMS";
  const isMainAdmin = department === "COA" || user?.role === "COA_ADMIN";
  // Keep the COA command menu visible while navigating its global
  // operations pages. Previously /blocks switched the sidebar back to the
  // generic MAIN_NAV, which made most COA options disappear.
  const isCoaPage = pathname.startsWith("/coa");
  const isCoaOperationsPage =
    isCoaPage ||
    pathname.startsWith("/blocks") ||
    pathname.startsWith("/map") ||
    pathname.startsWith("/analytics") ||
    pathname.startsWith("/rl-agent");
  const currentView = searchParams.get("view") || "dashboard";
  const currentModule = searchParams.get("module") || "";

  const active = (href: string) => {
    const [path, query] = href.split("?");
    if (path === "/coa") {
      const p = new URLSearchParams(query || "");
      return pathname === "/coa" && (p.get("module") ? currentModule === p.get("module") : currentView === (p.get("view") || "dashboard"));
    }
    if (path === "/tdms") return pathname === "/tdms" && currentView === (query ? new URLSearchParams(query).get("view") : "dashboard");
    if (path === "/smms") return pathname === "/smms" && currentView === (query ? new URLSearchParams(query).get("view") : "dashboard");
    return pathname === path || pathname.startsWith(path + "/");
  };

  const nav = isCoaOperationsPage && isMainAdmin
    ? COA_NAV
    : isSmms
      ? SMMS_NAV
      : isTdms
        ? TDMS_NAV
        : isMainAdmin
          ? MAIN_NAV
          : MAIN_NAV;

  const title = isCoaOperationsPage && isMainAdmin
    ? ["COA", "Corridor Operations"]
    : isSmms
      ? ["SMMS", "Signal & Telecom"]
      : isTdms
        ? ["TDMS", "Traction Management"]
        : ["NEXORA", "SIH PS27"];

  function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    clearAuth();
    window.location.assign("/login");
  }

  return <aside className="w-60 shrink-0 border-r border-border bg-sidebar p-4 flex flex-col gap-1 min-h-screen">
    <div className="flex items-center gap-2 px-2 py-3 mb-4"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15"><TrainFront className="h-5 w-5 text-primary" /></span><span className="font-semibold text-sm leading-tight">{title[0]}<br/><span className="text-muted-foreground font-normal text-xs">{title[1]}</span></span></div>
    <span className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{isCoaOperationsPage && isMainAdmin ? "Corridor Operations" : isSmms ? "Signal & Telecom" : isTdms ? "Traction Management" : "Operations"}</span>
    {nav.map(({href,label,icon:Icon})=><Link key={href} href={href} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${active(href)?"bg-primary/15 text-primary font-medium":"text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon className="h-4 w-4"/>{label}</Link>)}
    {isMainAdmin && !isCoaOperationsPage && <><span className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Department Dashboards</span><Link href="/tms" className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><TrainFront className="h-4 w-4"/>TMS</Link><Link href="/tdms" className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><Zap className="h-4 w-4"/>TDMS</Link><Link href="/smms" className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><Radio className="h-4 w-4"/>SMMS</Link><Link href="/coa" className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><GanttChartSquare className="h-4 w-4"/>COA</Link></>}
    <div className="flex-1"/>
    {user && <div className="mb-2 rounded-lg border border-border bg-card p-3"><div className="text-xs font-medium">{user.username}</div><div className="text-[10px] text-muted-foreground">{user.department} · {user.role_label}</div></div>}
    <div className="border-t border-border pt-3 mt-1"><button type="button" onClick={handleLogout} disabled={loggingOut} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"><LogOut className="h-4 w-4"/>{loggingOut?"Logging out...":"Logout"}</button></div>
    <div className="rounded-lg border border-border bg-card p-3"><div className="text-xs font-medium text-muted-foreground mb-1">System Status</div><div className="flex items-center gap-1.5 text-sm"><span className={`h-2 w-2 rounded-full ${online===null?"bg-muted-foreground":online?"bg-success":"bg-danger"}`}/>{online===null?"Checking…":online?"Operational":"API Offline"}</div></div>
  </aside>;
}
