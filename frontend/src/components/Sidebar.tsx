"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  GanttChartSquare,
  Map,
  BarChart3,
  TrainFront,
  Circle,
  LogOut,
  BrainCircuit,
  Plus,
  ClipboardList,
  House,
  History,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth, logout, DEPARTMENT_LABELS } from "@/lib/auth";

const NAV = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/map",
    label: "RailOps Command Map",
    icon: Map,
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

/*
 * TDMS navigation
 *
 * These are NOT separate pages.
 * They are different views/sections of the existing /tdms page.
 *
 * The reference image is only being used for the style/idea.
 * We are NOT copying all of its menu items.
 */
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

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [online, setOnline] = useState<boolean | null>(null);

  const { user } = useAuth();

  useEffect(() => {
    api
      .get("/")
      .then(() => setOnline(true))
      .catch(() => setOnline(false));
  }, []);

  if (pathname === "/login") return null;

  /*
   * TDMS / Traction user
   */
  const isTDMS = user?.department === "TRACTION";

  /*
   * COA and ADMIN can access the main operations area
   * and TDMS-related information.
   */
  const isCOA =
    user?.department === "COA" ||
    user?.department === "ADMIN";

  /*
   * Current TDMS view.
   *
   * Example:
   * /tdms
   * /tdms?view=report-problem
   * /tdms?view=assets
   */
  const currentView =
    searchParams.get("view") || "dashboard";

  const tdmsActive = (href: string) => {
    const queryIndex = href.indexOf("?");

    /*
     * Dashboard
     */
    if (queryIndex === -1) {
      return (
        pathname === "/tdms" &&
        !searchParams.get("view")
      );
    }

    /*
     * Other TDMS views
     */
    const query = href.substring(queryIndex + 1);
    const params = new URLSearchParams(query);
    const view = params.get("view");

    return (
      pathname === "/tdms" &&
      currentView === view
    );
  };

  const mainNavActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }

    return pathname.startsWith(href);
  };

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-sidebar p-4 flex flex-col gap-1">

      {/* ============================================================
          HEADER
          ============================================================ */}

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

      {/* ============================================================
          TDMS USER
          ============================================================ */}

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

      {/* ============================================================
          COA / ADMIN
          ============================================================ */}

      {isCOA && (
        <>
          <span className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Main Operations
          </span>

          {NAV.map(
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

          <span className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            TDMS
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

      {/* ============================================================
          TMS / SMMS / OTHER USERS
          ============================================================ */}

      {!isTDMS && !isCOA && (
        <>
          <span className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Menu
          </span>

          {NAV.map(
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

      {/* ============================================================
          USER
          ============================================================ */}

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

      {/* ============================================================
          SYSTEM STATUS
          ============================================================ */}

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