"use client";

// SSR-safe: no Leaflet import here (the info panel renders on the server).
import type { SignallingMapStatus } from "@/lib/smmsApi";
import { GlyphKind, STATUS_META, glyphKindFor } from "./model";

// Railway signalling symbols, drawn on a 24×24 grid. Static strings only —
// no asset data is ever interpolated into the markup, so it is safe to inject.
export function glyphSvg(kind: GlyphKind, ink: string): string {
  const a = `fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  switch (kind) {
    case "signal": // colour-light signal: lamp head on a mast
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7.5" y="2.5" width="9" height="11" rx="3" ${a}/><circle cx="12" cy="8" r="2.1" fill="${ink}"/><path d="M12 13.5V21M8 21.5h8" ${a}/></svg>`;
    case "point": // turnout: one track splitting in two
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21v-8M12 13 6.5 3M12 13l5.5-10M9 21h6" ${a}/></svg>`;
    case "interlock": // two interlocked links
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.6" cy="12" r="4.6" ${a}/><circle cx="15.4" cy="12" r="4.6" ${a}/></svg>`;
    case "cable": // cable run with terminations
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14c2.5-6.5 4.5 6.5 8 0s5.5 6.5 8 0" ${a}/><circle cx="4" cy="14" r="1.5" fill="${ink}"/><circle cx="20" cy="14" r="1.5" fill="${ink}"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" fill="${ink}"/></svg>`;
  }
}

/** Status-coloured disc carrying a type glyph. Used in lists, panel and legend. */
export function AssetGlyph({
  category,
  status,
  size = 22,
}: {
  category: string;
  status: SignallingMapStatus;
  size?: number;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className="smms-glyph smms-glyph-static"
      style={{ width: size, height: size, background: meta.color }}
      dangerouslySetInnerHTML={{ __html: glyphSvg(glyphKindFor(category), meta.ink) }}
    />
  );
}
