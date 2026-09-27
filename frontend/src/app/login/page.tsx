"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, LockKeyhole, UserRound, ArrowRight, Radio, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { homeForDepartment, setAuth, AuthUser } from "@/lib/auth";

const DEPARTMENTS = [
  { key: "TMS", label: "TMS", description: "Track Maintenance System", username: "tms_user", password: "tms123", color: "bg-emerald-500" },
  { key: "SMMS", label: "SMMS", description: "Signal & Telecom Maintenance System", username: "smms_user", password: "smms123", color: "bg-sky-500" },
  { key: "TRACTION", label: "TRACTION", description: "Traction & Diesel Management System", username: "traction_user", password: "traction123", color: "bg-amber-500" },
  { key: "COA", label: "COA", description: "Corridor Operations Authority", username: "coa_user", password: "coa123", color: "bg-violet-500" },
] as const;

type DepartmentKey = typeof DEPARTMENTS[number]["key"];

export default function LoginPage() {
  const router = useRouter();
  const [department, setDepartment] = useState<DepartmentKey>("TMS");
  const [username, setUsername] = useState("tms_user");
  const [password, setPassword] = useState("tms123");
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = DEPARTMENTS.find((x) => x.key === department)!;

  function chooseDepartment(next: DepartmentKey) {
    const item = DEPARTMENTS.find((x) => x.key === next)!;
    setDepartment(next);
    setUsername(item.username);
    setPassword(item.password);
    setError("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post<AuthUser>("/api/auth/login", { username, password });
      setAuth(data);
      // The prototype keeps the original department-specific entry points.
      // The checkbox is intentionally visual only so it cannot alter routing.
      void keepSignedIn;
      router.replace(homeForDepartment(data.department));
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Login failed. Check the Employee ID and password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07101c] text-foreground overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-70">
        <div className="absolute -right-20 -top-28 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute left-1/3 bottom-0 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <div className="relative grid min-h-screen lg:grid-cols-[58%_42%]">
        {/* Original Streamrollers / railway landing panel */}
        <section className="relative hidden overflow-hidden border-r border-cyan-900/30 bg-[#061421] lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_35%,rgba(0,190,255,.10),transparent_45%),linear-gradient(180deg,rgba(4,20,35,.55),rgba(2,8,17,.92))]" />
          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(85,130,160,.15)_1px,transparent_1px),linear-gradient(90deg,rgba(85,130,160,.15)_1px,transparent_1px)] [background-size:44px_44px]" />

          <div className="relative z-10 p-7 xl:p-8">
            <Image src="/streamrollers-logo.png" alt="Streamrollers" width={410} height={126} className="h-auto w-[380px] max-w-full object-contain object-left" priority />
          </div>

          <svg className="absolute left-0 right-0 top-[150px] h-[390px] w-full" viewBox="0 0 900 390" fill="none" aria-hidden="true">
            <path d="M70 105 C250 95 330 115 465 105 C610 94 680 120 825 105" stroke="#667789" strokeWidth="2" opacity=".7" />
            <path d="M70 122 C250 112 330 132 465 122 C610 111 680 137 825 122" stroke="#667789" strokeWidth="2" opacity=".7" />
            <path d="M70 105 C180 155 290 170 470 155 C650 140 730 170 825 105" stroke="#667789" strokeWidth="2" opacity=".65" />
            <path d="M70 122 C180 172 290 187 470 172 C650 157 730 187 825 122" stroke="#667789" strokeWidth="2" opacity=".65" />
            <path d="M260 205 C260 160 290 142 350 142 H620 C675 142 705 163 705 205" stroke="#657588" strokeWidth="2" opacity=".7" />
            <path d="M70 250 H825" stroke="#657588" strokeWidth="2" opacity=".75" />
            <path d="M70 265 H825" stroke="#657588" strokeWidth="2" opacity=".75" />
            <path d="M150 250 C155 205 190 180 260 165" stroke="#657588" strokeWidth="2" opacity=".65" />
            <path d="M705 205 C720 180 760 165 825 150" stroke="#657588" strokeWidth="2" opacity=".65" />
            <path d="M375 250 V180" stroke="#657588" strokeWidth="2" opacity=".65" />
            <path d="M520 250 V180" stroke="#657588" strokeWidth="2" opacity=".65" />
            <path d="M655 250 V180" stroke="#657588" strokeWidth="2" opacity=".65" />
            <rect x="365" y="93" width="14" height="14" rx="3" fill="#0b1b28" stroke="#6f8498" strokeWidth="2" />
            <circle cx="372" cy="100" r="3" fill="#20d57a" />
            <rect x="518" y="93" width="14" height="14" rx="3" fill="#0b1b28" stroke="#6f8498" strokeWidth="2" />
            <circle cx="525" cy="100" r="3" fill="#53697b" />
            <rect x="655" y="185" width="35" height="13" rx="3" fill="#21c96b" />
            <circle cx="760" cy="120" r="4" fill="#20d57a" />
            <g fill="#657588">
              <rect x="735" y="98" width="8" height="8" rx="1"/><rect x="748" y="98" width="8" height="8" rx="1"/>
              <rect x="735" y="111" width="8" height="8" rx="1"/><rect x="748" y="111" width="8" height="8" rx="1"/>
              <rect x="690" y="118" width="8" height="8" rx="1"/><rect x="703" y="118" width="8" height="8" rx="1"/><rect x="716" y="118" width="8" height="8" rx="1"/>
            </g>
            <g fill="#71869a" opacity=".9">
              {Array.from({length:7}).map((_,i)=><rect key={i} x={650+i*15} y="244" width="10" height="10" rx="2"/>)}
            </g>
          </svg>

          <div className="absolute top-[245px] left-[48%] text-[10px] tracking-[.15em] text-slate-400">SECTION B</div>
          <div className="absolute top-[365px] left-[48%] text-[10px] tracking-[.15em] text-slate-400">SIDING · CP 42</div>
          <div className="absolute top-[438px] left-[9%] text-[10px] tracking-[.15em] text-slate-400">LOCO POOL</div>
          <div className="absolute top-[438px] left-[75%] text-[10px] tracking-[.15em] text-slate-400">MAINTENANCE DEPOT</div>

          <div className="absolute bottom-9 left-11 right-10">
            <div className="mb-3 flex items-center gap-2 text-[10px] text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Available
              <span className="ml-3 h-2 w-2 rounded-full bg-amber-400" /> Upcoming
              <span className="ml-3 h-2 w-2 rounded-full bg-red-400" /> Blocked
            </div>
            <h2 className="text-3xl font-semibold tracking-tight xl:text-[32px]">Maximizing asset availability, one block at a time.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              A single console for Track, Signal & Telecom, Traction and Corridor Availability teams — replacing spreadsheets and phone calls with an optimized, conflict-free block calendar.
            </p>
          </div>
        </section>

        {/* Login panel */}
        <section className="relative flex items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-[430px] rounded-2xl border border-slate-700/70 bg-[#101b2a]/95 p-7 shadow-2xl backdrop-blur xl:p-8">
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                <Radio className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[.16em] text-slate-400">UNITED BLOCK CONTROL</div>
                <div className="mt-1 text-[9px] text-slate-500">NEXORA · SIH PS27</div>
              </div>
            </div>

            <h1 className="text-[20px] font-semibold">Sign in to your dashboard</h1>
            <p className="mt-1 text-xs text-slate-400">Choose your department to continue.</p>

            <div className="mt-6 grid grid-cols-4 overflow-hidden rounded-lg border border-slate-700 bg-[#0b1421] p-1">
              {DEPARTMENTS.map((item) => (
                <button key={item.key} type="button" onClick={() => chooseDepartment(item.key)} className={`rounded-md px-1 py-2 text-[9px] font-medium transition ${department === item.key ? `${item.color} text-slate-950` : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
              <span className={`h-2 w-2 rounded-full ${selected.color}`} />
              {selected.description}
            </div>

            <form onSubmit={submit} className="mt-7 space-y-4">
              <label className="block text-xs text-slate-300">
                Employee ID
                <div className="relative mt-1.5">
                  <UserRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" className="w-full rounded-lg border border-slate-700 bg-[#0b1421] py-3 pl-10 pr-3 text-sm text-slate-100 outline-none focus:border-cyan-500" />
                </div>
              </label>

              <label className="block text-xs text-slate-300">
                Password
                <div className="relative mt-1.5">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="w-full rounded-lg border border-slate-700 bg-[#0b1421] py-3 pl-10 pr-10 text-sm text-slate-100 outline-none focus:border-cyan-500" />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2.5 top-2.5 rounded p-1 text-slate-500 hover:text-slate-200" aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-slate-400">
                  <input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)} className="h-3.5 w-3.5 accent-cyan-500" />
                  Keep me signed in
                </label>
                <button type="button" className="text-slate-400 hover:text-slate-200">Forgot password?</button>
              </div>

              {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>}

              <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-sky-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60">
                <ArrowRight className="h-4 w-4" />
                {busy ? "Signing in…" : `Sign in to ${selected.label}`}
              </button>
            </form>

            <div className="mt-7 flex items-center justify-center gap-2 text-[10px] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" /> Ministry of Railways · Automated Block Planning
            </div>
            <div className="mt-3 text-center text-[9px] leading-4 text-slate-600">Demo accounts are prefilled for the selected department.</div>
          </div>
        </section>
      </div>
    </main>
  );
}
