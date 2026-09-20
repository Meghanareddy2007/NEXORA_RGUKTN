"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, Zap, Loader2, PlayCircle } from "lucide-react";
import {
  fetchRlSummary,
  trainRlAgent,
  fetchRlRecommendation,
  RlSummary,
  RlRecommendation,
  RlTrafficLevel,
  RlBacklogLevel,
} from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const LEVELS: ("Low" | "Med" | "High")[] = ["Low", "Med", "High"];

const ACTION_COLOR: Record<string, string> = {
  DEFER: "#94a3b8",
  MODERATE_RELEASE: "#f59e0b",
  AGGRESSIVE_RELEASE: "#22c55e",
};

const ACTION_SHORT: Record<string, string> = {
  DEFER: "Defer",
  MODERATE_RELEASE: "Moderate",
  AGGRESSIVE_RELEASE: "Aggressive",
};

export default function RlAgentPage() {
  const [summary, setSummary] = useState<RlSummary | null>(null);
  const [training, setTraining] = useState(false);
  const [traffic, setTraffic] = useState<RlTrafficLevel>("Med");
  const [backlog, setBacklog] = useState<RlBacklogLevel>("Med");
  const [recommendation, setRecommendation] = useState<RlRecommendation | null>(null);

  function refresh() {
    fetchRlSummary().then(setSummary);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    fetchRlRecommendation(traffic, backlog).then(setRecommendation).catch(() => setRecommendation(null));
  }, [traffic, backlog, summary?.trained_episodes]);

  async function handleTrain(episodes: number) {
    setTraining(true);
    try {
      const result = await trainRlAgent(episodes);
      setSummary(result);
    } finally {
      setTraining(false);
    }
  }

  const rewardData = (summary?.reward_curve ?? []).map((r, i) => ({ episode: i + 1, reward: r }));

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
            <BrainCircuit className="h-4 w-4 text-primary" />
          </span>
          <h1 className="text-xl font-semibold">Reinforcement Learning — Adaptive Block-Release Agent</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          The CP-SAT optimizer solves a static problem: given today&apos;s tasks and blocks, find the best assignment.
          This Q-learning agent solves a sequential one instead — how aggressively a corridor should keep releasing new
          maintenance windows, week over week, as backlog and train traffic shift. It learns entirely through trial and
          error against a simulated environment, using the same traffic-penalty weights as the optimizer.
        </p>
      </header>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-2">State</h2>
          <p className="text-xs text-muted-foreground mb-1">2 dimensions × 3 levels = 9 states</p>
          <p className="text-xs">(traffic_level, backlog_level)</p>
          <p className="text-xs text-muted-foreground mt-2">e.g. (High, Low), (Med, High)…</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-2">Actions</h2>
          <ul className="text-xs space-y-1">
            <li><span className="font-medium" style={{ color: ACTION_COLOR.DEFER }}>Defer</span> — release no extra windows</li>
            <li><span className="font-medium" style={{ color: ACTION_COLOR.MODERATE_RELEASE }}>Moderate release</span> — open a couple extra</li>
            <li><span className="font-medium" style={{ color: ACTION_COLOR.AGGRESSIVE_RELEASE }}>Aggressive release</span> — open many extra windows</li>
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-2">Reward</h2>
          <p className="text-xs text-muted-foreground">
            + priority-weighted backlog cleared − traffic disruption penalty − understaffed-backlog penalty
          </p>
          <p className="text-xs text-muted-foreground mt-2">Algorithm: tabular Q-learning, ε-greedy, decaying exploration</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-medium">Training progress</h2>
            <p className="text-xs text-muted-foreground">
              {summary ? `${summary.trained_episodes} episodes trained · ε = ${summary.epsilon}` : "Loading…"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleTrain(100)}
              disabled={training}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
            >
              {training ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
              Train +100 episodes
            </button>
            <button
              onClick={() => handleTrain(500)}
              disabled={training}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {training ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Train +500 episodes
            </button>
          </div>
        </div>

        {summary && summary.reward_curve.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={rewardData}>
                <CartesianGrid stroke="hsl(217 33% 20%)" strokeDasharray="3 3" />
                <XAxis dataKey="episode" stroke="hsl(215 20% 65%)" fontSize={11} />
                <YAxis stroke="hsl(215 20% 65%)" fontSize={11} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
                <Line type="monotone" dataKey="reward" stroke="#38bdf8" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2">
              Avg reward — first 10 episodes: <span className="text-foreground font-medium">{summary.avg_reward_first_10}</span>
              {"  ·  "}last 20 episodes: <span className="text-foreground font-medium">{summary.avg_reward_last_20}</span>
              {"  "}(the gap is the agent visibly learning a better policy)
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Train the agent to see its reward curve converge.</p>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Learned policy</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="py-1 pr-2">Traffic</th>
                <th className="py-1 pr-2">Backlog</th>
                <th className="py-1">Best action</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.policy ?? []).map((row) => (
                <tr key={`${row.traffic_level}-${row.backlog_level}`} className="border-t border-border">
                  <td className="py-1.5 pr-2">{row.traffic_level}</td>
                  <td className="py-1.5 pr-2">{row.backlog_level}</td>
                  <td className="py-1.5">
                    <span
                      className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                      style={{
                        color: ACTION_COLOR[row.best_action],
                        backgroundColor: `${ACTION_COLOR[row.best_action]}22`,
                      }}
                    >
                      {ACTION_SHORT[row.best_action]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Ask the agent</h2>
          <p className="text-xs text-muted-foreground mb-3">Pick a corridor&apos;s current conditions for a live recommendation.</p>
          <div className="flex flex-col gap-3 mb-4">
            <div>
              <label className="text-xs text-muted-foreground">Traffic level</label>
              <div className="flex gap-1.5 mt-1">
                {LEVELS.map((l) => (
                  <button
                    key={l}
                    onClick={() => setTraffic(l)}
                    className={`rounded-md border px-2.5 py-1 text-xs ${
                      traffic === l ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Backlog level</label>
              <div className="flex gap-1.5 mt-1">
                {LEVELS.map((l) => (
                  <button
                    key={l}
                    onClick={() => setBacklog(l)}
                    className={`rounded-md border px-2.5 py-1 text-xs ${
                      backlog === l ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {recommendation && (
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground mb-1">Recommended action</p>
              <p
                className="text-sm font-semibold mb-1"
                style={{ color: ACTION_COLOR[recommendation.recommended_action] }}
              >
                {recommendation.recommended_action_label}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Confidence gap over next-best action: {recommendation.confidence_gap} · learned from{" "}
                {recommendation.trained_episodes} episodes
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
