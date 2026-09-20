"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchAssets,
  fetchMaintenanceTypes,
  createMaintenanceRequest,
  fetchPlanPreview,
  selectPlanOption,
  Asset,
  CandidateOption,
  MaintenanceRequest,
  PlanVisualization,
} from "@/lib/api";
import { TopBar } from "@/components/TopBar";
import { PlanVisualizationPanel } from "@/components/PlanVisualizationPanel";
import { Loader2, Sparkles, CheckCircle2, Star, ChevronRight } from "lucide-react";

const TIME_WINDOWS = [
  "Anytime (00:00-23:59)",
  "00:00-06:00",
  "06:00-12:00",
  "12:00-18:00",
  "18:00-23:59",
];

const RECOMMENDATION_STYLE: Record<string, string> = {
  "Best Option": "bg-success/15 text-success",
  "Consider": "bg-warning/15 text-warning",
  "Not Recommended": "bg-danger/15 text-danger",
};

function timeLabel(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function GeneratePlanPage() {
  const router = useRouter();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [maintenanceTypes, setMaintenanceTypes] = useState<string[]>([]);

  const [assetId, setAssetId] = useState("");
  const [maintenanceType, setMaintenanceType] = useState("");
  const [durationHrs, setDurationHrs] = useState(2);
  const [priority, setPriority] = useState<"HIGH" | "MEDIUM" | "LOW">("HIGH");
  const [preferredDate, setPreferredDate] = useState("");
  const [timeWindow, setTimeWindow] = useState(TIME_WINDOWS[0]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [request, setRequest] = useState<MaintenanceRequest | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [viz, setViz] = useState<PlanVisualization | null>(null);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    fetchAssets().then((a) => {
      setAssets(a);
      if (a.length) setAssetId(a[0].asset_id);
    });
    fetchMaintenanceTypes().then((t) => {
      setMaintenanceTypes(t);
      if (t.length) setMaintenanceType(t[0]);
    });
  }, []);

  const activeCandidate: CandidateOption | undefined = useMemo(() => {
    if (!request) return undefined;
    return request.candidates.find((c) => c.option === selectedOption) ?? request.candidates[0];
  }, [request, selectedOption]);

  // Re-fetch the timeline whenever the highlighted row changes, so the
  // Plan Visualization panel always matches the option the user is looking at.
  useEffect(() => {
    if (!request || !selectedOption) return;
    fetchPlanPreview(request.id, selectedOption)
      .then(setViz)
      .catch(() => {});
  }, [request, selectedOption]);

  const handleGenerate = async () => {
    if (!assetId || !maintenanceType) return;
    setSubmitting(true);
    setError(null);
    setApproved(false);
    try {
      // POST /api/maintenance-requests -> persisted immediately in the
      // backend's SQLite `maintenance_requests` table (backend/data/app.db),
      // together with the AI-generated candidate windows.
      const record = await createMaintenanceRequest({
        asset_id: assetId,
        maintenance_type: maintenanceType,
        required_duration_hrs: durationHrs,
        priority,
        preferred_date: preferredDate || undefined,
        time_window: timeWindow,
      });
      setRequest(record);
      const best = record.candidates.find((c) => c.recommendation === "Best Option");
      const firstOption = best ? best.option : record.candidates[0]?.option ?? null;
      setSelectedOption(firstOption);
    } catch {
      setError("Could not generate a plan. Check that the backend is running on :8000.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!request || !selectedOption) return;
    setApproving(true);
    setError(null);
    try {
      const updated = await selectPlanOption(request.id, selectedOption);
      setRequest(updated);
      setApproved(true);
    } catch {
      setError("Could not approve this block plan. It may already be booked.");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Block Planning" subtitle="Generate Plan" />

      <div className="p-6">
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 text-danger text-sm p-3 mb-4">{error}</div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr_360px] gap-4 items-start">
          {/* ---------------- Maintenance Request Details form ---------------- */}
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Maintenance Request Details</h2>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Asset</span>
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="rounded-md border border-border bg-background px-2.5 py-2 text-sm"
              >
                {assets.map((a) => (
                  <option key={a.asset_id} value={a.asset_id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Maintenance Type</span>
              <select
                value={maintenanceType}
                onChange={(e) => setMaintenanceType(e.target.value)}
                className="rounded-md border border-border bg-background px-2.5 py-2 text-sm"
              >
                {maintenanceTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Required Duration (hrs)</span>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={durationHrs}
                  onChange={(e) => setDurationHrs(Number(e.target.value))}
                  className="rounded-md border border-border bg-background px-2.5 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Priority</span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as "HIGH" | "MEDIUM" | "LOW")}
                  className="rounded-md border border-border bg-background px-2.5 py-2 text-sm"
                >
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Preferred Date</span>
              <input
                type="date"
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                className="rounded-md border border-border bg-background px-2.5 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Time Window</span>
              <select
                value={timeWindow}
                onChange={(e) => setTimeWindow(e.target.value)}
                className="rounded-md border border-border bg-background px-2.5 py-2 text-sm"
              >
                {TIME_WINDOWS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={handleGenerate}
              disabled={submitting || !assetId || !maintenanceType}
              className="mt-2 flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate AI Plan
            </button>
          </div>

          {/* ---------------- AI Generated Plan - Candidate Time Windows ---------------- */}
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
            <h2 className="text-sm font-semibold">AI Generated Plan — Candidate Time Windows</h2>

            {!request && (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Fill in the maintenance request details and click{" "}
                <span className="text-foreground font-medium">Generate AI Plan</span> to see candidate blocks.
              </p>
            )}

            {request && request.candidates.length === 0 && (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No available blocks matched this request's corridor / duration.
              </p>
            )}

            {request && request.candidates.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border">
                        <th className="py-2 pr-3">Option</th>
                        <th className="py-2 pr-3">Time Window</th>
                        <th className="py-2 pr-3">Trains Affected</th>
                        <th className="py-2 pr-3">Est. Delay</th>
                        <th className="py-2 pr-3">Score</th>
                        <th className="py-2 pr-3">Recommendation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {request.candidates.map((c) => {
                        const active = selectedOption === c.option;
                        return (
                          <tr
                            key={c.option}
                            onClick={() => setSelectedOption(c.option)}
                            className={`border-b border-border/50 cursor-pointer transition-colors ${
                              active ? "bg-primary/10" : "hover:bg-muted/40"
                            }`}
                          >
                            <td className="py-2.5 pr-3 font-medium">{c.option}</td>
                            <td className="py-2.5 pr-3">
                              {timeLabel(c.start_time)} - {timeLabel(c.end_time)}
                            </td>
                            <td className="py-2.5 pr-3">{c.trains_affected}</td>
                            <td className="py-2.5 pr-3">{c.expected_delay_min} min</td>
                            <td className="py-2.5 pr-3 font-medium">{c.score}/100</td>
                            <td className="py-2.5 pr-3">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${RECOMMENDATION_STYLE[c.recommendation]}`}
                              >
                                {c.recommendation === "Best Option" && <Star className="h-2.5 w-2.5" />}
                                {c.recommendation}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {activeCandidate && activeCandidate.reasons.length > 0 && (
                  <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-xs">
                    <div className="font-medium text-success mb-1.5">Why this option is best</div>
                    <ul className="flex flex-col gap-1">
                      {activeCandidate.reasons.map((r, i) => (
                        <li key={i} className="flex items-center gap-1.5 text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  onClick={handleApprove}
                  disabled={approving || !selectedOption || approved}
                  className="mt-1 flex items-center justify-center gap-2 rounded-md bg-success text-white px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {approved ? "Block Plan Approved" : `Approve Option ${selectedOption ?? ""}`}
                </button>

                {approved && (
                  <button
                    onClick={() => router.push("/blocks/proposed")}
                    className="flex items-center justify-center gap-1 text-xs text-primary hover:underline"
                  >
                    View in Proposed Blocks <ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </>
            )}
          </div>

          {/* ---------------- Plan Visualization ---------------- */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Plan Visualization</h2>
            {viz ? (
              <PlanVisualizationPanel viz={viz} activeCandidate={activeCandidate} />
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">
                The timeline appears here once a plan is generated.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
