"use client";
import { cn } from "@/lib/utils";
import { statusStyle } from "@/lib/format";
import { Card } from "@/components/ui/card";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        statusStyle(status),
        className
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    URGENT: "bg-red-500",
    HIGH: "bg-amber-500",
    MEDIUM: "bg-teal-500",
    LOW: "bg-zinc-500",
  };
  return <span className={cn("inline-block h-2 w-2 rounded-full", colors[priority] ?? "bg-zinc-500")} />;
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  trend,
  accent = "default",
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  trend?: { value: string; positive: boolean };
  accent?: "default" | "primary" | "warning" | "danger";
  onClick?: () => void;
}) {
  const accentRing = {
    default: "",
    primary: "ring-1 ring-primary/30",
    warning: "ring-1 ring-amber-500/30",
    danger: "ring-1 ring-red-500/30",
  }[accent];

  return (
    <Card
      onClick={onClick}
      className={cn(
        "relative overflow-hidden p-4 transition-all",
        accentRing,
        onClick && "cursor-pointer hover:border-primary/40 hover:bg-accent/30"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold tracking-tight">{value}</p>
          {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
          {trend && (
            <p className={cn("mt-1 text-xs font-medium", trend.positive ? "text-primary" : "text-destructive")}>
              {trend.positive ? "↑" : "↓"} {trend.value}
            </p>
          )}
        </div>
        {icon && <div className="ml-2 shrink-0 text-muted-foreground">{icon}</div>}
      </div>
    </Card>
  );
}

export function SectionHeader({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
      <div className="flex items-start gap-3">
        {icon && <div className="mt-0.5 text-primary">{icon}</div>}
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
      {icon && <div className="text-muted-foreground/50">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function MiniBar({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
