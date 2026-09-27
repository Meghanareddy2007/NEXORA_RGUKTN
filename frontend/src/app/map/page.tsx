"use client";

import { RailOpsDashboard } from "@/components/railops/RailOpsDashboard";
import BackToCOA from "@/components/BackToCOA";

export default function MapPage() {
  return (
    <div className="min-h-screen">
      <div className="flex items-center justify-end border-b border-border px-4 py-2">
        <BackToCOA />
      </div>
      <RailOpsDashboard />
    </div>
  );
}

