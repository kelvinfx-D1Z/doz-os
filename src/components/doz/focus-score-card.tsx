"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Target,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Zap,
  Clock,
  Link2,
  ListTodo,
} from "lucide-react";

// ============================================================
// FocusScoreCard — visual summary of whether daily tasks
// actually move strategic goals forward.
//
// Renders a conic-gradient score ring (0-100), an alignment
// breakdown bar (strategic/operational/admin/distraction),
// a key-stats row, and 2-3 prioritised recommendations.
// ============================================================

type Rating = "ALIGNED" | "MODERATE" | "SCATTERED";

interface FocusData {
  score: number;
  rating: Rating;
  breakdown: {
    strategicTasks: number;
    operationalTasks: number;
    adminTasks: number;
    distractionTasks: number;
    totalActive: number;
  };
  alignment: {
    linkedToGoal: number;
    unlinked: number;
    alignmentPct: number;
  };
  weeklyGoalProgress: number;
  weeklyGoal: {
    id: string;
    title: string;
    progress: number;
    dueDate: string | null;
  } | null;
  dailyTaskCompletion: { done: number; total: number; pct: number };
  distractionsCount: number;
  recommendations: string[];
}

// ---------------------------------------------------------------
// Rating palette — emerald / amber / rose (NO indigo/blue)
// ---------------------------------------------------------------
const RATING_RING: Record<Rating, string> = {
  ALIGNED: "#10b981", // emerald-500
  MODERATE: "#f59e0b", // amber-500
  SCATTERED: "#f43f5e", // rose-500
};
const RATING_BORDER: Record<Rating, string> = {
  ALIGNED: "border-l-emerald-500",
  MODERATE: "border-l-amber-500",
  SCATTERED: "border-l-rose-500",
};
const RATING_TINT: Record<Rating, string> = {
  ALIGNED: "bg-emerald-500/[0.04]",
  MODERATE: "bg-amber-500/[0.04]",
  SCATTERED: "bg-rose-500/[0.04]",
};
const RATING_LABEL: Record<Rating, string> = {
  ALIGNED: "Aligned",
  MODERATE: "Moderate",
  SCATTERED: "Scattered",
};

// Category colors for the breakdown bar
const SEG_STRATEGIC = "#10b981"; // emerald
const SEG_OPERATIONAL = "#14b8a6"; // teal
const SEG_ADMIN = "#71717a"; // zinc-500 (muted)
const SEG_DISTRACTION = "#f59e0b"; // amber

// ---------------------------------------------------------------
// Recommendation icon picker — warnings get AlertTriangle,
// positives get CheckCircle2, generic suggestions get Target.
// ---------------------------------------------------------------
function recIcon(text: string) {
  if (text.includes("⚠") || /distraction|firefighting|less than|accelerate|aren't linked/i.test(text)) {
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />;
  }
  if (/focused and aligned|keep it up/i.test(text)) {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />;
  }
  if (/plan your day|no active/i.test(text)) {
    return <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  }
  return <Target className="h-3.5 w-3.5 shrink-0 text-primary" />;
}

