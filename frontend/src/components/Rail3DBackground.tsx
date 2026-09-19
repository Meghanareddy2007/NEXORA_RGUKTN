"use client";

/**
 * Real CSS-3D railway scene for the login screen's showcase panel.
 *
 * Unlike RailBackground (flat 2D silhouettes crossing the screen), this
 * builds an actual perspective scene: a ground plane is rotated in 3D
 * space via `perspective` + `rotateX`, so two straight rails painted on
 * it converge to a vanishing point exactly the way real train tracks do.
 * A locomotive is built out of six positioned faces (the classic CSS
 * "cube" technique) inside the same perspective context, then animated
 * from the vanishing point toward the camera on a loop.
 *
 * Pure CSS transforms + one small <style> tag for the numeric keyframes —
 * no canvas, no three.js, no new dependencies. Cheap to render and fully
 * scoped to this component, so it can't affect anything else in the app.
 */

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// ---- Track geometry (percentages, relative to the perspective wrapper) ----
const HORIZON_TOP = 42; // where the ground plane's far edge sits (vanishing line)
const NEAR_TOP = 97; // where the ground plane's near edge sits

// ---- Lamp posts: flat 2D elements, perspective faked the same way the
// existing RailBackground component fakes train scale/position — cheap
// and proven to render consistently. ----
const LAMP_STOPS = [0.14, 0.32, 0.52, 0.72, 0.9];
type Lamp = { top: number; left: number; scale: number; opacity: number; side: "L" | "R" };
const LAMPS: Lamp[] = LAMP_STOPS.flatMap((t) => {
  const top = lerp(NEAR_TOP - 4, HORIZON_TOP + 2, t);
  const spread = lerp(44, 1.5, t);
  const scale = lerp(1, 0.12, t);
  const opacity = lerp(0.85, 0.2, t);
  return [
    { top, left: 50 - spread, scale, opacity, side: "L" as const },
    { top, left: 50 + spread, scale, opacity, side: "R" as const },
  ];
});

// ---- Stars: deterministic (index-based) positions so server- and
// client-rendered markup match exactly — no Math.random(). ----
const STARS = Array.from({ length: 36 }, (_, i) => {
  const x = (i * 53.7) % 100;
  const y = (i * 29.3) % 55; // keep stars in the upper sky, above the horizon
  const size = 1 + (i % 3);
  const delay = (i % 10) * 0.35;
  const dur = 2.4 + (i % 5) * 0.5;
  return { x, y, size, delay, dur };
});

// ---- The approaching train: precompute keyframe stops with an eased
// (non-linear) time->distance mapping, baked into fixed keyframe
// percentages. That gives a realistic "slow while far, rushes past when
// close" motion using nothing but animation-timing-function: linear on
// stops that already encode the easing. ----
const TRAIN_STEPS = 10;
const trainFrames = Array.from({ length: TRAIN_STEPS + 1 }, (_, i) => {
  const timePct = (i / TRAIN_STEPS) * 100;
  const tPos = Math.pow(i / TRAIN_STEPS, 1.7); // ease-in: bunches early steps near the horizon
  const top = lerp(HORIZON_TOP, NEAR_TOP, tPos);
  const scale = lerp(0.07, 1.55, tPos);
  let opacity = 1;
  if (timePct < 8) opacity = timePct / 8;
  if (timePct > 88) opacity = Math.max(0, (100 - timePct) / 12);
  return { timePct, top, scale, opacity };
});

const TRAIN_KEYFRAMES = `
@keyframes rail3d-approach {
${trainFrames
  .map(
    (f) =>
      `  ${f.timePct.toFixed(2)}% { top: ${f.top.toFixed(2)}%; opacity: ${f.opacity.toFixed(
        2
      )}; transform: translate(-50%, -100%) scale(${f.scale.toFixed(3)}); }`
  )
  .join("\n")}
}`;

// ---- Locomotive cube dimensions (base pixels, before the scale animation
// above blows it up/down). Depth (front-to-back length) is deliberately
// larger than width so the side face reads clearly once rotated. ----
const W = 92; // cab width
const H = 58; // cab height
const D = 168; // body length
const LR_OFFSET = (W - D) / 2; // classic cube-face centering offset
const TOP_OFFSET = (H - D) / 2;

