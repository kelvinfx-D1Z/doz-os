"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Target,
} from "lucide-react";
import type { KPI, KpiStatus, KpiTrend } from "@/components/doz/kpi-target-card";

// ============================================================
// KpiTargetRow — A compact horizontal KPI row for embedding
// in existing dashboards. Single line, with progress bar inline.
//
// Layout:
//   Annual Revenue  ₦38.0M / ₦120M  ████████░░░░ 31.7%  AHEAD
//
// Props:
//   kpi        — the KPI object (same shape as KpiTargetCard)
//   showPace?  — show weekly pace inline (default: false)
//   className? — extra classes
// ============================================================

const STATUS_DOT: Record<KpiStatus, string> = {
  AHEAD: "bg-emerald-500",
  ON_TRACK: "bg-teal-500",
  BEHIND: "bg-amber-500",
  AT_RISK: "bg-rose-500",
};

const STATUS_BAR: Record<KpiStatus, string> = {
  AHEAD: "bg-emerald-500",
  ON_TRACK: "bg-teal-500",
  BEHIND: "bg-amber-500",
  AT_RISK: "bg-rose-500",
};

const STATUS_TEXT: Record<KpiStatus, string> = {
  AHEAD: "text-emerald-400",
  ON_TRACK: "text-teal-400",
  BEHIND: "text-amber-400",
  AT_RISK: "text-rose-400",
};

const STATUS_LABEL: Record<KpiStatus, string> = {
  AHEAD: "Ahead",
  ON_TRACK: "On Track",
  BEHIND: "Behind",
  AT_RISK: "At Risk",
};

function TrendIcon({ trend }: { trend: KpiTrend }) {
  if (trend === "UP") return <TrendingUp className="h-3 w-3 text-emerald-400" />;
  if (trend === "DOWN") return <TrendingDown className="h-3 w-3 text-rose-400" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

function StatusGlyph({ status }: { status: KpiStatus }) {
  if (status === "AHEAD") return <CheckCircle2 className="h-3 w-3" />;
  if (status === "ON_TRACK") return <Target className="h-3 w-3" />;
  return <AlertTriangle className="h-3 w-3" />;
}

export function KpiTargetRow({
  kpi,
  showPace = false,
  className,
}: {
  kpi: KPI;
  showPace?: boolean;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, kpi.progressPct));
  const pctLabel = pct.toFixed(pct % 1 === 0 ? 0 : 1);

  return (
    <div
      className={cn(
        "flex h-12 items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2 transition-colors hover:bg-accent/30",
        className,
      )}
    >
      {/* Name (truncate, shrink-0 basis) */}
      <div className="flex min-w-0 w-32 shrink-0 items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[kpi.status])} />
        <span className="truncate text-xs font-medium" title={kpi.name}>
          {kpi.name}
        </span>
      </div>

      {/* Current / Target */}
      <div className="hidden shrink-0 items-baseline gap-1 text-xs tabular-nums sm:flex">
        <span className="font-semibold">{kpi.displayCurrent}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">{kpi.displayTarget}</span>
      </div>

      {/* Mobile: just current value */}
      <div className="shrink-0 text-xs font-semibold tabular-nums sm:hidden">
        {kpi.displayCurrent}
      </div>

      {/* Progress bar (flex-1, min width) */}
      <div className="flex min-w-[60px] flex-1 items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", STATUS_BAR[kpi.status])}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums">
          {pctLabel}%
        </span>
      </div>

      {/* Weekly pace (optional) */}
      {showPace && kpi.displayWeeklyPace && (
        <div className="hidden shrink-0 text-[11px] text-muted-foreground lg:block">
          {kpi.displayWeeklyPace}
        </div>
      )}

      {/* Trend icon */}
      <div className="hidden shrink-0 sm:block">
        <TrendIcon trend={kpi.trend} />
      </div>

      {/* Status pill */}
      <div
        className={cn(
          "flex w-20 shrink-0 items-center justify-end gap-1 text-[11px] font-semibold uppercase tracking-wide",
          STATUS_TEXT[kpi.status],
        )}
      >
        <StatusGlyph status={kpi.status} />
        <span className="truncate">{STATUS_LABEL[kpi.status]}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Skeleton — for loading states
// ---------------------------------------------------------------
export function KpiTargetRowSkeleton() {
  return (
    <div className="flex h-12 items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-2 flex-1 rounded-full" />
      <Skeleton className="h-3 w-10" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

export default KpiTargetRow;
