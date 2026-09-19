"use client";

/**
 * Animated rail-yard showcase for the login screen's left panel.
 *
 * Ported from a static HTML/CSS mockup into a self-contained, project-styled
 * React component: an SVG yard diagram (ladder tracks, signal pulses, a
 * stabled consist, loco pool, maintenance depot) plus a cute CSS/3D train
 * that journeys across the panel, and small live-looking status tags that
 * spawn and drift. Colors are pulled from the app's existing design tokens
 * (hsl(var(--...))) instead of hardcoded hex so it stays consistent with the
 * rest of the theme. All motion is scoped to this component and respects
 * prefers-reduced-motion via the .ry- rules in globals.css.
 */

import { useEffect, useState } from "react";

// Deterministic star positions (index-based, not Math.random) so
// server/client markup match exactly on first paint.
const STARS = Array.from({ length: 34 }, (_, i) => ({
  left: (i * 61.3) % 100,
  top: (i * 23.7) % 68,
  delay: (i % 10) * 0.34,
}));

const STATUS_TAGS = [
  "SEC-14 · CLEAR",
  "BLK-092 · SCHEDULED",
  "SEC-07 · MAINT",
  "BLK-118 · OPTIMAL",
  "SEC-22 · CLEAR",
  "BLK-041 · CONFLICT-RESOLVED",
];