function Cuboid({ z, dim = "loco" }: { z: number; dim?: "loco" | "coach" }) {
  const dark = dim === "coach";
  return (
    <div
      className="absolute left-1/2 top-1/2"
      style={{
        width: W,
        height: H,
        transformStyle: "preserve-3d",
        transform: `translate(-50%, -50%) translateZ(${z}px)`,
      }}
    >
      {/* front (nose) */}
      <div
        className="absolute inset-0 rounded-[3px]"
        style={{
          transform: `translateZ(${D / 2}px)`,
          background: dark
            ? "hsl(var(--muted-foreground) / 0.55)"
            : "linear-gradient(180deg, hsl(var(--primary) / 0.95), hsl(var(--primary) / 0.65))",
          boxShadow: dark ? "none" : "0 0 22px hsl(var(--primary) / 0.55)",
        }}
      >
        {!dark && (
          <span
            className="absolute left-1/2 top-[62%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: "hsl(var(--warning))",
              boxShadow: "0 0 14px 4px hsl(var(--warning) / 0.9)",
            }}
          />
        )}
        <span
          className="absolute left-1/2 top-[22%] h-[30%] w-[70%] -translate-x-1/2 rounded-sm"
          style={{ background: "#050914" }}
        />
      </div>

      {/* back */}
      <div
        className="absolute inset-0 rounded-[3px]"
        style={{
          transform: `rotateY(180deg) translateZ(${D / 2}px)`,
          background: "hsl(222 40% 8%)",
        }}
      />

      {/* left side */}
      <div
        className="absolute top-0"
        style={{
          left: LR_OFFSET,
          width: D,
          height: H,
          transform: `rotateY(-90deg) translateZ(${W / 2}px)`,
          background: dark
            ? "hsl(var(--muted-foreground) / 0.35)"
            : "linear-gradient(90deg, hsl(var(--primary) / 0.5), hsl(var(--primary) / 0.2))",
        }}
      />

      {/* right side */}
      <div
        className="absolute top-0"
        style={{
          left: LR_OFFSET,
          width: D,
          height: H,
          transform: `rotateY(90deg) translateZ(${W / 2}px)`,
          background: dark
            ? "hsl(var(--muted-foreground) / 0.3)"
            : "linear-gradient(90deg, hsl(var(--primary) / 0.45), hsl(var(--primary) / 0.15))",
        }}
      />

      {/* top */}
      <div
        className="absolute left-0"
        style={{
          top: TOP_OFFSET,
          width: W,
          height: D,
          transform: `rotateX(90deg) translateZ(${H / 2}px)`,
          background: dark ? "hsl(var(--muted-foreground) / 0.4)" : "hsl(var(--primary) / 0.75)",
        }}
      />
    </div>
  );
}

export function Rail3DBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* embedded, component-scoped keyframes for the approach animation —
          values are numeric and precomputed above, so they live here
          rather than cluttering globals.css with generated numbers */}
      <style>{TRAIN_KEYFRAMES}</style>

      {/* night sky base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, hsl(222 47% 4%) 0%, hsl(222 47% 6%) 42%, hsl(222 45% 9%) 100%)",
        }}
      />

      {/* stars */}
      {STARS.map((s, i) => (
        <span
          key={i}
          className="rail3d-star absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.dur}s`,
          }}
        />
      ))}

      {/* horizon glow, marks the vanishing point */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          top: `${HORIZON_TOP - 6}%`,
          width: "70%",
          height: "26%",
          background: "radial-gradient(ellipse 50% 50% at 50% 50%, hsl(var(--primary) / 0.35), transparent 70%)",
          filter: "blur(2px)",
        }}
      />

      {/* ---------- the 3D scene: everything below shares one perspective ---------- */}
      <div className="absolute inset-0" style={{ perspective: "1000px" }}>
        {/* ground plane, rotated back in 3D space so the rails painted on
            it genuinely converge — this is real perspective, not a fake */}
        <div
          className="absolute left-1/2"
          style={{
            bottom: 0,
            width: "180%",
            height: "62%",
            transform: "translateX(-50%) rotateX(80deg)",
            transformOrigin: "bottom center",
            background: "hsl(222 35% 7%)",
          }}
        >
          {/* sleepers, scrolling toward the viewer */}
          <div
            className="rail3d-sleepers absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, hsl(30 25% 22% / 0.9) 0px, hsl(30 25% 22% / 0.9) 10px, transparent 10px, transparent 46px)",
            }}
          />
          {/* rails */}
          <div
            className="absolute top-0 h-full"
            style={{
              left: "43%",
              width: "1.6%",
              background: "linear-gradient(180deg, hsl(var(--primary)), hsl(var(--primary) / 0.4))",
              boxShadow: "0 0 10px hsl(var(--primary) / 0.7)",
            }}
          />
          <div
            className="absolute top-0 h-full"
            style={{
              left: "55.4%",
              width: "1.6%",
              background: "linear-gradient(180deg, hsl(var(--primary)), hsl(var(--primary) / 0.4))",
              boxShadow: "0 0 10px hsl(var(--primary) / 0.7)",
            }}
          />
        </div>

        {/* lamp posts, receding toward the vanishing point */}
        {LAMPS.map((l, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              top: `${l.top}%`,
              left: `${l.left}%`,
              opacity: l.opacity,
              transform: `translate(-50%, -100%) scale(${l.scale})`,
            }}
          >
            <div className="mx-auto h-10 w-[3px]" style={{ background: "hsl(var(--muted-foreground) / 0.5)" }} />
            <span
              className="rail3d-lamp-glow absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full"
              style={{ background: "hsl(var(--warning))", boxShadow: "0 0 12px 4px hsl(var(--warning) / 0.8)" }}
            />
          </div>
        ))}

        {/* the train: outer wrapper drives the toward-camera animation,
            inner group holds the fixed viewing tilt + a slow sway so both
            the front and the side/top faces stay visible (proof it's 3D) */}
        <div className="rail3d-train-wrap absolute left-1/2" style={{ top: `${HORIZON_TOP}%` }}>
          <div
            className="rail3d-loco-sway relative"
            style={{ transformStyle: "preserve-3d", transform: "rotateX(16deg) rotateY(24deg)" }}
          >
            <Cuboid z={0} dim="loco" />
            <Cuboid z={-(D + 18)} dim="coach" />
            <Cuboid z={-(2 * D + 40)} dim="coach" />
          </div>
        </div>
      </div>

      {/* readability fades */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, hsl(var(--background)) 0%, transparent 26%)" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, hsl(var(--background) / 0.5) 0%, transparent 18%)" }}
      />
    </div>
  );
}
