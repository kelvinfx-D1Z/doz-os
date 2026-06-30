"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatNGN } from "@/lib/format";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Minus,
} from "lucide-react";

// ============================================================
// KpiTargetCard — A reusable card showing every growth metric
// with: Current Value, Target, Forecast, Confidence Score,
// Required Weekly Pace. Designed for the Growth Dashboard,
// Command Center, and Financial Intelligence modules.
//
// Layout:
//   ┌─────────────────────────────────┐
//   │ Annual Revenue          AHEAD   │
//   │                                 │
//   │ ₦38.0M                          │
//   │ Target: ₦120M         31.7%     │
//   │ ████████░░░░░░░░░░░░░░░░░░░     │
//   │                                 │
//   │ Weekly pace: ₦2.3M needed       │
//   │ AI Forecast: On Track           │
//   │ Confidence: 82%                 │
//   │                                 │
//   │ Year 1: ₦120M  Year 3: ₦500M   │
//   └─────────────────────────────────┘
//
// Status colours (NO indigo/blue):
//   AHEAD    = emerald
//   ON_TRACK = teal
//   BEHIND   = amber
//   AT_RISK  = rose
// ============================================================

export type KpiStatus = "AHEAD" | "ON_TRACK" | "BEHIND" | "AT_RISK";
export type KpiTrend = "UP" | "DOWN" | "FLAT";

export interface KPI {
  id: string;
  name: string;
  category: string;
  current: number;
  target: number;
  yearOneTarget: number;
  yearThreeTarget: number;
  unit: string;
  weeklyPace: number;
  forecast: string;
  confidence: number;
  isKeyMetric: boolean;
  updatedAt?: string;
  progressPct: number;
  status: KpiStatus;
  displayCurrent: string;
  displayTarget: string;
  displayWeeklyPace: string | null;
  trend: KpiTrend;
  lowerIsBetter: boolean;
}

// ---------------------------------------------------------------
// Status → Tailwind class maps
// ---------------------------------------------------------------
const STATUS_BADGE: Record<KpiStatus, string> = {
  AHEAD: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
  ON_TRACK: "bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30",
  BEHIND: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
  AT_RISK: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
};

const STATUS_BAR: Record<KpiStatus, string> = {
  AHEAD: "bg-emerald-500",
  ON_TRACK: "bg-teal-500",
  BEHIND: "bg-amber-500",
  AT_RISK: "bg-rose-500",
};

const STATUS_BORDER: Record<KpiStatus, string> = {
  AHEAD: "border-l-emerald-500",
  ON_TRACK: "border-l-teal-500",
  BEHIND: "border-l-amber-500",
  AT_RISK: "border-l-rose-500",
};

function statusIcon(status: KpiStatus) {
  switch (status) {
    case "AHEAD":
      return <CheckCircle2 className="h-3 w-3" />;
    case "ON_TRACK":
      return <Target className="h-3 w-3" />;
    case "BEHIND":
      return <AlertTriangle className="h-3 w-3" />;
    case "AT_RISK":
      return <AlertTriangle className="h-3 w-3" />;
  }
}

function statusLabel(status: KpiStatus): string {
  switch (status) {
    case "AHEAD":
      return "Ahead";
    case "ON_TRACK":
      return "On Track";
    case "BEHIND":
      return "Behind";
    case "AT_RISK":
      return "At Risk";
  }
}

function forecastLabel(forecast: string, status: KpiStatus): string {
  const f = (forecast || "").toUpperCase();
  if (f === "AHEAD") return "Ahead of pace";
  if (f === "ON_TRACK") return "On Track";
  if (f === "BEHIND") return "Behind pace";
  if (f === "AT_RISK") return "At risk";
  // Fallback to status label
  return statusLabel(status);
}

