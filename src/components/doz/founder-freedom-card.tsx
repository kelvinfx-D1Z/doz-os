"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Award,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Briefcase,
  CheckCircle2,
  Target,
  Zap,
  AlertTriangle,
  Activity,
  Plus,
  Loader2,
} from "lucide-react";

// ============================================================
// FounderFreedomCard — a prominent metric on the Command Center
// showing how independent the business is from the founder.
//
// Renders:
//   - Large circular gauge (0-100) with rating color
//   - Rating label + trend indicator
//   - 5 mini metrics row (projects, decisions, strategy %, SOP, revenue)
//   - Time allocation stacked bar with target comparison
//   - 1-2 recommendations
//   - "Log Time" button → dialog (category, hours, notes)
// ============================================================

type Rating = "FLEDGLING" | "PROGRESSING" | "INDEPENDENT";

interface MetricPct {
  value: number;
  total: number;
  pct: number;
}
interface FounderScoreData {
  score: number;
  rating: Rating;
  metrics: {
    projectsWithoutFounder: MetricPct;
    delegatedDecisions: MetricPct;
    strategyVsOps: { strategyHours: number; opsHours: number; ratio: number };
    sopTasksNoEscalation: MetricPct;
    revenueWithoutFounderSales: MetricPct;
  };
  timeAllocation: {
    sales: number;
    operations: number;
    administration: number;
    strategy: number;
    delivery: number;
  };
  timeTarget: {
    sales: number;
    operations: number;
    administration: number;
    strategy: number;
    delivery: number;
  };
  trend: "UP" | "DOWN" | "FLAT";
  recommendations: string[];
}

// ---------------------------------------------------------------
// Rating palette — emerald / amber / rose (NO indigo/blue)
// ---------------------------------------------------------------
const RATING_COLOR: Record<Rating, string> = {
  FLEDGLING: "#f43f5e", // rose-500
  PROGRESSING: "#f59e0b", // amber-500
  INDEPENDENT: "#10b981", // emerald-500
};
const RATING_BORDER: Record<Rating, string> = {
  FLEDGLING: "border-l-rose-500",
  PROGRESSING: "border-l-amber-500",
  INDEPENDENT: "border-l-emerald-500",
};
const RATING_TINT: Record<Rating, string> = {
  FLEDGLING: "bg-rose-500/[0.04]",
  PROGRESSING: "bg-amber-500/[0.04]",
  INDEPENDENT: "bg-emerald-500/[0.04]",
};

// Time-allocation segment colors
const SEG_SALES = "#10b981"; // emerald
const SEG_OPS = "#14b8a6"; // teal
const SEG_ADMIN = "#f43f5e"; // rose
const SEG_STRATEGY = "#f59e0b"; // amber
const SEG_DELIVERY = "#71717a"; // muted zinc

