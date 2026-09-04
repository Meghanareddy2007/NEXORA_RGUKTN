import { LucideIcon } from "lucide-react";

const TONES = {
  primary: { bg: "bg-primary/15", text: "text-primary" },
  success: { bg: "bg-success/15", text: "text-success" },
  warning: { bg: "bg-warning/15", text: "text-warning" },
  danger: { bg: "bg-danger/15", text: "text-danger" },
  info: { bg: "bg-info/15", text: "text-info" },
  violet: { bg: "bg-violet-500/15", text: "text-violet-400" },
} as const;

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  tone?: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.bg} ${t.text}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div>
        <div className="text-2xl font-semibold leading-none">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1.5">{sub}</div>}
      </div>
    </div>
  );
}
