"use client";

import { useEffect, useState } from "react";
import {
  fetchMaintenanceRequests,
  selectPlanOption,
  MaintenanceRequest,
} from "@/lib/api";
import { TopBar } from "@/components/TopBar";
import { PlanVisualizationPanel } from "@/components/PlanVisualizationPanel";
import { Loader2, CheckCircle2, Clock, ChevronDown, ChevronUp } from "lucide-react";

const PRIORITY_STYLE: Record<string, string> = {
  HIGH: "bg-danger/15 text-danger",
  MEDIUM: "bg-warning/15 text-warning",
  LOW: "bg-success/15 text-success",
};

const STATUS_STYLE: Record<string, string> = {
  "Pending Approval": "bg-warning/15 text-warning",
  Approved: "bg-success/15 text-success",
};

export default function ProposedBlocksPage() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = () => {
    fetchMaintenanceRequests()
      .then((r) => {
        setRequests(r);
        setError(null);
      })
      .catch(() => setError("Could not reach API. Is the backend running on :8000?"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleApprove = async (req: MaintenanceRequest) => {
    const best = req.candidates.find((c) => c.recommendation === "Best Option") ?? req.candidates[0];
    if (!best) return;
    setApprovingId(req.id);
    try {
      await selectPlanOption(req.id, best.option);
      load();
    } catch {
      setError("Could not approve this request. It may already be booked.");
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Block Planning" subtitle="Proposed Blocks" />

      <div className="flex flex-col gap-4 p-6">
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 text-danger text-sm p-3">{error}</div>
        )}

        {loading && <p className="text-sm text-muted-foreground">Loading proposed blocks\u2026</p>}

        {!loading && requests.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">
            No maintenance requests yet. Head to Generate Plan to create one.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {requests.map((req) => {
            const best = req.candidates.find((c) => c.recommendation === "Best Option") ?? req.candidates[0];
            const chosen = req.selected_option_index
              ? req.candidates.find((c) => c.option === req.selected_option_index)
              : best;
            const expanded = expandedId === req.id;

            return (
              <div key={req.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{req.asset_label}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${PRIORITY_STYLE[req.priority]}`}>
                        {req.priority}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${STATUS_STYLE[req.status]}`}>
                        {req.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {req.maintenance_type} &middot; {req.required_duration_hrs}h required &middot; {req.corridor_label}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {chosen && (
                      <div className="text-right text-xs">
                        <div className="font-medium">
                          {chosen.date} &middot; {chosen.start_time}-{chosen.end_time}
                        </div>
                        <div className="text-muted-foreground">
                          {chosen.trains_affected} trains affected &middot; {chosen.expected_delay_min} min delay
                        </div>
                      </div>
                    )}
                    {req.status === "Pending Approval" ? (
                      <button
                        onClick={() => handleApprove(req)}
                        disabled={approvingId === req.id || !best}
                        className="flex items-center gap-1.5 rounded-md bg-success text-white px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50 shrink-0"
                      >
                        {approvingId === req.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Approve
                      </button>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-success shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                      </span>
                    )}
                    <button
                      onClick={() => setExpandedId(expanded ? null : req.id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
                    >
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" /> Candidate Time Windows
                      </h3>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b border-border">
                            <th className="py-1.5 pr-3">Option</th>
                            <th className="py-1.5 pr-3">Window</th>
                            <th className="py-1.5 pr-3">Score</th>
                            <th className="py-1.5 pr-3">Rec.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {req.candidates.map((c) => (
                            <tr key={c.option} className="border-b border-border/50">
                              <td className="py-1.5 pr-3">{c.option}</td>
                              <td className="py-1.5 pr-3">
                                {c.start_time}-{c.end_time}
                              </td>
                              <td className="py-1.5 pr-3">{c.score}/100</td>
                              <td className="py-1.5 pr-3">{c.recommendation}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold mb-2">Plan Visualization</h3>
                      {req.plan_visualization ? (
                        <PlanVisualizationPanel viz={req.plan_visualization} activeCandidate={chosen} />
                      ) : (
                        <p className="text-xs text-muted-foreground">No visualization available.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
