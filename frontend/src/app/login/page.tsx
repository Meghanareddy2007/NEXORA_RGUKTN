"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrainFront, Loader2, Eye, EyeOff, User, Lock, ArrowRight } from "lucide-react";
import { login } from "@/lib/auth";
import { RailYardScene } from "@/components/RailYardScene";

const DEMO_ACCOUNTS: { dept: string; label: string; username: string; password: string; tone: string }[] = [
  { dept: "TMS", label: "Track Maintenance System", username: "tms_user", password: "tms123", tone: "success" },
  { dept: "SMMS", label: "Signal & Telecom Maintenance", username: "smms_user", password: "smms123", tone: "warning" },
  { dept: "TRACTION", label: "Traction Distribution Maintenance", username: "traction_user", password: "traction123", tone: "info" },
  { dept: "COA", label: "Corridor & Block Availability", username: "coa_user", password: "coa123", tone: "violet" },
  { dept: "ADMIN", label: "Administrator", username: "admin", password: "admin123", tone: "primary" },
];

const TONE_CLASSES: Record<string, { active: string; dot: string }> = {
  success: { active: "bg-success text-[#062014]", dot: "bg-success" },
  warning: { active: "bg-warning text-[#241703]", dot: "bg-warning" },
  info: { active: "bg-info text-[#031521]", dot: "bg-info" },
  violet: { active: "bg-violet-400 text-[#150a28]", dot: "bg-violet-400" },
  primary: { active: "bg-primary text-primary-foreground", dot: "bg-primary" },
};

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedDept, setSelectedDept] = useState<string>(DEMO_ACCOUNTS[0].dept);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const active = DEMO_ACCOUNTS.find((a) => a.dept === selectedDept) ?? DEMO_ACCOUNTS[0];
  const tone = TONE_CLASSES[active.tone];

  function selectDept(acct: (typeof DEMO_ACCOUNTS)[number]) {
    setSelectedDept(acct.dept);
    setUsername(acct.username);
    setPassword(acct.password);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
      router.push("/");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Invalid username or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background">
      {/* ---------- Left: animated rail-yard showcase ---------- */}
      <div className="relative hidden w-[58%] flex-col justify-end overflow-hidden lg:flex">
        <RailYardScene />

        <div className="relative z-10 max-w-lg px-11 pb-12">
          <p className="login-fade-in mb-3.5 font-mono text-xs tracking-wide text-success">SIH25 · PROBLEM STATEMENT 27</p>
          <h1
            className="login-fade-in text-3xl font-semibold leading-tight text-foreground"
            style={{ animationDelay: "0.1s" }}
          >
            Maximizing asset availability, one block at a time.
          </h1>
          <p className="login-fade-in mt-3.5 max-w-[40ch] text-sm leading-relaxed text-muted-foreground" style={{ animationDelay: "0.18s" }}>
            A single console for Track, Signal &amp; Telecom, Traction and Corridor Availability teams —
            replacing spreadsheets and phone calls with an optimized, conflict-free block calendar.
          </p>
          <div className="login-fade-in mt-5 flex gap-4 font-mono text-[11.5px] text-muted-foreground" style={{ animationDelay: "0.24s" }}>
            <span className="flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full bg-success" /> Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full bg-warning" /> Upcoming
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full bg-danger" /> Blocked
            </span>
          </div>
        </div>
      </div>

      {/* ---------- Right: floating glass login card ---------- */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-12">
        <div
          className="absolute inset-0 lg:hidden"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(var(--primary) / 0.10), transparent 60%), hsl(var(--background))",
          }}
        />
        {/* soft floating accent blobs behind the card */}
        <div
          aria-hidden
          className="ry-train-wrap absolute -right-16 -top-16 h-72 w-72 rounded-full opacity-30 blur-[70px]"
          style={{ background: "hsl(var(--primary))", animation: "none" }}
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full opacity-20 blur-[70px]"
          style={{ background: "hsl(var(--info))" }}
        />

        <div className="login-fade-in relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card/70 p-8 shadow-2xl shadow-black/40 backdrop-blur-2xl">
          <div className="mb-7 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
              <TrainFront className="h-4.5 w-4.5 text-primary" />
            </span>
            <span className="font-mono text-xs tracking-wide text-muted-foreground">UNIFIED BLOCK CONTROL</span>
          </div>

          <h2 className="text-lg font-semibold">Sign in to your dashboard</h2>
          <p className="mb-5 mt-1 text-xs text-muted-foreground">Choose your department to continue.</p>

          {/* department selector — sets accent + autofills the matching demo account */}
          <div className="relative mb-2 grid grid-cols-5 gap-1 rounded-lg border border-border bg-muted/40 p-1">
            {DEMO_ACCOUNTS.map((acct) => (
              <button
                key={acct.dept}
                type="button"
                onClick={() => selectDept(acct)}
                className={`rounded-md py-2 text-[11px] font-medium font-mono transition-colors ${
                  selectedDept === acct.dept ? tone.active : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {acct.dept}
              </button>
            ))}
          </div>
          <p className="mb-6 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            {active.label}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="empId"
                className="peer w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 pl-9 text-sm outline-none transition-colors focus:border-primary"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
                placeholder="Employee ID"
                autoComplete="username"
                autoFocus
                required
              />
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="pwd"
                type={showPassword ? "text" : "password"}
                className="peer w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 pl-9 pr-10 text-sm outline-none transition-colors focus:border-primary"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="Password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex items-center justify-between text-[13px] text-muted-foreground">
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Keep me signed in
              </label>
              <a href="#" onClick={(e) => e.preventDefault()} className="hover:underline">
                Forgot password?
              </a>
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex items-center justify-center gap-2 rounded-full bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-70"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Sign in to {active.dept}
            </button>
          </form>

          <p className="mt-6 text-center font-mono text-[11px] text-muted-foreground/70">
            Ministry of Railways · Automated Block Planning
          </p>
        </div>
      </div>
    </div>
  );
}
