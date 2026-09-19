"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, GanttChartSquare, Map, BarChart3, TrainFront, Circle, LogOut, BrainCircuit } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth, logout, DEPARTMENT_LABELS } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/map", label: "RailOps Command Map", icon: Map },
  { href: "/blocks", label: "Block Schedule", icon: GanttChartSquare },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/rl-agent", label: "RL Agent", icon: BrainCircuit },
];

export function Sidebar() {
  const pathname = usePathname();
  const [online, setOnline] = useState<boolean | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    api
      .get("/")
      .then(() => setOnline(true))
      .catch(() => setOnline(false));
  }, []);

  // No sidebar on the login screen itself.
  if (pathname === "/login") return null;

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-sidebar p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 px-2 py-3 mb-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
          <TrainFront className="h-5 w-5 text-primary" />
        </span>
        <span className="font-semibold text-sm leading-tight">
          Block Planning
          <br />
          <span className="text-muted-foreground font-normal text-xs">SIH PS27</span>
        </span>
      </div>

      <span className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Menu
      </span>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              active
                ? "bg-primary/15 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}

      {user && (
        <div className="mt-auto rounded-lg border border-border bg-card p-3">
          <div className="text-xs font-medium">{user.username}</div>
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

      <div className={`rounded-lg border border-border bg-card p-3 ${user ? "" : "mt-auto"}`}>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
          System Status
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <Circle
            className={`h-2 w-2 ${online === null ? "text-muted-foreground" : online ? "text-success" : "text-danger"} fill-current`}
          />
          {online === null ? "Checking\u2026" : online ? "Operational" : "API Offline"}
        </div>
      </div>
    </aside>
  );
}
