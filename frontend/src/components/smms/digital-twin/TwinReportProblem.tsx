"use client";

/**
 * "Report Problem" from inside the Digital Twin. It is NOT a second problem
 * system: it reads the same dropdown options (GET /api/smms/problem-reports/options)
 * and submits to the same endpoint (POST /api/smms/problem-reports) as the
 * existing Report Problem page, so the server applies the same validation,
 * numbering, audit entry and storage. The asset is fixed to the twin's asset.
 */
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Loader2, Send, X } from "lucide-react";
import {
  createProblemReport,
  fetchProblemReportOptions,
  type ProblemReport,
  type ProblemReportOptions,
} from "@/lib/smmsApi";

type FieldKey = "problem_type" | "severity" | "immediate_action" | "description";
type FieldErrors = Partial<Record<FieldKey | "asset_id", string>>;

const INPUT = "w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs";
const INVALID = "border-danger/60";

function parseApiError(err: unknown): { message: string; fields: FieldErrors } {
  const fallback = "The problem report could not be submitted. Please try again.";
  if (axios.isAxiosError(err)) {
    if (!err.response) return { message: "Could not reach the server. Check that the backend is running.", fields: {} };
    const detail = err.response.data?.detail;
    if (typeof detail === "string") return { message: detail, fields: {} };
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      return {
        message: typeof detail.message === "string" ? detail.message : fallback,
        fields: (detail.errors ?? {}) as FieldErrors,
      };
    }
  }
  return { message: fallback, fields: {} };
}

export function TwinReportProblem({
  assetId,
  onSubmitted,
  onCancel,
}: {
  assetId: string;
  onSubmitted: (report: ProblemReport) => void;
  onCancel: () => void;
}) {
  const [options, setOptions] = useState<ProblemReportOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [problemType, setProblemType] = useState("");
  const [severity, setSeverity] = useState("");
  const [immediateAction, setImmediateAction] = useState("");
  const [description, setDescription] = useState("");

  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchProblemReportOptions()
      .then((o) => alive && setOptions(o))
      .catch(() => alive && setLoadError("Could not load the report options. Close this form and try again."));
    return () => {
      alive = false;
    };
  }, []);

  const minLen = options?.description_min_length ?? 10;
  const maxLen = options?.description_max_length ?? 1000;
  const descLen = description.trim().length;

  // Mirrors the server's checks; the server remains the authority.
  const errors: FieldErrors = useMemo(() => {
    const e: FieldErrors = {};
    if (!problemType) e.problem_type = "Select a problem type.";
    if (!severity) e.severity = "Select a severity.";
    if (!immediateAction) e.immediate_action = "Select the immediate action taken.";
    if (descLen < minLen) e.description = `Describe the problem in at least ${minLen} characters.`;
    else if (descLen > maxLen) e.description = `Description must be ${maxLen} characters or fewer.`;
    return e;
  }, [problemType, severity, immediateAction, descLen, minLen, maxLen]);

  const fieldError = (k: FieldKey) => (showErrors ? errors[k] : undefined) ?? serverErrors[k];
  const clearServer = (k: FieldKey) =>
    setServerErrors((p) => {
      if (!p[k]) return p;
      const n = { ...p };
      delete n[k];
      return n;
    });

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setShowErrors(true);
    setSubmitError(null);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      const report = await createProblemReport({
        asset_id: assetId,
        problem_type: problemType,
        severity,
        immediate_action: immediateAction,
        description: description.trim(),
      });
      onSubmitted(report);
    } catch (err) {
      const { message, fields } = parseApiError(err);
      setServerErrors(fields);
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const select = (
    key: FieldKey,
    label: string,
    value: string,
    set: (v: string) => void,
    choices: string[]
  ) => (
    <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => {
          set(e.target.value);
          clearServer(key);
        }}
        aria-invalid={!!fieldError(key)}
        className={`${INPUT} font-normal text-foreground ${fieldError(key) ? INVALID : ""}`}
      >
        <option value="">Select…</option>
        {choices.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {fieldError(key) && (
        <span role="alert" className="font-normal text-danger">
          {fieldError(key)}
        </span>
      )}
    </label>
  );

  return (
    <form onSubmit={submit} noValidate className="rounded-xl border border-danger/30 bg-danger/5 p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold">
          Report a problem for <span className="font-mono">{assetId}</span>
        </h3>
        <button type="button" onClick={onCancel} aria-label="Cancel report" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {loadError ? (
        <p role="alert" className="text-xs text-danger">
          {loadError}
        </p>
      ) : !options ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading options…
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {serverErrors.asset_id && (
            <p role="alert" className="text-xs text-danger">
              {serverErrors.asset_id}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {select("problem_type", "Problem type", problemType, setProblemType, options.problem_types)}
            {select("severity", "Severity", severity, setSeverity, options.severities)}
          </div>
          {select("immediate_action", "Immediate action taken", immediateAction, setImmediateAction, options.immediate_actions)}

          <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
            Description
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                clearServer("description");
              }}
              rows={4}
              aria-invalid={!!fieldError("description") || descLen > maxLen}
              placeholder="Symptoms, what was observed, where…"
              className={`${INPUT} resize-y font-normal text-foreground ${fieldError("description") ? INVALID : ""}`}
            />
            <span className="flex justify-between font-normal">
              <span role={fieldError("description") ? "alert" : undefined} className="text-danger">
                {fieldError("description")}
              </span>
              <span className={descLen > maxLen ? "text-danger" : ""}>
                {descLen} / {maxLen}
              </span>
            </span>
          </label>

          {submitError && (
            <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 p-2 text-xs text-danger">
              {submitError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Submit report
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
