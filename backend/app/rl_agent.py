"""
Reinforcement Learning module — Adaptive Corridor Block-Release Agent.

WHY THIS EXISTS ALONGSIDE THE OR-TOOLS OPTIMIZER
-------------------------------------------------
optimizer.py solves a *static* assignment problem: given today's task pool
and today's available blocks, find the single best task -> block mapping.
It has no memory and makes no decision about *when* to keep releasing
maintenance windows on a corridor as backlog and train-traffic conditions
change week over week.

That "how aggressively should COA keep releasing blocks on this corridor,
given current traffic and backlog?" question is a *sequential* decision
problem — the right action this week affects the state (backlog, risk)
you face next week. That's exactly what an MDP + reinforcement learning
is for, so it complements (not replaces) the CP-SAT optimizer:

    OR-Tools (optimizer.py)  -> "which tasks go in which blocks, today"
    RL agent   (this file)   -> "how much block-release capacity should
                                 COA open up on this corridor, this week,
                                 given traffic + backlog conditions"

MDP FORMULATION
----------------
State  S = (traffic_level, backlog_level), each in {Low, Med, High} -> 9 states
Action A = {DEFER, MODERATE_RELEASE, AGGRESSIVE_RELEASE}
Reward R = priority_backlog_cleared_gain - traffic_disruption_penalty
           - understaffed_backlog_penalty
Transition: backlog shrinks with tasks cleared but grows with new arrivals;
            traffic drifts randomly week to week (simulating variable
            weekly train schedules) — this file's BlockReleaseEnv.

The traffic disruption penalty re-uses the exact TRAFFIC_PENALTY weights
optimizer.py already uses for its High/Med/Low traffic levels, so the RL
agent is optimizing against the same cost structure as the rest of the
system, just across a multi-week horizon instead of a single snapshot.

ALGORITHM
---------
Tabular Q-learning (off-policy TD control), epsilon-greedy exploration
with decay. Small (9 state x 3 action) table is fully interpretable —
every learned decision can be inspected and explained to a jury, which
matters more here than raw performance from a bigger algorithm.
"""

import random
from typing import Dict, Any, List, Tuple

TRAFFIC_LEVELS = ["Low", "Med", "High"]
BACKLOG_LEVELS = ["Low", "Med", "High"]
ACTIONS = ["DEFER", "MODERATE_RELEASE", "AGGRESSIVE_RELEASE"]

State = Tuple[str, str]
STATES: List[State] = [(t, b) for t in TRAFFIC_LEVELS for b in BACKLOG_LEVELS]

# Same traffic penalty weights as optimizer.py's TRAFFIC_PENALTY, so the RL
# reward signal stays consistent with the CP-SAT objective elsewhere in the app.
TRAFFIC_PENALTY = {"Low": 0, "Med": 3, "High": 8}
ACTION_RELEASE_UNITS = {"DEFER": 0, "MODERATE_RELEASE": 2, "AGGRESSIVE_RELEASE": 5}
ACTION_CONFLICT_MULT = {"DEFER": 0.0, "MODERATE_RELEASE": 1.0, "AGGRESSIVE_RELEASE": 2.2}

ACTION_LABELS = {
    "DEFER": "Defer — keep current block calendar, release no extra windows",
    "MODERATE_RELEASE": "Moderate release — open a couple of extra maintenance windows",
    "AGGRESSIVE_RELEASE": "Aggressive release — open many extra windows to clear backlog fast",
}


class BlockReleaseEnv:
    """A lightweight simulated environment for one corridor's week-to-week
    block-release decision. Deterministic dynamics plus small random noise,
    seeded for reproducibility, calibrated against optimizer.py's constants."""

    def __init__(self, seed: int = None, horizon_weeks: int = 12):
        self.rng = random.Random(seed)
        self.horizon_weeks = horizon_weeks
        self.reset()

    def reset(self) -> State:
        self.traffic_idx = self.rng.randrange(3)
        self.backlog_idx = self.rng.randrange(3)
        self.week = 0
        return self._state()

    def _state(self) -> State:
        return (TRAFFIC_LEVELS[self.traffic_idx], BACKLOG_LEVELS[self.backlog_idx])

    def step(self, action: str):
        traffic = TRAFFIC_LEVELS[self.traffic_idx]
        backlog_level = BACKLOG_LEVELS[self.backlog_idx]
        backlog_pressure = self.backlog_idx  # 0, 1, 2

        release_units = ACTION_RELEASE_UNITS[action]
        tasks_cleared = min(release_units, 2 + backlog_pressure * 2)
        # Backlog tasks tend to be higher-priority (older/overdue), so
        # clearing them under higher backlog pressure is worth more.
        priority_gain = tasks_cleared * (6 + backlog_pressure * 2)

        conflict_penalty = TRAFFIC_PENALTY[traffic] * ACTION_CONFLICT_MULT[action]
        conflict_penalty *= 0.85 + 0.3 * self.rng.random()  # operational noise

        understaffed_penalty = 6.0 if (backlog_level == "High" and action == "DEFER") else 0.0

        reward = priority_gain - conflict_penalty - understaffed_penalty

        new_backlog_score = backlog_pressure + 1 - (tasks_cleared / 3.0)
        self.backlog_idx = int(max(0, min(2, round(new_backlog_score))))
        self.traffic_idx = min(2, max(0, self.traffic_idx + self.rng.choice([-1, 0, 0, 1])))

        self.week += 1
        done = self.week >= self.horizon_weeks
        return self._state(), reward, done


