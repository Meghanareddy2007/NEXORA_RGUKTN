"use client";

/* ==================================================================
   TmsDashboard
   ------------------------------------------------------------------
   Wraps the original tms-dashboard.html console so it can live as
   the /tms route in this app, shown after a TMS-department login.

   Why it's built this way (not rewritten as idiomatic React):
   The original file is a ~4,000-line, self-contained vanilla-JS
   command console (sidebar/topbar/viewport rendered via innerHTML,
   a three.js network map, a multi-step wizard, live simulation
   timers, etc.) that wires almost everything together with inline
   onclick="..." strings. Those inline handlers only resolve against
   the real global (window) scope, so the JS ships as a plain
   <script src> (public/tms-dashboard/runtime.js) that the browser
   executes exactly as it did in the static HTML file, rather than
   being ported into React state.

   Why the script is injected by hand instead of via next/script:
   next/script dedupes a given src and only ever runs it ONCE for
   the whole page. React's dev-mode Strict Mode mounts this
   component, throws that first DOM away, then mounts it again —
   so a deduped script fills the *first, discarded* #sidebar /
   #topbar / #viewport and never re-fills the real ones. Creating
   the <script> tag ourselves in useEffect re-runs it on every
   actual mount, against whatever shell divs exist at that moment.

   Supabase has been removed. Maintenance reports and breakdown
   escalations now queue in localStorage on the visitor's device
   (see public/tms-dashboard/runtime.js, the DB module) instead of
   being written to a Supabase table.

   Auth: this reads the same session @/lib/auth already keeps in
   localStorage (nexora_auth) via useAuth(), so the "reported by"
   name on new maintenance rows matches whoever is actually logged
   in, and "Sign out" uses the app's own logout() — same as Sidebar.
   ================================================================== */

import { useEffect } from "react";
import { useAuth, logout } from "@/lib/auth";

export interface TmsDashboardProps {
  /** Override the "reported by" name. Defaults to the logged-in user. */
  reporterName?: string;
  /** Division code stamped on every write. */
  division?: string;
}

export default function TmsDashboard({
  reporterName,
  division,
}: TmsDashboardProps) {
  const { user } = useAuth();
  const effectiveReporter = reporterName ?? user?.full_name ?? user?.username;

  useEffect(() => {
    let cancelled = false;
    const injected: HTMLScriptElement[] = [];

    // runtime.js reads these once, synchronously, at the top of the file.
    if (effectiveReporter) (window as any).__TMS_REPORTER__ = effectiveReporter;
    if (division) (window as any).__TMS_DIVISION__ = division;

    function addScript(src: string, onload?: () => void) {
      const s = document.createElement("script");
      s.src = src;
      s.async = false; // preserve execution order
      if (onload) s.onload = onload;
      document.body.appendChild(s);
      injected.push(s);
    }

    // three.js first (used lazily by the network map), then the app itself.
    addScript(
      "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
      () => {
        if (cancelled) return;
        addScript("/tms-dashboard/runtime.js");
      }
    );

    return () => {
      cancelled = true;
      injected.forEach((s) => s.remove());
    };
  }, [effectiveReporter, division]);

  function handleSignOut() {
    logout();
    window.location.href = "/login";
  }

  return (
    <>
      {/* Fonts the original dashboard was designed with */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <link rel="stylesheet" href="/tms-dashboard/style.css" />


      <div id="shell">
        <aside id="sidebar" />
        <div id="main">
          <div id="topbar" />
          <div id="viewport" />
        </div>
      </div>
      <div id="overlays" />
      <div className="toast-stack" id="toastStack" />
    </>
  );
}
