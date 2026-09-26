export const SEVERITY_STYLE: Record<string, string> = {
  Critical: "bg-danger/15 text-danger border-danger/30",
  High: "bg-warning/15 text-warning border-warning/30",
  Medium: "bg-info/15 text-info border-info/30",
  Low: "bg-success/15 text-success border-success/30",
};

export const ASSET_STATUS_STYLE: Record<string, string> = {
  Normal: "bg-success/15 text-success border-success/30",
  Degraded: "bg-warning/15 text-warning border-warning/30",
  Critical: "bg-danger/15 text-danger border-danger/30",
};

export const STATUS_STYLE: Record<string, string> = {
  Pending: "bg-warning/15 text-warning border-warning/30",
  Scheduled: "bg-info/15 text-info border-info/30",
  "In Progress": "bg-violet-500/15 text-violet-400 border-violet-500/30",
  Completed: "bg-success/15 text-success border-success/30",
};

// Additive: used by the SMMS Reports page for Problem Report rows. Kept
// separate from the report-problem page's own local style map so that
// page is untouched.
export const PROBLEM_REPORT_STATUS_STYLE: Record<string, string> = {
  Open: "bg-info/15 text-info border-info/30",
  "In Review": "bg-violet-500/15 text-violet-400 border-violet-500/30",
  Resolved: "bg-success/15 text-success border-success/30",
  Closed: "bg-muted text-muted-foreground border-border",
};

export function Badge({ label, styleMap }: { label: string; styleMap: Record<string, string> }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
        styleMap[label] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      {label}
    </span>
  );
}