class QLearningAgent:
    def __init__(
        self,
        alpha: float = 0.15,
        gamma: float = 0.9,
        epsilon: float = 0.3,
        epsilon_decay: float = 0.995,
        min_epsilon: float = 0.05,
        seed: int = 7,
    ):
        self.q: Dict[State, Dict[str, float]] = {s: {a: 0.0 for a in ACTIONS} for s in STATES}
        self.alpha, self.gamma = alpha, gamma
        self.epsilon, self.epsilon_decay, self.min_epsilon = epsilon, epsilon_decay, min_epsilon
        self.rng = random.Random(seed)
        self.trained_episodes = 0
        self.reward_history: List[float] = []

    def choose_action(self, state: State, greedy: bool = False) -> str:
        if not greedy and self.rng.random() < self.epsilon:
            return self.rng.choice(ACTIONS)
        qvals = self.q[state]
        return max(qvals, key=qvals.get)

    def update(self, state: State, action: str, reward: float, next_state: State) -> None:
        best_next = max(self.q[next_state].values())
        td_target = reward + self.gamma * best_next
        td_error = td_target - self.q[state][action]
        self.q[state][action] += self.alpha * td_error

    def train(self, episodes: int = 200) -> Dict[str, Any]:
        env = BlockReleaseEnv(seed=self.rng.randrange(10_000))
        for _ in range(episodes):
            state = env.reset()
            total_reward = 0.0
            done = False
            while not done:
                action = self.choose_action(state)
                next_state, reward, done = env.step(action)
                self.update(state, action, reward, next_state)
                state = next_state
                total_reward += reward
            self.epsilon = max(self.min_epsilon, self.epsilon * self.epsilon_decay)
            self.reward_history.append(round(total_reward, 2))
            self.trained_episodes += 1
        return self.get_summary()

    def get_policy(self) -> List[Dict[str, Any]]:
        return [
            {
                "traffic_level": s[0],
                "backlog_level": s[1],
                "best_action": max(self.q[s], key=self.q[s].get),
                "best_action_label": ACTION_LABELS[max(self.q[s], key=self.q[s].get)],
                "q_values": {a: round(v, 2) for a, v in self.q[s].items()},
            }
            for s in STATES
        ]

    def get_summary(self) -> Dict[str, Any]:
        recent = self.reward_history[-20:] if self.reward_history else []
        return {
            "trained_episodes": self.trained_episodes,
            "epsilon": round(self.epsilon, 3),
            "reward_curve": self.reward_history,
            "avg_reward_first_10": round(sum(self.reward_history[:10]) / min(10, len(self.reward_history)), 2)
            if self.reward_history
            else 0,
            "avg_reward_last_20": round(sum(recent) / len(recent), 2) if recent else 0,
            "policy": self.get_policy(),
        }

    def recommend(self, traffic_level: str, backlog_level: str) -> Dict[str, Any]:
        state = (traffic_level, backlog_level)
        if state not in self.q:
            raise ValueError(
                f"Invalid state — traffic_level must be one of {TRAFFIC_LEVELS}, "
                f"backlog_level must be one of {BACKLOG_LEVELS}."
            )
        action = self.choose_action(state, greedy=True)
        sorted_q = sorted(self.q[state].values(), reverse=True)
        confidence_gap = round(sorted_q[0] - sorted_q[1], 2) if len(sorted_q) > 1 else 0.0
        return {
            "state": {"traffic_level": traffic_level, "backlog_level": backlog_level},
            "recommended_action": action,
            "recommended_action_label": ACTION_LABELS[action],
            "q_values": {a: round(v, 2) for a, v in self.q[state].items()},
            "confidence_gap": confidence_gap,
            "trained_episodes": self.trained_episodes,
        }


# Module-level singleton — the Q-table persists in memory for the life of the
# backend process, acting as the "trained model" the frontend trains/queries.
agent = QLearningAgent()
