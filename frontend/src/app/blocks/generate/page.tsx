"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  fetchAssets,
  fetchMaintenanceTypes,
  createMaintenanceRequest,
  fetchPlanPreview,
  selectPlanOption,
  fetchDataset,
  Asset,
  CandidateOption,
  MaintenanceRequest,
  PlanVisualization,
  RawMaintenanceTask,
} from "@/lib/api";
import { TopBar } from "@/components/TopBar";
import { PlanVisualizationPanel } from "@/components/PlanVisualizationPanel";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  Star,
  ChevronRight,
  Zap,
  AlertTriangle,
  Info,
} from "lucide-react";

const TIME_WINDOWS = [
  "Anytime (00:00-23:59)",
  "00:00-06:00",
  "06:00-12:00",
  "12:00-18:00",
  "18:00-23:59",
];

const RECOMMENDATION_STYLE: Record<string, string> = {
  "Best Option": "bg-success/15 text-success",
  Consider: "bg-warning/15 text-warning",
  "Not Recommended": "bg-danger/15 text-danger",
};

function timeLabel(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function getPriorityFromTask(
  task: RawMaintenanceTask
): "HIGH" | "MEDIUM" | "LOW" {
  const score =
    task.criticality * 4 +
    task.urgency * 3 +
    task.safety_risk * 4 +
    task.overdue_days * 2;

  if (score >= 45) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

export default function GeneratePlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestId = searchParams.get("requestId");

  const [assets, setAssets] = useState<Asset[]>([]);
  const [maintenanceTypes, setMaintenanceTypes] = useState<string[]>([]);
  const [tdmsTasks, setTdmsTasks] = useState<RawMaintenanceTask[]>([]);

  const [assetId, setAssetId] = useState("");
  const [maintenanceType, setMaintenanceType] = useState("");

  /*
   * New problem details entered by the traction user.
   *
   * These fields make the page understandable from the TDMS user's point
   * of view instead of assuming that every maintenance request already
   * exists in the system.
   */
  const [problemDescription, setProblemDescription] = useState("");
  const [defectType, setDefectType] = useState("");

  const [durationHrs, setDurationHrs] = useState(2);
  const [priority, setPriority] = useState<
    "HIGH" | "MEDIUM" | "LOW"
  >("HIGH");

  const [preferredDate, setPreferredDate] = useState("");
  const [timeWindow, setTimeWindow] = useState(TIME_WINDOWS[0]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [request, setRequest] = useState<MaintenanceRequest | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [viz, setViz] = useState<PlanVisualization | null>(null);

  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  const [fromTdms, setFromTdms] = useState(false);
  const [selectedTdmsTask, setSelectedTdmsTask] =
    useState<RawMaintenanceTask | null>(null);

  /*
   * Load normal block-planning data.
   */
  useEffect(() => {
    fetchAssets()
      .then((a) => {
        setAssets(a);

        if (a.length && !assetId) {
          setAssetId(a[0].asset_id);
        }
      })
      .catch(() => {
        setError("Could not load assets.");
      });

    fetchMaintenanceTypes()
      .then((t) => {
        setMaintenanceTypes(t);

        if (t.length && !maintenanceType) {
          setMaintenanceType(t[0]);
        }
      })
      .catch(() => {
        setError("Could not load maintenance types.");
      });
  }, []);

  /*
   * TDMS → Block Planner integration.
   *
   * The TDMS Maintenance Priority Queue stores selected task IDs in:
   *
   * nexora_tdms_selected_tasks
   *
   * This section reads those task IDs and loads the corresponding
   * TDMS maintenance records.
   */
  useEffect(() => {
    const loadTdmsSelection = async () => {
      if (typeof window === "undefined") return;

      const raw = window.sessionStorage.getItem(
        "nexora_tdms_selected_tasks"
      );

      if (!raw) return;

      try {
        const selectedIds = JSON.parse(raw) as string[];

        if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
          return;
        }

        setFromTdms(true);

        const tasks = await fetchDataset<RawMaintenanceTask>(
          "tdms_maintenance"
        );

        setTdmsTasks(tasks);

        const matchedTasks = tasks.filter((task) =>
          selectedIds.includes(task.task_id)
        );

        if (matchedTasks.length === 0) {
          setError(
            "The selected TDMS maintenance task could not be found."
          );
          return;
        }

        /*
         * For the first version, one maintenance request is generated
         * from the first selected task.
         *
         * Multiple selected tasks can later be combined into a single
         * coordinated block.
         */
        const task = matchedTasks[0];

        setSelectedTdmsTask(task);

        setAssetId(task.asset_id);
        setMaintenanceType(task.maintenance_type);
        setDefectType(task.defect_type);

        /*
         * Show the actual problem information to the traction user.
         */
        setProblemDescription(
          `${task.defect_type} on ${task.asset_type} at ${task.location_km} km`
        );

        /*
         * Convert the TDMS priority factors into the existing
         * HIGH / MEDIUM / LOW block-planning priority.
         */
        setPriority(getPriorityFromTask(task));

        /*
         * Convert minutes into hours.
         */
        setDurationHrs(
          Math.max(0.5, Math.ceil(task.estimated_duration_min / 30) / 2)
        );

        /*
         * Remove it after reading so refreshing the page does not
         * repeatedly reload the same TDMS task.
         */
        window.sessionStorage.removeItem(
          "nexora_tdms_selected_tasks"
        );
      } catch {
        setError(
          "Could not read the selected TDMS maintenance request."
        );
      }
    };

    loadTdmsSelection();
  }, []);

  /*
   * Keep the selected candidate synchronized with the visualization.
   */
  const activeCandidate: CandidateOption | undefined = useMemo(() => {
    if (!request) return undefined;

    return (
      request.candidates.find(
        (c) => c.option === selectedOption
      ) ?? request.candidates[0]
    );
  }, [request, selectedOption]);

  /*
   * Fetch visualization whenever the highlighted candidate changes.
   */
  useEffect(() => {
    if (!request || !selectedOption) return;

    fetchPlanPreview(request.id, selectedOption)
      .then(setViz)
      .catch(() => {
        setViz(null);
      });
  }, [request, selectedOption]);

  /*
   * Generate AI block plan.
   */
  const handleGenerate = async () => {
    if (!assetId || !maintenanceType) {
      setError(
        "Please select an asset and maintenance type before generating the plan."
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    setApproved(false);
    setViz(null);

    try {
      /*
       * The existing backend API accepts these fields.
       *
       * problemDescription and defectType are currently kept as
       * TDMS-side context. The existing createMaintenanceRequest
       * API does not yet expose separate fields for them.
       */
      const record = await createMaintenanceRequest({
        asset_id: assetId,
        maintenance_type: maintenanceType,
        required_duration_hrs: durationHrs,
        priority,
        preferred_date: preferredDate || undefined,
        time_window: timeWindow,
      });

      setRequest(record);

      const best = record.candidates.find(
        (c) => c.recommendation === "Best Option"
      );

      const firstOption =
        best?.option ??
        record.candidates[0]?.option ??
        null;

      setSelectedOption(firstOption);
    } catch {
      setError(
        "Could not generate a plan. Check that the backend is running on :8000."
      );
    } finally {
      setSubmitting(false);
    }
  };

  /*
   * Approve the selected block.
   */
  const handleApprove = async () => {
    if (!request || !selectedOption) return;

    setApproving(true);
    setError(null);

    try {
      const updated = await selectPlanOption(
        request.id,
        selectedOption
      );

      setRequest(updated);
      setApproved(true);
    } catch {
      setError(
        "Could not approve this block plan. It may already be booked."
      );
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Block Planning"
        subtitle="Generate Plan"
      />

      <div className="p-6">
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 text-danger text-sm p-3 mb-4">
            {error}
          </div>
        )}

        {/* =========================================================
            TDMS SOURCE INFORMATION
           ========================================================= */}

        {fromTdms && selectedTdmsTask && (
          <div className="rounded-xl border border-info/30 bg-info/5 p-4 mb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/15">
                <Zap className="h-5 w-5 text-info" />
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">
                    Maintenance Request from TDMS
                  </h2>

                  <span className="rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-semibold text-info">
                    TDMS
                  </span>
                </div>

                <p className="text-xs text-muted-foreground mt-1">
                  This block plan was opened from the Traction
                  Distribution Maintenance priority queue.
                </p>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
                  <div>
                    <div className="text-[10px] text-muted-foreground">
                      Task ID
                    </div>
                    <div className="text-xs font-medium">
                      {selectedTdmsTask.task_id}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-muted-foreground">
                      Corridor
                    </div>
                    <div className="text-xs font-medium">
                      {selectedTdmsTask.corridor_id}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-muted-foreground">
                      Location
                    </div>
                    <div className="text-xs font-medium">
                      {selectedTdmsTask.location_km} km
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-muted-foreground">
                      Safety Risk
                    </div>
                    <div className="text-xs font-medium">
                      {selectedTdmsTask.safety_risk}/5
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-muted-foreground">
                      Criticality
                    </div>
                    <div className="text-xs font-medium">
                      {selectedTdmsTask.criticality}/5
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr_360px] gap-4 items-start">

          {/* =========================================================
              MAINTENANCE REQUEST DETAILS
             ========================================================= */}

          <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              Maintenance Request Details
            </h2>

            <p className="text-[11px] text-muted-foreground">
              Enter or verify the traction maintenance problem before
              requesting an AI-generated block.
            </p>

            {/* Asset */}

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">
                Asset
              </span>

              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="rounded-md border border-border bg-background px-2.5 py-2 text-sm"
              >
                {assets.map((a) => (
                  <option
                    key={a.asset_id}
                    value={a.asset_id}
                  >
                    {a.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Problem */}

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">
                New Problem / Defect
              </span>

              <textarea
                value={problemDescription}
                onChange={(e) =>
                  setProblemDescription(e.target.value)
                }
                placeholder="Example: OHE wire sag detected near pole..."
                rows={3}
                className="rounded-md border border-border bg-background px-2.5 py-2 text-sm resize-none"
              />

              <span className="text-[10px] text-muted-foreground">
                Describe the issue observed by the traction team.
              </span>
            </label>

            {/* Defect Type */}

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">
                Problem Type
              </span>

              <input
                value={defectType}
                onChange={(e) =>
                  setDefectType(e.target.value)
                }
                placeholder="Example: OHE Wire Sag"
                className="rounded-md border border-border bg-background px-2.5 py-2 text-sm"
              />
            </label>

            {/* Maintenance type */}

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">
                Maintenance Type
              </span>

              <select
                value={maintenanceType}
                onChange={(e) =>
                  setMaintenanceType(e.target.value)
                }
                className="rounded-md border border-border bg-background px-2.5 py-2 text-sm"
              >
                {maintenanceTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            {/* Duration + Priority */}

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">
                  Required Duration (hrs)
                </span>

                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={durationHrs}
                  onChange={(e) =>
                    setDurationHrs(
                      Number(e.target.value)
                    )
                  }
                  className="rounded-md border border-border bg-background px-2.5 py-2 text-sm"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">
                  Priority
                </span>

                <select
                  value={priority}
                  onChange={(e) =>
                    setPriority(
                      e.target.value as
                        | "HIGH"
                        | "MEDIUM"
                        | "LOW"
                    )
                  }
                  className="rounded-md border border-border bg-background px-2.5 py-2 text-sm"
                >
                  <option value="HIGH">
                    HIGH
                  </option>
                  <option value="MEDIUM">
                    MEDIUM
                  </option>
                  <option value="LOW">
                    LOW
                  </option>
                </select>
              </label>
            </div>

            {/* Preferred date */}

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">
                Preferred Date
              </span>

              <input
                type="date"
                value={preferredDate}
                onChange={(e) =>
                  setPreferredDate(e.target.value)
                }
                className="rounded-md border border-border bg-background px-2.5 py-2 text-sm"
              />
            </label>

            {/* Time window */}

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">
                Time Window
              </span>

              <select
                value={timeWindow}
                onChange={(e) =>
                  setTimeWindow(e.target.value)
                }
                className="rounded-md border border-border bg-background px-2.5 py-2 text-sm"
              >
                {TIME_WINDOWS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>

            {/* TDMS information */}

            {selectedTdmsTask && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0" />

                  <div className="text-xs">
                    <div className="font-medium mb-1">
                      Maintenance Risk Information
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                      <span>
                        Criticality:{" "}
                        {selectedTdmsTask.criticality}/5
                      </span>

                      <span>
                        Urgency:{" "}
                        {selectedTdmsTask.urgency}/5
                      </span>

                      <span>
                        Safety:{" "}
                        {selectedTdmsTask.safety_risk}/5
                      </span>

                      <span>
                        Overdue:{" "}
                        {selectedTdmsTask.overdue_days} days
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Generate */}

            <button
              onClick={handleGenerate}
              disabled={
                submitting ||
                !assetId ||
                !maintenanceType
              }
              className="mt-2 flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}

              Generate AI Plan
            </button>
          </div>

          {/* =========================================================
              AI GENERATED PLAN
             ========================================================= */}

          <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              AI Generated Plan — Candidate Time Windows
            </h2>

            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3">
              <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />

              <p className="text-[11px] text-muted-foreground">
                The planner evaluates available block windows and
                presents candidate options based on the maintenance
                duration, priority, corridor availability and train
                impact.
              </p>
            </div>

            {!request && (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Fill in the maintenance request details and click{" "}
                <span className="text-foreground font-medium">
                  Generate AI Plan
                </span>{" "}
                to see candidate blocks.
              </p>
            )}

            {request &&
              request.candidates.length === 0 && (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  No available blocks matched this request&apos;s
                  corridor / duration.
                </p>
              )}

            {request &&
              request.candidates.length > 0 && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b border-border">
                          <th className="py-2 pr-3">
                            Option
                          </th>

                          <th className="py-2 pr-3">
                            Time Window
                          </th>

                          <th className="py-2 pr-3">
                            Trains Affected
                          </th>

                          <th className="py-2 pr-3">
                            Est. Delay
                          </th>

                          <th className="py-2 pr-3">
                            Score
                          </th>

                          <th className="py-2 pr-3">
                            Recommendation
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {request.candidates.map((c) => {
                          const active =
                            selectedOption === c.option;

                          return (
                            <tr
                              key={c.option}
                              onClick={() =>
                                setSelectedOption(
                                  c.option
                                )
                              }
                              className={`border-b border-border/50 cursor-pointer transition-colors ${
                                active
                                  ? "bg-primary/10"
                                  : "hover:bg-muted/40"
                              }`}
                            >
                              <td className="py-2.5 pr-3 font-medium">
                                {c.option}
                              </td>

                              <td className="py-2.5 pr-3">
                                {timeLabel(
                                  c.start_time
                                )}{" "}
                                -{" "}
                                {timeLabel(
                                  c.end_time
                                )}
                              </td>

                              <td className="py-2.5 pr-3">
                                {c.trains_affected}
                              </td>

                              <td className="py-2.5 pr-3">
                                {c.expected_delay_min}{" "}
                                min
                              </td>

                              <td className="py-2.5 pr-3 font-medium">
                                {c.score}/100
                              </td>

                              <td className="py-2.5 pr-3">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    RECOMMENDATION_STYLE[
                                      c.recommendation
                                    ]
                                  }`}
                                >
                                  {c.recommendation ===
                                    "Best Option" && (
                                    <Star className="h-2.5 w-2.5" />
                                  )}

                                  {c.recommendation}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {activeCandidate &&
                    activeCandidate.reasons.length >
                      0 && (
                      <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-xs">
                        <div className="font-medium text-success mb-1.5">
                          Why this option is recommended
                        </div>

                        <ul className="flex flex-col gap-1">
                          {activeCandidate.reasons.map(
                            (r, i) => (
                              <li
                                key={i}
                                className="flex items-center gap-1.5 text-muted-foreground"
                              >
                                <CheckCircle2 className="h-3 w-3 text-success shrink-0" />

                                {r}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    )}

                  <button
                    onClick={handleApprove}
                    disabled={
                      approving ||
                      !selectedOption ||
                      approved
                    }
                    className="mt-1 flex items-center justify-center gap-2 rounded-md bg-success text-white px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {approving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}

                    {approved
                      ? "Block Plan Approved"
                      : `Approve Option ${
                          selectedOption ?? ""
                        }`}
                  </button>

                  {approved && (
                    <button
                      onClick={() =>
                        router.push(
                          "/blocks/proposed"
                        )
                      }
                      className="flex items-center justify-center gap-1 text-xs text-primary hover:underline"
                    >
                      View in Proposed Blocks

                      <ChevronRight className="h-3 w-3" />
                    </button>
                  )}
                </>
              )}
          </div>

          {/* =========================================================
              PLAN VISUALIZATION
             ========================================================= */}

          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">
              Plan Visualization
            </h2>

            {viz ? (
              <PlanVisualizationPanel
                viz={viz}
                activeCandidate={activeCandidate}
              />
            ) : (
              <div className="py-6 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Sparkles className="h-5 w-5 text-muted-foreground" />
                </div>

                <p className="text-xs text-muted-foreground">
                  The timeline appears here once an AI plan
                  is generated.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