// ---------------------------------------------------------------
// Score ring — conic-gradient + numeric overlay
// ---------------------------------------------------------------
function ScoreRing({ score, rating }: { score: number; rating: Rating }) {
  const color = RATING_RING[rating];
  // Conic gradient: filled arc = score% of 360deg, rest = muted bg
  const angle = Math.round((score / 100) * 360);
  return (
    <div
      className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(${color} ${angle}deg, rgba(255,255,255,0.08) ${angle}deg 360deg)`,
      }}
      aria-label={`Focus score ${score} out of 100, ${RATING_LABEL[rating]}`}
      role="img"
    >
      <div className="flex h-[78px] w-[78px] flex-col items-center justify-center rounded-full bg-card">
        <span
          className="text-2xl font-bold leading-none tabular-nums"
          style={{ color }}
        >
          {score}
        </span>
        <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
          / 100
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Breakdown bar — horizontal stacked segments
// ---------------------------------------------------------------
function BreakdownBar({ b }: { b: FocusData["breakdown"] }) {
  const total = Math.max(1, b.totalActive);
  const segs = [
    { key: "strategic", count: b.strategicTasks, color: SEG_STRATEGIC, label: "Strategic" },
    { key: "operational", count: b.operationalTasks, color: SEG_OPERATIONAL, label: "Operational" },
    { key: "admin", count: b.adminTasks, color: SEG_ADMIN, label: "Admin" },
    { key: "distraction", count: b.distractionTasks, color: SEG_DISTRACTION, label: "Distraction" },
  ];
  const visible = segs.filter((s) => s.count > 0);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Task mix
        </p>
        <p className="text-[10px] tabular-nums text-muted-foreground">
          {b.totalActive} active
        </p>
      </div>
      {b.totalActive === 0 ? (
        <div className="h-2 w-full rounded-full bg-muted" />
      ) : (
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {visible.map((s, i) => (
            <div
              key={s.key}
              style={{
                width: `${(s.count / total) * 100}%`,
                backgroundColor: s.color,
                // small gap between segments (except first)
                marginLeft: i === 0 ? 0 : 1,
              }}
              title={`${s.label}: ${s.count}`}
            />
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {segs.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
            <span className="font-semibold text-foreground/80">{s.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Stat tile — compact one-liner
// ---------------------------------------------------------------
function StatTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card/40 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[9px] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
      {hint && (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------
function FocusSkeleton() {
  return (
    <Card className="border-l-4 border-l-muted p-4">
      <div className="flex items-start gap-4">
        <Skeleton className="h-24 w-24 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-3/4" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
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
export function FocusScoreCard() {
  const [data, setData] = useState<FocusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/doz/focus", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as FocusData;
        if (alive) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "Failed to load focus score");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <FocusSkeleton />;

  if (error || !data) {
    return (
      <Card className={cn("border-l-4 p-4", "border-l-rose-500/60")}>
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-rose-500/15 p-1.5 text-rose-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">Focus score unavailable</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {error ?? "We couldn't compute your focus metrics."}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const rating = data.rating;
  const d = data.dailyTaskCompletion;

  return (
    <Card
      className={cn(
        "border-l-4 p-4 transition-colors",
        RATING_BORDER[rating],
        RATING_TINT[rating],
      )}
    >
      {/* ---------- Header row: ring + label ---------- */}
      <div className="flex items-start gap-4">
        <ScoreRing score={data.score} rating={rating} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight">
              Focus &amp; Alignment
            </h3>
          </div>
          <p
            className="mt-0.5 text-xs font-semibold uppercase tracking-wider"
            style={{ color: RATING_RING[rating] }}
          >
            {RATING_LABEL[rating]}
          </p>
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
            {rating === "ALIGNED" && (
              <>
                Today&apos;s tasks are connecting to your strategic goals.
              </>
            )}
            {rating === "MODERATE" && (
              <>
                Some work is aligned, but there&apos;s room to tighten focus.
              </>
            )}
            {rating === "SCATTERED" && (
              <>
                Tasks aren&apos;t clearly tied to goals — refocus before the
                day slips.
              </>
            )}
          </p>
        </div>
      </div>

      {/* ---------- Breakdown bar ---------- */}
      <div className="mt-4">
        <BreakdownBar b={data.breakdown} />
      </div>

      {/* ---------- Key stats row ---------- */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          icon={<Link2 className="h-3 w-3" />}
          label="Linked"
          value={`${data.alignment.linkedToGoal}/${data.breakdown.totalActive}`}
          hint={`${data.alignment.alignmentPct}% aligned`}
        />
        <StatTile
          icon={<AlertTriangle className="h-3 w-3" />}
          label="Distractions"
          value={`${data.distractionsCount}`}
          hint={
            data.distractionsCount > 0 ? "Batch & defer" : "All clear"
          }
        />
        <StatTile
          icon={<TrendingUp className="h-3 w-3" />}
          label="Weekly goal"
          value={`${data.weeklyGoalProgress}%`}
          hint={
            data.weeklyGoal
              ? data.weeklyGoal.title.slice(0, 28) +
                (data.weeklyGoal.title.length > 28 ? "…" : "")
              : "No weekly goal"
          }
        />
        <StatTile
          icon={<ListTodo className="h-3 w-3" />}
          label="Today"
          value={`${d.done}/${d.total}`}
          hint={`${d.pct}% complete`}
        />
      </div>

      {/* ---------- Recommendations ---------- */}
      {data.recommendations.length > 0 && (
        <div className="mt-4 rounded-md border border-border bg-card/40 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Target className="h-3 w-3 text-primary" />
            Recommendations
          </p>
          <ul className="space-y-1.5">
            {data.recommendations.map((r, i) => (
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
    </Card>
  );
}

export default FocusScoreCard;