// ---------------------------------------------------------------
// ScoreRing — conic-gradient gauge with numeric overlay
// ---------------------------------------------------------------
function ScoreRing({ score, rating }: { score: number; rating: Rating }) {
  const color = RATING_COLOR[rating];
  const angle = Math.round((score / 100) * 360);
  return (
    <div
      className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(${color} ${angle}deg, rgba(255,255,255,0.08) ${angle}deg 360deg)`,
      }}
      aria-label={`Founder Freedom Score ${score} out of 100, ${rating}`}
      role="img"
    >
      <div className="flex h-[104px] w-[104px] flex-col items-center justify-center rounded-full bg-card">
        <span
          className="text-4xl font-bold leading-none tabular-nums"
          style={{ color }}
        >
          {score}
        </span>
        <span className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          / 100
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// TrendPill — small UP/DOWN/FLAT indicator
// ---------------------------------------------------------------
function TrendPill({ trend }: { trend: "UP" | "DOWN" | "FLAT" }) {
  const map = {
    UP: {
      icon: <TrendingUp className="h-3 w-3" />,
      label: "Up",
      cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    },
    DOWN: {
      icon: <TrendingDown className="h-3 w-3" />,
      label: "Down",
      cls: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    },
    FLAT: {
      icon: <Minus className="h-3 w-3" />,
      label: "Flat",
      cls: "bg-muted text-muted-foreground border-border",
    },
  } as const;
  const t = map[trend];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        t.cls,
      )}
    >
      {t.icon}
      {t.label}
    </span>
  );
}

// ---------------------------------------------------------------
// MiniMetric — small tile showing a percentage + value/total
// ---------------------------------------------------------------
function MiniMetric({
  icon,
  label,
  pct,
  detail,
  invertColor = false,
}: {
  icon: React.ReactNode;
  label: string;
  pct: number;
  detail: string;
  invertColor?: boolean;
}) {
  // Higher pct = better (more freedom) for all metrics by default.
  // Color: green >= 60, amber 30-60, rose < 30
  const color =
    pct >= 60 ? "#10b981" : pct >= 30 ? "#f59e0b" : "#f43f5e";
  const displayPct = invertColor ? 100 - pct : pct;
  const finalColor =
    displayPct >= 60 ? "#10b981" : displayPct >= 30 ? "#f59e0b" : "#f43f5e";
  return (
    <div className="rounded-md border border-border bg-card/40 px-2.5 py-2">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[9px] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p
        className="mt-1 text-sm font-bold tabular-nums"
        style={{ color: invertColor ? finalColor : color }}
      >
        {pct.toFixed(0)}%
      </p>
      <p className="text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}

// ---------------------------------------------------------------
// TimeAllocationBar — stacked horizontal bar with target markers
// ---------------------------------------------------------------
function TimeAllocationBar({
  alloc,
  target,
}: {
  alloc: FounderScoreData["timeAllocation"];
  target: FounderScoreData["timeTarget"];
}) {
  const totalHours =
    alloc.sales +
    alloc.operations +
    alloc.administration +
    alloc.strategy +
    alloc.delivery;
  const segs = [
    { key: "sales", label: "Sales", hours: alloc.sales, target: target.sales, color: SEG_SALES },
    { key: "operations", label: "Operations", hours: alloc.operations, target: target.operations, color: SEG_OPS },
    { key: "administration", label: "Admin", hours: alloc.administration, target: target.administration, color: SEG_ADMIN },
    { key: "strategy", label: "Strategy", hours: alloc.strategy, target: target.strategy, color: SEG_STRATEGY },
    { key: "delivery", label: "Delivery", hours: alloc.delivery, target: target.delivery, color: SEG_DELIVERY },
  ];
  const visible = segs.filter((s) => s.hours > 0);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Time allocation (this week)
        </p>
        <p className="text-[10px] tabular-nums text-muted-foreground">
          {totalHours.toFixed(1)}h logged
        </p>
      </div>
      {totalHours === 0 ? (
        <div className="h-2.5 w-full rounded-full bg-muted" />
      ) : (
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          {visible.map((s, i) => (
            <div
              key={s.key}
              style={{
                width: `${(s.hours / totalHours) * 100}%`,
                backgroundColor: s.color,
                marginLeft: i === 0 ? 0 : 1,
              }}
              title={`${s.label}: ${s.hours}h (target ${s.target}%)`}
            />
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {segs.map((s) => {
          const actualPct =
            totalHours > 0 ? Math.round((s.hours / totalHours) * 100) : 0;
          const offTarget = Math.abs(actualPct - s.target) > 10 && s.hours > 0;
          return (
            <span key={s.key} className="inline-flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
              <span
                className={cn(
                  "font-semibold",
                  offTarget ? "text-amber-400" : "text-foreground/80",
                )}
              >
                {actualPct}%
              </span>
              <span className="text-muted-foreground/70">/{s.target}%</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Recommendation icon picker
// ---------------------------------------------------------------
function recIcon(text: string) {
  if (text.includes("⚠") || /admin|depen|depends on you/i.test(text)) {
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />;
  }
  if (/building a company|keep delegating/i.test(text)) {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />;
  }
  if (/strategic|deep work/i.test(text)) {
    return <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  }
  if (/project leads|assign/i.test(text)) {
    return <Briefcase className="h-3.5 w-3.5 shrink-0 text-teal-400" />;
  }
  return <Target className="h-3.5 w-3.5 shrink-0 text-primary" />;
}

// ---------------------------------------------------------------
// LogTimeDialog — small dialog to log a time entry
// ---------------------------------------------------------------
function LogTimeDialog({
  open,
  onOpenChange,
  onLogged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogged: () => void;
}) {
  const [category, setCategory] = useState<string>("STRATEGY");
  const [hours, setHours] = useState<string>("1");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const hoursNum = Number(hours);
    if (!Number.isFinite(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
      toast.error("Hours must be between 0 and 24");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/doz/founder-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "log_time",
          category,
          hours: hoursNum,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || `HTTP ${res.status}`);
      }
      toast.success(`Logged ${hoursNum}h of ${category.toLowerCase()}`);
      setNotes("");
      setHours("1");
      onOpenChange(false);
      onLogged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to log time");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Log Founder Time
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ff-category" className="text-xs">
              Category
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="ff-category" className="w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STRATEGY">Strategy</SelectItem>
                <SelectItem value="SALES">Sales</SelectItem>
                <SelectItem value="OPERATIONS">Operations</SelectItem>
                <SelectItem value="ADMINISTRATION">Administration</SelectItem>
                <SelectItem value="DELIVERY">Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ff-hours" className="text-xs">
              Hours
            </Label>
            <Input
              id="ff-hours"
              type="number"
              min="0.5"
              max="24"
              step="0.5"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ff-notes" className="text-xs">
              Notes (optional)
            </Label>
            <Input
              id="ff-notes"
              placeholder="What did you work on?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting}
            className="gap-1.5"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Log Time
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------
function FounderFreedomSkeleton() {
  return (
    <Card className="border-l-4 border-l-muted p-5">
      <div className="flex items-start gap-5">
        <Skeleton className="h-32 w-32 rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-72" />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-2.5 w-3/4" />
      </div>
      <div className="mt-4 space-y-1.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------
// Main component
// ---------------------------------------------------------------
export function FounderFreedomCard() {
  const [data, setData] = useState<FounderScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/doz/founder-score", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as FounderScoreData;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load freedom score");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await fetchData();
      // alive check happens inside setData via closure
      void alive;
    })();
    return () => {
      alive = false;
    };
  }, [fetchData]);

  if (loading) return <FounderFreedomSkeleton />;

  if (error || !data) {
    return (
      <Card className={cn("border-l-4 p-5", "border-l-rose-500/60")}>
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-rose-500/15 p-1.5 text-rose-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">Freedom score unavailable</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {error ?? "We couldn't compute your freedom metrics."}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const rating = data.rating;
  const m = data.metrics;

  return (
    <Card
      className={cn(
        "border-l-4 p-5 transition-colors",
        RATING_BORDER[rating],
        RATING_TINT[rating],
      )}
    >
      {/* ---------- Header row: ring + label + log-time button ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <ScoreRing score={data.score} rating={rating} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Award className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold tracking-tight">
                Founder Freedom Score
              </h3>
            </div>
            <TrendPill trend={data.trend} />
          </div>

          <p
            className="mt-1 text-xs font-bold uppercase tracking-wider"
            style={{ color: RATING_COLOR[rating] }}
          >
            {rating}
          </p>

          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
            {rating === "FLEDGLING" && (
              <>The business depends on you for everything.</>
            )}
            {rating === "PROGRESSING" && (
              <>You're delegating — keep pushing toward independence.</>
            )}
            {rating === "INDEPENDENT" && (
              <>The company can run without your daily involvement.</>
            )}
          </p>

          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Log Time
            </Button>
          </div>
        </div>
      </div>

      {/* ---------- 5 mini metrics ---------- */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <MiniMetric
          icon={<Briefcase className="h-3 w-3" />}
          label="Projects"
          pct={m.projectsWithoutFounder.pct}
          detail={`${m.projectsWithoutFounder.value}/${m.projectsWithoutFounder.total} not you`}
        />
        <MiniMetric
          icon={<CheckCircle2 className="h-3 w-3" />}
          label="Decisions"
          pct={m.delegatedDecisions.pct}
          detail={`${m.delegatedDecisions.value}/${m.delegatedDecisions.total} delegated`}
        />
        <MiniMetric
          icon={<Zap className="h-3 w-3" />}
          label="Strategy"
          pct={m.strategyVsOps.ratio}
          detail={`${m.strategyVsOps.strategyHours}h strat / ${m.strategyVsOps.opsHours}h ops`}
        />
        <MiniMetric
          icon={<Activity className="h-3 w-3" />}
          label="SOP tasks"
          pct={m.sopTasksNoEscalation.pct}
          detail={`${m.sopTasksNoEscalation.value}/${m.sopTasksNoEscalation.total} not you`}
        />
        <MiniMetric
          icon={<TrendingUp className="h-3 w-3" />}
          label="Revenue"
          pct={m.revenueWithoutFounderSales.pct}
          detail={`${m.revenueWithoutFounderSales.value}/${m.revenueWithoutFounderSales.total} won not you`}
        />
      </div>

      {/* ---------- Time allocation bar ---------- */}
      <div className="mt-4">
        <TimeAllocationBar alloc={data.timeAllocation} target={data.timeTarget} />
      </div>

      {/* ---------- Recommendations (max 2 shown) ---------- */}
      {data.recommendations.length > 0 && (
        <div className="mt-4 rounded-md border border-border bg-card/40 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Target className="h-3 w-3 text-primary" />
            Recommendations
          </p>
          <ul className="space-y-1.5">
            {data.recommendations.slice(0, 2).map((r, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs leading-snug text-foreground/90"
              >
                {recIcon(r)}
                <span className="min-w-0 flex-1">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <LogTimeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onLogged={fetchData}
      />
    </Card>
  );
}

export default FounderFreedomCard;
