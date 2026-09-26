"use client";

import L from "leaflet";
import type { SignallingMapAsset } from "@/lib/smmsApi";
import { glyphSvg } from "./glyphs";
import { STATUS_META, glyphKindFor } from "./model";

export interface IconOpts {
  size: number;
  selected: boolean;
  /** Screen-pixel shift of the glyph centre from the map coordinate. */
  dx: number;
  dy: number;
  sectionLevel: boolean;
}

const iconCache = new Map<string, L.DivIcon>();

/** Marker icon for one asset. `dx/dy` shift the glyph away from its anchor
 * point in screen pixels, so trackside equipment sits beside the line while
 * the true position stays on it. */
export function assetIcon(a: SignallingMapAsset, o: IconOpts): L.DivIcon {
  const key = [a.status, glyphKindFor(a.category), o.size, o.selected, o.dx, o.dy, o.sectionLevel, a.is_critical_asset, a.is_failure, a.failure_severity].join("|");
  const hit = iconCache.get(key);
  if (hit) return hit;

  const meta = STATUS_META[a.status];
  const ring = a.is_failure && a.status !== "failure"; // failure open but repair in progress (or otherwise not red)
  const pulse = a.is_failure && a.failure_severity === "Critical";
  const cls = [
    "smms-glyph",
    o.selected ? "is-selected" : "",
    o.sectionLevel ? "is-section-level" : "",
    ring ? "has-failure-ring" : "",
    pulse ? "is-pulsing" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const html =
    `<div class="${cls}" style="width:${o.size}px;height:${o.size}px;background:${meta.color}">` +
    glyphSvg(glyphKindFor(a.category), meta.ink) +
    (a.is_critical_asset ? `<i class="smms-crit-mark"></i>` : "") +
    `</div>`;

  const half = o.size / 2;
  const icon = L.divIcon({
    className: "smms-icon",
    html,
    iconSize: [o.size, o.size],
    iconAnchor: [half - o.dx, half - o.dy],
    tooltipAnchor: [o.dx, o.dy - half - 2],
  });
  if (iconCache.size > 800) iconCache.clear();
  iconCache.set(key, icon);
  return icon;
}