function trendIcon(trend: KpiTrend) {
  if (trend === "UP") return <TrendingUp className="h-3 w-3 text-emerald-400" />;
  if (trend === "DOWN") return <TrendingDown className="h-3 w-3 text-rose-400" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

// ---------------------------------------------------------------
// Confidence colour: green >70, amber 40-70, rose <40
// ---------------------------------------------------------------
function confidenceColor(c: number): string {
  if (c >= 70) return "bg-emerald-500";
  if (c >= 40) return "bg-amber-500";
  return "bg-rose-500";
}
function confidenceText(c: number): string {
  if (c >= 70) return "text-emerald-400";
  if (c >= 40) return "text-amber-400";
  return "text-rose-400";
}

// ---------------------------------------------------------------
// Format Year 1 / Year 3 targets based on unit
// ---------------------------------------------------------------
function formatYear(value: number, unit: string): string {
  const u = (unit || "COUNT").toUpperCase();
  if (u === "NGN") return formatNGN(value, true);
  if (u === "PERCENT") return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
  if (u === "DAYS") return `${Math.round(value)}d`;
  return `${Math.round(value)}`;
}

// ---------------------------------------------------------------
// Main component
// ---------------------------------------------------------------
export function KpiTargetCard({
  kpi,
  compact = false,
  className,
}: {
  kpi: KPI;
  compact?: boolean;
  className?: string;
}) {
  const progressPct = Math.max(0, Math.min(100, kpi.progressPct));

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-l-4 p-4 transition-all hover:shadow-md",
        STATUS_BORDER[kpi.status],
        className,
      )}
    >
      {/* Header: name + status badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">
            {kpi.name}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {kpi.category}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 gap-1 border-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            STATUS_BADGE[kpi.status],
          )}
        >
          {statusIcon(kpi.status)}
          {kpi.status.replace("_", " ")}
        </Badge>
      </div>

      {/* Current value (large) */}
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xl font-bold tracking-tight">
            {kpi.displayCurrent}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Target: <span className="font-medium text-foreground/80">{kpi.displayTarget}</span>
            {kpi.lowerIsBetter && (
              <span className="ml-1 text-[10px] text-muted-foreground/70">(lower is better)</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <div className="flex items-center gap-1">
            {trendIcon(kpi.trend)}
            <span className="text-xs font-semibold tabular-nums">
              {progressPct.toFixed(progressPct % 1 === 0 ? 0 : 1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", STATUS_BAR[kpi.status])}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Weekly pace + forecast */}
      <div className="mt-3 grid grid-cols-1 gap-1.5 text-xs">
        {kpi.displayWeeklyPace && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Zap className="h-3 w-3 text-amber-400" />
            <span className="text-foreground/80">Weekly pace:</span>
            <span className="font-medium text-foreground">{kpi.displayWeeklyPace}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Target className="h-3 w-3 text-primary" />
          <span className="text-foreground/80">AI Forecast:</span>
          <span className="font-medium text-foreground">{forecastLabel(kpi.forecast, kpi.status)}</span>
        </div>
      </div>

      {/* Confidence bar (hidden in compact) */}
      {!compact && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="h-3 w-3" />
              Confidence
            </span>
            <span className={cn("font-semibold tabular-nums", confidenceText(kpi.confidence))}>
              {kpi.confidence}%
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", confidenceColor(kpi.confidence))}
              style={{ width: `${Math.min(100, Math.max(0, kpi.confidence))}%` }}
            />
          </div>
        </div>
      )}

      {/* Year 1 + Year 3 targets (hidden in compact) */}
      {!compact && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
          <div>
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3 w-3" />
              Year 1
            </p>
            <p className="mt-0.5 text-sm font-semibold">{formatYear(kpi.yearOneTarget, kpi.unit)}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3 w-3" />
              Year 3
            </p>
            <p className="mt-0.5 text-sm font-semibold">{formatYear(kpi.yearThreeTarget, kpi.unit)}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------
// Skeleton — for loading state in lists/grids
// ---------------------------------------------------------------
export function KpiTargetCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <Card className="border-l-4 border-l-muted p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="mt-3 space-y-1.5">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="mt-2 h-2 w-full rounded-full" />
      <div className="mt-3 space-y-1.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      {!compact && (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      )}
    </Card>
  );
}

export default KpiTargetCard;
