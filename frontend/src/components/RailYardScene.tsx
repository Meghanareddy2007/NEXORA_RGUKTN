"use client";

import { useEffect, useState } from "react";

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
  const [tags, setTags] = useState<
    {
      id: number;
      text: string;
      top: number;
      left: number;
      dx: number;
      dur: number;
    }[]
  >([]);

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reduced) return;

    let counter = 0;

    function spawn() {
      const id = counter++;

      const tag = {
        id,
        text: STATUS_TAGS[
          Math.floor(Math.random() * STATUS_TAGS.length)
        ],
        top: 10 + Math.random() * 46,
        left: 4 + Math.random() * 34,
        dx: Math.random() * 24 - 6,
        dur: 3.8 + Math.random() * 2.2,
      };

      setTags((prev) => [...prev, tag]);

      setTimeout(() => {
        setTags((prev) =>
          prev.filter((t) => t.id !== id)
        );
      }, tag.dur * 1000 + 100);
    }

    spawn();

    const interval = setInterval(spawn, 2600);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      aria-hidden
      className="ry-scene pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Background effects */}
      <div className="ry-breathe absolute inset-0" />
      <div className="ry-grid absolute inset-0" />
      <div className="ry-scanline absolute inset-x-0 h-40" />

      {/* Stars */}
      {STARS.map((star, index) => (
        <span
          key={index}
          className="ry-star absolute h-[2px] w-[2px] rounded-full bg-white/70"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}

      {/* Static rail-yard diagram */}
      <svg
        viewBox="0 0 900 700"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        {/* Main tracks */}
        <path
          className="ry-track"
          d="M 90 222 L 310 248 L 650 248 L 800 222 L 860 200"
        />

        <path
          className="ry-track"
          d="M 90 248 L 310 222 L 650 222 L 800 248 L 860 268"
        />

        <path
          className="ry-pulse"
          d="M 90 222 L 310 248 L 650 248 L 800 222 L 860 200"
        />

        <path
          className="ry-pulse ry-pulse-delay"
          d="M 90 248 L 310 222 L 650 222 L 800 248 L 860 268"
        />

        <path
          className="ry-track"
          d="M 90 300 L 860 300"
        />

        <path
          className="ry-track-dash"
          d="M 330 248 C 420 288, 560 288, 650 248"
        />

        <path
          className="ry-track"
          d="M 300 248 C 255 292, 232 332, 230 375"
        />

        <path
          className="ry-track"
          d="M 660 248 C 700 292, 716 332, 716 372"
        />

        {/* Section labels */}
        <text className="ry-label" x="90" y="196">
          SECTION A · UP LINE
        </text>

        <text
          className="ry-label"
          x="770"
          y="185"
          textAnchor="end"
        >
          SECTION B
        </text>

        <text
          className="ry-label"
          x="490"
          y="315"
          textAnchor="middle"
        >
          SIDING · CP 42
        </text>

        {/* Track sensors */}
        <g transform="translate(430,204)">
          <line
            x1="0"
            y1="17"
            x2="0"
            y2="27"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth="1.2"
          />

          <rect
            className="ry-sensor"
            x="-7"
            y="-7"
            width="14"
            height="14"
            rx="3"
          />

          <circle
            className="ry-sensor-dot"
            cx="0"
            cy="0"
            r="2.4"
          />
        </g>

        <g transform="translate(600,204)">
          <line
            x1="0"
            y1="17"
            x2="0"
            y2="27"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth="1.2"
          />

          <rect
            className="ry-sensor"
            x="-7"
            y="-7"
            width="14"
            height="14"
            rx="3"
          />

          <circle
            className="ry-sensor-dot ry-sensor-dot-b"
            cx="0"
            cy="0"
            r="2.4"
          />
        </g>

        <circle
          className="ry-node"
          cx="800"
          cy="235"
          r="3.2"
        />

        {/* Static track consist */}
        <g
          className="ry-consist"
          transform="translate(360,215)"
        >
          <rect
            x="0"
            y="0"
            width="20"
            height="14"
            rx="2"
            fill="hsl(var(--warning))"
          />

          <rect
            x="22"
            y="0"
            width="20"
            height="14"
            rx="2"
            fill="hsl(var(--warning))"
          />

          <rect
            x="44"
            y="0"
            width="20"
            height="14"
            rx="2"
            fill="hsl(var(--info))"
          />

          <rect
            x="66"
            y="0"
            width="20"
            height="14"
            rx="2"
            fill="hsl(var(--info))"
          />

          <rect
            x="88"
            y="0"
            width="20"
            height="14"
            rx="2"
            fill="hsl(var(--success))"
          />

          <rect
            x="110"
            y="0"
            width="20"
            height="14"
            rx="2"
            fill="hsl(var(--success))"
          />

          <path
            d="M 132 0 L 148 0 Q 156 0 156 7 Q 156 14 148 14 L 132 14 Z"
            fill="none"
            stroke="hsl(var(--success))"
            strokeWidth="1.4"
          />
        </g>

        {/* Green track block */}
        <rect
          x="690"
          y="293"
          width="34"
          height="14"
          rx="2"
          fill="hsl(var(--success))"
        />

        {/* Track markers */}
        <g
          fill="hsl(var(--muted-foreground))"
          opacity="0.55"
        >
          {[
            [745, 294],
            [758, 294],
            [771, 294],
            [784, 294],
            [797, 294],
            [810, 294],
            [823, 294],
          ].map(([x, y], index) => (
            <rect
              key={index}
              x={x}
              y={y}
              width="9"
              height="12"
              rx="1.5"
            />
          ))}
        </g>

        <g
          fill="hsl(var(--muted-foreground))"
          opacity="0.45"
        >
          <rect
            x="778"
            y="208"
            width="8"
            height="10"
            rx="1.5"
          />

          <rect
            x="790"
            y="208"
            width="8"
            height="10"
            rx="1.5"
          />

          <rect
            x="800"
            y="236"
            width="8"
            height="10"
            rx="1.5"
          />

          <rect
            x="812"
            y="236"
            width="8"
            height="10"
            rx="1.5"
          />
        </g>

        {/* Loco pool */}
        <g transform="translate(170,388)">
          <path
            className="ry-depot"
            d="M 0 12 L 0 0 Q 0 -6 6 -6 L 24 -6 Q 30 -6 30 0 L 30 12"
          />

          <path
            className="ry-depot"
            d="M 40 12 L 40 0 Q 40 -6 46 -6 L 64 -6 Q 70 -6 70 0 L 70 12"
          />

          <line
            x1="-6"
            y1="12"
            x2="76"
            y2="12"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth="1.2"
            opacity="0.5"
          />
        </g>

        <text
          className="ry-label"
          x="205"
          y="428"
          textAnchor="middle"
        >
          LOCO POOL
        </text>

        {/* Maintenance depot */}
        <g transform="translate(660,372)">
          <rect
            x="0"
            y="0"
            width="150"
            height="46"
            rx="3"
            fill="none"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth="1.2"
          />

          <path
            className="ry-depot"
            d="M 14 22 L 14 8 L 25 -2 L 36 8 L 36 22 Z"
          />

          <line
            x1="48"
            y1="10"
            x2="140"
            y2="10"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth="1"
            opacity="0.4"
          />

          <g
            fill="hsl(var(--success))"
            opacity="0.6"
          >
            <rect
              x="132"
              y="16"
              width="4"
              height="9"
            />

            <rect
              x="132"
              y="29"
              width="4"
              height="9"
            />
          </g>
        </g>

        <text
          className="ry-label"
          x="735"
          y="435"
          textAnchor="middle"
        >
          MAINTENANCE DEPOT
        </text>
      </svg>

      {/* Floating status tags */}
      {tags.map((tag) => (
        <div
          key={tag.id}
          className="ry-tag absolute rounded border px-[9px] py-1 font-mono text-[11.5px]"
          style={
            {
              top: `${tag.top}%`,
              left: `${tag.left}%`,
              animationDuration: `${tag.dur}s`,
              "--ry-dx": `${tag.dx}px`,
            } as React.CSSProperties
          }
        >
          {tag.text}
        </div>
      ))}
    </div>
  );
}