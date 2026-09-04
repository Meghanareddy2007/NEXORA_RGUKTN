"use client";

import { Bell, UserCircle2 } from "lucide-react";

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-card/40 px-6 py-3">
      <div>
        <h1 className="text-base font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        <button className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] font-semibold text-white">
            3
          </span>
        </button>
        <div className="flex items-center gap-2 border-l border-border pl-4">
          <UserCircle2 className="h-7 w-7 text-muted-foreground" />
          <div className="leading-tight">
            <div className="text-sm font-medium">Control Room</div>
            <div className="text-[11px] text-muted-foreground">WR Zone</div>
          </div>
        </div>
      </div>
    </header>
  );
}
