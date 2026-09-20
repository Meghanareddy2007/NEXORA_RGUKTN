"use client";

/**
 * Animated "decision network" backdrop for the login screen's left panel.
 * Represents the AI layer of the product (RL agent + ML prioritizer +
 * CP-SAT optimizer feeding one decision) as a small pulsing neural graph,
 * rather than reusing the RailBackground train animation everywhere.
 * Pure SVG + CSS keyframes, no extra libraries.
 */

const LAYERS: { x: number; nodes: number[] }[] = [
  { x: 60, nodes: [60, 150, 240, 330] },
  { x: 230, nodes: [30, 105, 180, 255, 330] },
  { x: 400, nodes: [70, 170, 270] },
];

function buildEdges() {
  const edges: { x1: number; y1: number; x2: number; y2: number; delay: string; dur: string }[] = [];
  for (let l = 0; l < LAYERS.length - 1; l++) {
    const from = LAYERS[l];
    const to = LAYERS[l + 1];
    from.nodes.forEach((y1, i) => {
      to.nodes.forEach((y2, j) => {
        // Sparsify — a full bipartite graph reads as noise, a partial one reads as structure.
        if ((i + j) % 2 === 0) {
          edges.push({
            x1: from.x,
            y1,
            x2: to.x,
            y2,
            delay: `${((i * 3 + j) % 7) * 0.4}s`,
            dur: `${3 + ((i + j) % 4)}s`,
          });
        }
      });
    });
  }
  return edges;
}

const EDGES = buildEdges();

export function NeuralPulseBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 15% 20%, hsl(var(--primary) / 0.16), transparent 60%), hsl(var(--background))",
        }}
      />

      <svg viewBox="0 0 460 360" className="absolute left-1/2 top-1/2 h-[85%] w-[85%] -translate-x-1/2 -translate-y-1/2 opacity-80">
        {EDGES.map((e, i) => (
          <line
            key={i}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="hsl(var(--primary) / 0.35)"
            strokeWidth={1}
            className="neuro-edge"
            style={{ animationDelay: e.delay, animationDuration: e.dur }}
          />
        ))}

        {LAYERS.map((layer, li) =>
          layer.nodes.map((y, ni) => (
            <circle
              key={`${li}-${ni}`}
              cx={layer.x}
              cy={y}
              r={li === 1 ? 5 : 6.5}
              fill="hsl(var(--primary) / 0.85)"
              className="neuro-node"
              style={{ animationDelay: `${((li + 1) * ni * 0.35) % 3}s` }}
            />
          ))
        )}
      </svg>

      {/* faint scan-line drifting downward, ties back to a "live system" feel */}
      <div className="neuro-scan absolute inset-x-0 h-24 opacity-[0.06]" />

      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to top, hsl(var(--background)) 0%, transparent 30%)",
        }}
      />
    </div>
  );
}
