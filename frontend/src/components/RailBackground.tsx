"use client";

/**
 * Animated railway background for the login screen only.
 * Pure CSS animations (transform + background-position) — no canvas, no
 * extra libraries, so it's cheap to render and won't affect bundle size
 * or performance anywhere else in the app. Keyframes live in globals.css.
 */

const TRACKS = [
  { top: "18%", speed: "16s", opacity: 0.35, delay: "0s" },
  { top: "38%", speed: "22s", opacity: 0.22, delay: "-6s" },
  { top: "62%", speed: "19s", opacity: 0.28, delay: "-11s" },
  { top: "82%", speed: "26s", opacity: 0.18, delay: "-3s" },
];

const TRAINS = [
  { top: "17%", duration: "9s", delay: "0s", scale: 1, flip: false },
  { top: "61%", duration: "13s", delay: "-5s", scale: 0.8, flip: true },
  { top: "81%", duration: "17s", delay: "-9s", scale: 0.65, flip: false },
];

function TrainGlyph({ flip }: { flip: boolean }) {
  // Simple, professional train silhouette (front + two coaches).
  // NOTE: colors are plain rgba() values (matching the theme's --primary
  // blue, hsl(199 89% 48%), converted to rgb(13,162,231)) rather than
  // hsl(var(--primary) / alpha). SVG presentation attributes don't reliably
  // resolve CSS custom properties + the modern slash-alpha syntax together —
  // when that fails, browsers silently fall back to solid black fill, which
  // is invisible against this dark navy background. Plain rgba() sidesteps
  // that entirely.
  const P = "13,162,231"; // primary blue, as r,g,b
  return (
    <svg
      viewBox="0 0 120 36"
      className={`h-6 w-auto md:h-8 ${flip ? "-scale-x-100" : ""}`}
      style={{ filter: `drop-shadow(0 0 6px rgba(${P},0.65))` }}
    >
      <rect x="2" y="10" width="26" height="18" rx="4" fill={`rgba(${P},0.9)`} />
      <circle cx="10" cy="30" r="3" fill={`rgb(${P})`} />
      <circle cx="22" cy="30" r="3" fill={`rgb(${P})`} />
      <rect x="7" y="14" width="16" height="7" rx="1.5" fill="#050914" />
      <rect x="32" y="14" width="34" height="14" rx="3" fill={`rgba(${P},0.55)`} />
      <circle cx="40" cy="30" r="3" fill={`rgba(${P},0.7)`} />
      <circle cx="58" cy="30" r="3" fill={`rgba(${P},0.7)`} />
      <rect x="70" y="14" width="34" height="14" rx="3" fill={`rgba(${P},0.4)`} />
      <circle cx="78" cy="30" r="3" fill={`rgba(${P},0.55)`} />
      <circle cx="96" cy="30" r="3" fill={`rgba(${P},0.55)`} />
    </svg>
  );
}

export function RailBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* base gradient wash, matches the app's dark navy theme */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(var(--primary) / 0.10), transparent 60%), hsl(var(--background))",
        }}
      />

      {/* faint moving grid for depth */}
      <div className="rail-grid absolute inset-0 opacity-[0.05]" />

      {/* rail tracks, each an independently scrolling dashed line */}
      {TRACKS.map((t, i) => (
        <div
          key={i}
          className="rail-track absolute left-0 w-full"
          style={{
            top: t.top,
            opacity: t.opacity,
            animationDuration: t.speed,
            animationDelay: t.delay,
          }}
        />
      ))}

      {/* trains crossing at different heights/speeds/sizes for parallax */}
      {TRAINS.map((tr, i) => (
        <div
          key={i}
          className="rail-train absolute"
          style={{
            top: tr.top,
            animationDuration: tr.duration,
            animationDelay: tr.delay,
          }}
        >
          <div style={{ transform: `scale(${tr.scale})`, transformOrigin: "left center" }}>
            <TrainGlyph flip={tr.flip} />
          </div>
        </div>
      ))}

      {/* very light vignette at the far edges only — the card's own
          backdrop-blur already handles readability right behind it,
          so this should not wash out the animation across the rest
          of the screen. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 65%, hsl(var(--background) / 0.35) 100%)",
        }}
      />
    </div>
  );
}
