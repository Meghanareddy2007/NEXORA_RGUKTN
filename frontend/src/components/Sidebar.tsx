"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  GanttChartSquare,
  BarChart3,
  TrainFront,
  Circle,
  LogOut,
  BrainCircuit,
  Plus,
  ClipboardList,
  History,
  Zap,
  Radio,
  AlertTriangle,
  Map,
  Wrench,
  FileWarning,
  Sparkles,
  FileBarChart2,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { useAuth, logout, DEPARTMENT_LABELS } from "@/lib/auth";

/* ============================================================
   MAIN / COA / ADMIN NAVIGATION
   ============================================================ */

const MAIN_NAV = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/blocks",
    label: "Block Schedule",
    icon: GanttChartSquare,
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: BarChart3,
  },
  {
    href: "/rl-agent",
    label: "RL Agent",
    icon: BrainCircuit,
  },
];

/* ============================================================
   TDMS NAVIGATION
   These are views inside the existing /tdms page
   ============================================================ */

const TDMS_NAV = [
  {
    href: "/tdms",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/tdms?view=report-problem",
    label: "Report Problem",
    icon: Plus,
  },
  {
    href: "/tdms?view=maintenance",
    label: "Maintenance Tasks",
    icon: ClipboardList,
  },
  {
    href: "/tdms?view=assets",
    label: "Traction Assets",
    icon: Zap,
  },
  {
    href: "/tdms?view=history",
    label: "Maintenance History",
    icon: History,
  },
  {
    href: "/tdms?view=recommendations",
    label: "AI Recommendations",
    icon: BrainCircuit,
  },
];

/* ============================================================
   SMMS NAVIGATION
   Existing SMMS page is kept.
   These links only navigate to its views.
   ============================================================ */

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
  { href: "/smms?view=audit", label: "Audit Trail", icon: History },
];

