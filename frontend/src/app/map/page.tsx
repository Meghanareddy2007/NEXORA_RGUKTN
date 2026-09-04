"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` at import time, so the map must be client-only, no SSR.
const NetworkMap = dynamic(() => import("@/components/NetworkMap"), { ssr: false });

export default function MapPage() {
  return (
    <div className="flex flex-col gap-4 h-full p-6">
      <header>
        <h1 className="text-xl font-semibold">Rail Network Map</h1>
        <p className="text-sm text-muted-foreground">Corridor status & failure-risk overlay. Click a marker for corridor detail.</p>
      </header>
      <div className="rounded-lg border border-border bg-card p-2 h-[600px]">
        <NetworkMap />
      </div>
    </div>
  );
}
