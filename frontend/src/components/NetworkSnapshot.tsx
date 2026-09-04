"use client";

import { NetworkSchematic } from "@/components/NetworkSchematic";

export function NetworkSnapshot({ today }: { today?: string }) {
  return <NetworkSchematic today={today} mapHref="/map" />;
}