/* ============================================================
   SIDEBAR
   ============================================================ */

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [online, setOnline] = useState<boolean | null>(null);

  const { user } = useAuth();

  /* ----------------------------------------------------------
     API STATUS
     ---------------------------------------------------------- */

  useEffect(() => {
    api
      .get("/")
      .then(() => setOnline(true))
      .catch(() => setOnline(false));
  }, []);

  /* ----------------------------------------------------------
     LOGIN PAGE
     ---------------------------------------------------------- */

  if (pathname === "/login") {
    return null;
  }

  /* ----------------------------------------------------------
     USER DEPARTMENT
     ---------------------------------------------------------- */

  const department = user?.department;

  const isTMS = department === "TMS";
  const isTDMS = department === "TRACTION";
  const isSMMS = department === "SMMS";
  const isCOA = department === "COA";
  const isADMIN = department === "ADMIN";

  /* ----------------------------------------------------------
     TMS HAS ITS OWN SIDEBAR / CONSOLE
     ---------------------------------------------------------- */

  if (isTMS || pathname.startsWith("/tms")) {
    return null;
  }

  /* ----------------------------------------------------------
     CURRENT VIEW
     ---------------------------------------------------------- */

  const currentView =
    searchParams.get("view") || "dashboard";

  /* ----------------------------------------------------------
     TDMS ACTIVE MENU
     ---------------------------------------------------------- */

  const tdmsActive = (href: string) => {
    const queryIndex = href.indexOf("?");

    // Dashboard
    if (queryIndex === -1) {
      return (
        pathname === "/tdms" &&
        !searchParams.get("view")
      );
    }

    const query = href.substring(queryIndex + 1);
    const params = new URLSearchParams(query);
    const view = params.get("view");

    return (
      pathname === "/tdms" &&
      currentView === view
    );
  };

  /* ----------------------------------------------------------
     SMMS ACTIVE MENU
     ---------------------------------------------------------- */

  const smmsActive = (href: string) => {
    const queryIndex = href.indexOf("?");

    // Dashboard
    if (queryIndex === -1) {
      return (
        pathname === "/smms" &&
        !searchParams.get("view")
      );
    }

    const query = href.substring(queryIndex + 1);
    const params = new URLSearchParams(query);
    const view = params.get("view");

    return (
      pathname === "/smms" &&
      currentView === view
    );
  };

  /* ----------------------------------------------------------
     MAIN NAV ACTIVE MENU
     ---------------------------------------------------------- */

  const mainNavActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }

    return pathname.startsWith(href);
  };

  /* ============================================================
     SIDEBAR UI
     ============================================================ */

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-sidebar p-4 flex flex-col gap-1">

      {/* ======================================================
          HEADER
          ====================================================== */}

      <div className="flex items-center gap-2 px-2 py-3 mb-4">

        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
          <TrainFront className="h-5 w-5 text-primary" />
        </span>

        <span className="font-semibold text-sm leading-tight">

          {isTDMS ? (
            <>
              TDMS
              <br />
              <span className="text-muted-foreground font-normal text-xs">
                Traction Management
              </span>
            </>
          ) : isSMMS ? (
            <>
              SMMS
              <br />
              <span className="text-muted-foreground font-normal text-xs">
                Signal & Telecom
              </span>
            </>
          ) : isCOA ? (
            <>
              COA
              <br />
              <span className="text-muted-foreground font-normal text-xs">
                Corridor Operations
              </span>
            </>
          ) : isADMIN ? (
            <>
              NEXORA
              <br />
              <span className="text-muted-foreground font-normal text-xs">
                Administrator
              </span>
            </>
          ) : (
            <>
              Block Planning
              <br />
              <span className="text-muted-foreground font-normal text-xs">
                SIH PS27
              </span>
            </>
          )}

        </span>
      </div>

      {/* ======================================================
          TDMS USER
          ====================================================== */}

      {isTDMS && (
        <>
          <span className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Traction Management
          </span>

          {TDMS_NAV.map(
            ({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  tdmsActive(href)
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          )}
        </>
      )}

      {/* ======================================================
          SMMS USER
          ====================================================== */}

      {isSMMS && (
        <>
          {SMMS_NAV.map(
            ({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  smmsActive(href)
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          )}
        </>
      )}

      {/* ======================================================
          COA USER
          ====================================================== */}

      {isCOA && (
        <>
          <span className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Corridor Operations
          </span>

          {MAIN_NAV.map(
            ({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  mainNavActive(href)
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          )}
        </>
      )}

      {/* ======================================================
          ADMIN USER
          ====================================================== */}

      {isADMIN && (
        <>
          <span className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Main Operations
          </span>

          {MAIN_NAV.map(
            ({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  mainNavActive(href)
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          )}

          {/* Department dashboards */}

          <span className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Department Dashboards
          </span>

          <Link
            href="/tms"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <TrainFront className="h-4 w-4" />
            TMS
          </Link>

          <Link
            href="/tdms"
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              pathname.startsWith("/tdms")
                ? "bg-primary/15 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Zap className="h-4 w-4" />
            TDMS
          </Link>

          <Link
            href="/smms"
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              pathname.startsWith("/smms")
                ? "bg-primary/15 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Radio className="h-4 w-4" />
            SMMS
          </Link>

          <Link
            href="/coa"
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              pathname.startsWith("/coa")
                ? "bg-primary/15 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <GanttChartSquare className="h-4 w-4" />
            COA
          </Link>
        </>
      )}

      {/* ======================================================
          USER DETAILS
          ====================================================== */}

      {user && (
        <div className="mt-auto rounded-lg border border-border bg-card p-3">

          <div className="text-xs font-medium">
            {user.username}
          </div>

          <div className="text-[11px] text-muted-foreground mb-2">
            {DEPARTMENT_LABELS[user.department]}
          </div>

          <button
            onClick={() => {
              logout();
              window.location.href = "/login";
            }}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </button>

        </div>
      )}

      {/* ======================================================
          SYSTEM STATUS
          ====================================================== */}

      <div
        className={`rounded-lg border border-border bg-card p-3 ${
          user ? "" : "mt-auto"
        }`}
      >

        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
          System Status
        </div>

        <div className="flex items-center gap-1.5 text-sm">

          <Circle
            className={`h-2 w-2 ${
              online === null
                ? "text-muted-foreground"
                : online
                ? "text-success"
                : "text-danger"
            } fill-current`}
          />

          {online === null
            ? "Checking…"
            : online
            ? "Operational"
            : "API Offline"}

        </div>
      </div>

    </aside>
  );
}