export function RailYardScene() {
  const [tags, setTags] = useState<{ id: number; text: string; top: number; left: number; dx: number; dur: number }[]>(
    []
  );

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let counter = 0;
    function spawn() {
      const id = counter++;
      const tag = {
        id,
        text: STATUS_TAGS[Math.floor(Math.random() * STATUS_TAGS.length)],
        top: 10 + Math.random() * 46,
        left: 4 + Math.random() * 34,
        dx: Math.random() * 24 - 6,
        dur: 3.8 + Math.random() * 2.2,
      };
      setTags((prev) => [...prev, tag]);
      setTimeout(() => {
        setTags((prev) => prev.filter((t) => t.id !== id));
      }, tag.dur * 1000 + 100);
    }

    spawn();
    const interval = setInterval(spawn, 2600);
    return () => clearInterval(interval);
  }, []);

  return (
    <div aria-hidden className="ry-scene pointer-events-none absolute inset-0 overflow-hidden">
      {/* base gradient + drifting grid + scanline */}
      <div className="ry-breathe absolute inset-0" />
      <div className="ry-grid absolute inset-0" />
      <div className="ry-scanline absolute inset-x-0 h-40" />

      {/* stars */}
      {STARS.map((s, i) => (
        <span
          key={i}
          className="ry-star absolute h-[2px] w-[2px] rounded-full bg-white/70"
          style={{ left: `${s.left}%`, top: `${s.top}%`, animationDelay: `${s.delay}s` }}
        />
      ))}

      {/* the cute 3D train, journeys left -> right on a loop */}
      <div className="ry-train-wrap absolute" style={{ left: "-360px", bottom: "19%", width: 360, height: 150 }}>
        <div className="ry-train relative h-full w-full">
          <div className="ry-train-shadow absolute" style={{ left: 20, bottom: 8, width: 330, height: 16 }} />
          <div className="ry-smoke absolute" style={{ left: 288, top: -34 }} />
          <div className="ry-smoke ry-smoke-2 absolute" style={{ left: 302, top: -34 }} />
          <div className="ry-smoke ry-smoke-3 absolute" style={{ left: 316, top: -34 }} />

          {/* trailing car */}
          <div
            className="absolute rounded-[8px_13px_10px_8px] border-2 border-white/40"
            style={{
              left: 235,
              bottom: 30,
              width: 116,
              height: 67,
              background: "linear-gradient(180deg, hsl(var(--muted-foreground)/0.35), hsl(var(--muted-foreground)/0.15))",
            }}
          >
            <span className="ry-car-window absolute" style={{ top: 12, left: 10, width: 27, height: 22 }} />
            <span className="ry-car-window absolute" style={{ top: 12, left: 45, width: 27, height: 22 }} />
            <span className="ry-car-window absolute" style={{ top: 12, left: 80, width: 27, height: 22 }} />
          </div>

          {/* main body */}
          <div
            className="absolute rounded-[22px_18px_10px_10px] border-2 border-white/60"
            style={{
              left: 28,
              bottom: 25,
              width: 270,
              height: 82,
              background: "linear-gradient(180deg, hsl(var(--foreground)/0.95), hsl(var(--primary)/0.35) 55%, hsl(var(--primary)/0.55) 100%)",
              boxShadow: "0 10px 0 rgba(8,28,46,0.35)",
            }}
          >
            {/* nose with face */}
            <div
              className="absolute -skew-x-6 rounded-[52px_25px_17px_20px] border-2 border-white/70"
              style={{
                left: 0,
                top: -20,
                width: 112,
                height: 102,
                background: "linear-gradient(145deg, hsl(var(--foreground)) 5%, hsl(var(--primary)/0.5) 55%, hsl(var(--primary)/0.8) 100%)",
              }}
            >
              <div
                className="absolute overflow-hidden rounded-[22px_22px_13px_13px] border-2"
                style={{
                  left: 20,
                  top: 13,
                  width: 76,
                  height: 43,
                  background: "linear-gradient(180deg, hsl(var(--sidebar)), hsl(222 47% 4%))",
                  borderColor: "hsl(var(--info))",
                  boxShadow: "0 0 16px hsl(var(--info)/0.4)",
                }}
              >
                <span className="ry-eye absolute" style={{ left: 21, top: 15 }} />
                <span className="ry-eye absolute" style={{ right: 21, top: 15 }} />
                <span className="ry-smile absolute" style={{ left: 31, top: 25 }} />
              </div>
              <span className="ry-light absolute" style={{ left: 8, bottom: 8 }} />
              <span className="ry-light ry-light-2 absolute" style={{ left: 84, bottom: 8 }} />
            </div>

            <div className="absolute flex gap-[9px]" style={{ left: 118, top: 14 }}>
              <span className="ry-car-window absolute" style={{ position: "relative", width: 35, height: 27 }} />
              <span className="ry-car-window" style={{ width: 35, height: 27 }} />
              <span className="ry-car-window" style={{ width: 35, height: 27 }} />
              <span className="ry-car-window" style={{ width: 35, height: 27 }} />
            </div>

            <div className="ry-stripe absolute" style={{ left: 104, right: 0, top: 52, height: 8 }} />
            <div
              className="absolute font-semibold tracking-[2px]"
              style={{ right: 20, bottom: 13, fontSize: 11, color: "hsl(var(--sidebar))" }}
            >
              NEXORA
            </div>
          </div>

          <span className="ry-wheel absolute" style={{ left: 68, bottom: 8 }} />
          <span className="ry-wheel absolute" style={{ left: 145, bottom: 8 }} />
          <span className="ry-wheel absolute" style={{ left: 247, bottom: 8 }} />
          <span className="ry-wheel absolute" style={{ left: 315, bottom: 8 }} />
        </div>
      </div>

      <svg viewBox="0 0 900 700" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <path className="ry-track" d="M 90 222 L 310 248 L 650 248 L 800 222 L 860 200" />
        <path className="ry-track" d="M 90 248 L 310 222 L 650 222 L 800 248 L 860 268" />
        <path className="ry-pulse" d="M 90 222 L 310 248 L 650 248 L 800 222 L 860 200" />
        <path className="ry-pulse ry-pulse-delay" d="M 90 248 L 310 222 L 650 222 L 800 248 L 860 268" />

        <path className="ry-track" d="M 90 300 L 860 300" />
        <path className="ry-track-dash" d="M 330 248 C 420 288, 560 288, 650 248" />
        <path className="ry-track" d="M 300 248 C 255 292, 232 332, 230 375" />
        <path className="ry-track" d="M 660 248 C 700 292, 716 332, 716 372" />

        <text className="ry-label" x="90" y="196">
          SECTION A · UP LINE
        </text>
        <text className="ry-label" x="770" y="185" textAnchor="end">
          SECTION B
        </text>
        <text className="ry-label" x="490" y="315" textAnchor="middle">
          SIDING · CP 42
        </text>

        <g transform="translate(430,204)">
          <line x1="0" y1="17" x2="0" y2="27" stroke="hsl(var(--muted-foreground))" strokeWidth="1.2" />
          <rect className="ry-sensor" x="-7" y="-7" width="14" height="14" rx="3" />
          <circle className="ry-sensor-dot" cx="0" cy="0" r="2.4" />
        </g>
        <g transform="translate(600,204)">
          <line x1="0" y1="17" x2="0" y2="27" stroke="hsl(var(--muted-foreground))" strokeWidth="1.2" />
          <rect className="ry-sensor" x="-7" y="-7" width="14" height="14" rx="3" />
          <circle className="ry-sensor-dot ry-sensor-dot-b" cx="0" cy="0" r="2.4" />
        </g>

        <circle className="ry-node" cx="800" cy="235" r="3.2" />

        <g className="ry-consist" transform="translate(360,215)">
          <rect x="0" y="0" width="20" height="14" rx="2" fill="hsl(var(--warning))" />
          <rect x="22" y="0" width="20" height="14" rx="2" fill="hsl(var(--warning))" />
          <rect x="44" y="0" width="20" height="14" rx="2" fill="hsl(var(--info))" />
          <rect x="66" y="0" width="20" height="14" rx="2" fill="hsl(var(--info))" />
          <rect x="88" y="0" width="20" height="14" rx="2" fill="hsl(var(--success))" />
          <rect x="110" y="0" width="20" height="14" rx="2" fill="hsl(var(--success))" />
          <path
            d="M 132 0 L 148 0 Q 156 0 156 7 Q 156 14 148 14 L 132 14 Z"
            fill="none"
            stroke="hsl(var(--success))"
            strokeWidth="1.4"
          />
        </g>

        <rect x="690" y="293" width="34" height="14" rx="2" fill="hsl(var(--success))" />

        <g fill="hsl(var(--muted-foreground))" opacity="0.55">
          <rect x="745" y="294" width="9" height="12" rx="1.5" />
          <rect x="758" y="294" width="9" height="12" rx="1.5" />
          <rect x="771" y="294" width="9" height="12" rx="1.5" />
          <rect x="784" y="294" width="9" height="12" rx="1.5" />
          <rect x="797" y="294" width="9" height="12" rx="1.5" />
          <rect x="810" y="294" width="9" height="12" rx="1.5" />
          <rect x="823" y="294" width="9" height="12" rx="1.5" />
        </g>
        <g fill="hsl(var(--muted-foreground))" opacity="0.45">
          <rect x="778" y="208" width="8" height="10" rx="1.5" />
          <rect x="790" y="208" width="8" height="10" rx="1.5" />
          <rect x="800" y="236" width="8" height="10" rx="1.5" />
          <rect x="812" y="236" width="8" height="10" rx="1.5" />
        </g>

        <g transform="translate(170,388)">
          <path className="ry-depot" d="M 0 12 L 0 0 Q 0 -6 6 -6 L 24 -6 Q 30 -6 30 0 L 30 12" />
          <path className="ry-depot" d="M 40 12 L 40 0 Q 40 -6 46 -6 L 64 -6 Q 70 -6 70 0 L 70 12" />
          <line x1="-6" y1="12" x2="76" y2="12" stroke="hsl(var(--muted-foreground))" strokeWidth="1.2" opacity="0.5" />
        </g>
        <text className="ry-label" x="205" y="428" textAnchor="middle">
          LOCO POOL
        </text>

        <g transform="translate(660,372)">
          <rect x="0" y="0" width="150" height="46" rx="3" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.2" />
          <path className="ry-depot" d="M 14 22 L 14 8 L 25 -2 L 36 8 L 36 22 Z" />
          <line x1="48" y1="10" x2="140" y2="10" stroke="hsl(var(--muted-foreground))" strokeWidth="1" opacity="0.4" />
          <g fill="hsl(var(--success))" opacity="0.6">
            <rect x="132" y="16" width="4" height="9" />
            <rect x="132" y="29" width="4" height="9" />
          </g>
        </g>
        <text className="ry-label" x="735" y="435" textAnchor="middle">
          MAINTENANCE DEPOT
        </text>
      </svg>

      {/* floating live block-status tags */}
      {tags.map((t) => (
        <div
          key={t.id}
          className="ry-tag absolute rounded border px-[9px] py-1 font-mono text-[11.5px]"
          style={
            {
              top: `${t.top}%`,
              left: `${t.left}%`,
              animationDuration: `${t.dur}s`,
              "--ry-dx": `${t.dx}px`,
            } as React.CSSProperties
          }
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
