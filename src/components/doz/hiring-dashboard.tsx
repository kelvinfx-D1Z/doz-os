"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  StatCard,
  SectionHeader,
  EmptyState,
} from "@/components/doz/ui-primitives";
import { formatNGN, formatDate, relativeTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Users,
  UserPlus,
  TrendingUp,
  Briefcase,
  CheckCircle2,
  Target,
  Clock,
  Zap,
  Award,
  Activity,
  AlertTriangle,
  Loader2,
  User,
  UserCog,
  GraduationCap,
  ChevronRight,
} from "lucide-react";

// ============================================================
// HiringDashboard — 6-stage hiring plan + current team
//
// Visualises the planned trajectory from founder-dependent to a
// self-sustaining team. Founder-only writes (PATCH status).
// ============================================================

type MemberType = "FOUNDER" | "STAFF" | "INTERN" | "FREELANCER";
type HiringStatus =
  | "FORECASTED"
  | "OPEN"
  | "INTERVIEWING"
  | "OFFERED"
  | "HIRED"
  | "ONBOARDED";

interface TeamMember {
  id: string;
  name: string;
  role: MemberType;
  title: string | null;
  capacity: number;
  isActive: boolean;
  type: MemberType;
}
interface HiringStage {
  id: string;
  stage: number;
  role: string;
  reason: string;
  successMetric: string;
  status: HiringStatus;
  salaryBudget: number | null;
  targetDate: string | null;
  hiredName: string | null;
  hiredAt: string | null;
  notes: string | null;
  isReady: boolean;
  readinessChecks: {
    revenueSupports: boolean;
    utilizationHigh: boolean;
  };
}
interface HiringData {
  currentTeam: TeamMember[];
  hiringPlan: HiringStage[];
  stats: {
    totalTeam: number;
    openPositions: number;
    forecastedPositions: number;
    monthlySalaryBudget: number;
    avgTimeToHire: number;
  };
  teamUtilization: number;
}

// ---------------------------------------------------------------
// Status palette — emerald/amber/rose/teal/muted (NO indigo/blue)
// ---------------------------------------------------------------
const STATUS_BADGE: Record<
  HiringStatus,
  { label: string; cls: string; pulse?: boolean }
> = {
  FORECASTED: {
    label: "Forecasted",
    cls: "bg-muted text-muted-foreground border border-border",
  },
  OPEN: {
    label: "Open",
    cls: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    pulse: true,
  },
  INTERVIEWING: {
    label: "Interviewing",
    cls: "bg-teal-500/15 text-teal-300 border border-teal-500/30",
  },
  OFFERED: {
    label: "Offered",
    cls: "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30",
  },
  HIRED: {
    label: "Hired",
    cls: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  },
  ONBOARDED: {
    label: "Onboarded",
    cls: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
  },
};

// Statuses selectable in the dropdown
const STATUS_ORDER: HiringStatus[] = [
  "FORECASTED",
  "OPEN",
  "INTERVIEWING",
  "OFFERED",
  "HIRED",
  "ONBOARDED",
];

const TYPE_ICON: Record<MemberType, React.ReactNode> = {
  FOUNDER: <UserCog className="h-3 w-3" />,
  STAFF: <Users className="h-3 w-3" />,
  INTERN: <GraduationCap className="h-3 w-3" />,
  FREELANCER: <Briefcase className="h-3 w-3" />,
};
const TYPE_BADGE: Record<MemberType, string> = {
  FOUNDER: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  STAFF: "bg-teal-500/15 text-teal-300 border border-teal-500/30",
  INTERN: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  FREELANCER: "bg-violet-500/15 text-violet-300 border border-violet-500/30",
};

// ---------------------------------------------------------------
// HiringStageCard — single stage in the pipeline
// ---------------------------------------------------------------
function HiringStageCard({
  stage,
  isLast,
  onUpdateStatus,
  updating,
}: {
  stage: HiringStage;
  isLast: boolean;
  onUpdateStatus: (stageId: string, status: HiringStatus) => void;
  updating: boolean;
}) {
  const sb = STATUS_BADGE[stage.status];
  const isReady = stage.isReady;
  const isHired = stage.status === "HIRED" || stage.status === "ONBOARDED";
  const isOpen = stage.status === "OPEN";

  return (
    <div className="relative flex gap-3">
      {/* Stage number + connector */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold tabular-nums",
            isHired
              ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
              : isOpen
                ? "border-amber-500 bg-amber-500/15 text-amber-300"
                : "border-border bg-card text-muted-foreground",
          )}
        >
          {isHired ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            stage.stage
          )}
        </div>
        {!isLast && (
          <div className="mt-1 w-px flex-1 bg-border" style={{ minHeight: 24 }} />
        )}
      </div>

      {/* Stage card */}
      <Card className="mb-3 flex-1 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold tracking-tight">{stage.role}</h4>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  sb.cls,
                  sb.pulse && "animate-pulse",
                )}
              >
                {sb.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{stage.reason}</p>
          </div>
          <div className="text-right">
            {stage.salaryBudget ? (
              <p className="text-sm font-semibold tabular-nums text-emerald-300">
                {formatNGN(stage.salaryBudget, true)}
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                  /mo
                </span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Budget TBD</p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Target: {stage.targetDate ? formatDate(stage.targetDate) : "—"}
            </p>
          </div>
        </div>

        {/* Success metric */}
        <div className="mt-3 flex items-start gap-1.5 rounded-md border border-border bg-card/40 p-2">
          <Target className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Success metric
            </p>
            <p className="text-xs text-foreground/90">{stage.successMetric}</p>
          </div>
        </div>

        {/* Hired info OR readiness checks */}
        {isHired ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
              <Award className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-xs font-semibold">
                {stage.hiredName ?? "Hired"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {stage.hiredAt ? `Joined ${formatDate(stage.hiredAt)}` : ""}
              </p>
            </div>
          </div>
        ) : isOpen ? (
          <div className="mt-3 space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
              <Zap className="h-3 w-3" />
              Is it time? {isReady ? "Yes — pull the trigger" : "Not yet"}
            </p>
            <div className="space-y-1 text-[11px]">
              <p className="flex items-center gap-1.5">
                {stage.readinessChecks.revenueSupports ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-amber-400" />
                )}
                <span className="text-muted-foreground">
                  Revenue {stage.readinessChecks.revenueSupports ? "supports" : "doesn't support"} the salary
                </span>
              </p>
              <p className="flex items-center gap-1.5">
                {stage.readinessChecks.utilizationHigh ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-amber-400" />
                )}
                <span className="text-muted-foreground">
                  Team utilization {stage.readinessChecks.utilizationHigh ? "is high" : "has headroom"}
                </span>
              </p>
            </div>
          </div>
        ) : null}

        {/* Notes (if any) */}
        {stage.notes && (
          <p className="mt-2 text-[11px] italic text-muted-foreground">
            “{stage.notes}”
          </p>
        )}

        {/* Status selector */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Update:
          </span>
          <Select
            value={stage.status}
            onValueChange={(v) => onUpdateStatus(stage.id, v as HiringStatus)}
            disabled={updating}
          >
            <SelectTrigger className="h-7 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {STATUS_BADGE[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {updating && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------
// TeamMemberRow — single team member
// ---------------------------------------------------------------
function TeamMemberRow({ m }: { m: TeamMember }) {
  const init = initials(m.name);
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2.5">
      <Avatar className="h-9 w-9">
        <AvatarFallback
          className={cn("text-[11px] font-bold", TYPE_BADGE[m.type])}
        >
          {init}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold truncate">{m.name}</p>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
              TYPE_BADGE[m.type],
            )}
          >
            {TYPE_ICON[m.type]}
            {m.type}
          </span>
          {!m.isActive && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Inactive
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{m.title ?? m.type.toLowerCase()}</p>
      </div>
      <div className="text-right">
        <p className="text-xs font-semibold tabular-nums">
          {m.capacity}h
          <span className="ml-0.5 font-normal text-muted-foreground">/wk</span>
        </p>
        <p className="text-[10px] text-muted-foreground">Capacity</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------
function HiringSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Main component
// ---------------------------------------------------------------
export function HiringDashboard() {
  const [data, setData] = useState<HiringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/doz/hiring", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as HiringData;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load hiring plan");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await fetchData();
      void alive;
    })();
    return () => {
      alive = false;
    };
  }, [fetchData]);

  const handleUpdateStatus = useCallback(
    async (stageId: string, status: HiringStatus) => {
      setUpdatingId(stageId);
      // Optimistically update the UI
      setData((prev) =>
        prev
          ? {
              ...prev,
              hiringPlan: prev.hiringPlan.map((h) =>
                h.id === stageId
                  ? {
                      ...h,
                      status,
                      hiredAt:
                        (status === "HIRED" || status === "ONBOARDED") && !h.hiredAt
                          ? new Date().toISOString()
                          : ["FORECASTED", "OPEN", "INTERVIEWING", "OFFERED"].includes(status)
                            ? null
                            : h.hiredAt,
                    }
                  : h,
              ),
            }
          : prev,
      );
      try {
        const res = await fetch("/api/doz/hiring", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stageId, status }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.detail || `HTTP ${res.status}`);
        }
        toast.success(`Stage updated to ${STATUS_BADGE[status].label}`);
        // Re-fetch to ensure server-truth (hiredAt etc.)
        await fetchData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update stage");
        // Revert
        await fetchData();
      } finally {
        setUpdatingId(null);
      }
    },
    [fetchData],
  );

  if (loading) return <HiringSkeleton />;

  if (error || !data) {
    return (
      <Card className="border-l-4 border-l-rose-500/60 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-rose-500/15 p-1.5 text-rose-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">Hiring plan unavailable</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {error ?? "We couldn't load the hiring plan."}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const s = data.stats;
  const utilHigh = data.teamUtilization >= 80;
  const utilWarn = data.teamUtilization >= 60 && data.teamUtilization < 80;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Hiring Plan"
        description="Hire based on bottlenecks, not headcount"
        icon={<UserPlus className="h-5 w-5" />}
      />

      {/* STATS ROW */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Total Team"
          value={s.totalTeam}
          sub="Active members"
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Open Positions"
          value={s.openPositions}
          sub="In pipeline now"
          icon={<UserPlus className="h-4 w-4" />}
          accent={s.openPositions > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Forecasted"
          value={s.forecastedPositions}
          sub="Planned future hires"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Monthly Salary"
          value={formatNGN(s.monthlySalaryBudget, true)}
          sub="Open + forecasted budget"
          icon={<Briefcase className="h-4 w-4" />}
          accent="primary"
        />
        <StatCard
          label="Team Utilization"
          value={`${data.teamUtilization}%`}
          sub={
            utilHigh
              ? "Above 80% — hire"
              : utilWarn
                ? "Headroom shrinking"
                : "Healthy headroom"
          }
          icon={<Activity className="h-4 w-4" />}
          accent={utilHigh ? "danger" : utilWarn ? "warning" : "primary"}
        />
      </div>

      {/* PHILOSOPHY NOTE */}
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span>
          The system recommends hiring only when: <strong>Revenue supports it</strong>,{" "}
          <strong>Team utilization exceeds 80%</strong>, or{" "}
          <strong>Growth targets require additional capacity</strong>.
        </span>
      </div>

      {/* 6-STAGE PIPELINE */}
      <div>
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
          <ChevronRight className="h-4 w-4 text-primary" />
          6-Stage Hiring Pipeline
        </h3>
        {data.hiringPlan.length === 0 ? (
          <EmptyState
            icon={<UserPlus className="h-8 w-8" />}
            title="No hiring stages defined"
            hint="The 6-stage hiring plan will appear here once seeded."
          />
        ) : (
          <div className="grid gap-x-6 gap-y-0 lg:grid-cols-2">
            <div>
              {data.hiringPlan
                .filter((h) => h.stage <= 3)
                .map((h, i, arr) => (
                  <HiringStageCard
                    key={h.id}
                    stage={h}
                    isLast={i === arr.length - 1}
                    onUpdateStatus={handleUpdateStatus}
                    updating={updatingId === h.id}
                  />
                ))}
            </div>
            <div>
              {data.hiringPlan
                .filter((h) => h.stage > 3)
                .map((h, i, arr) => (
                  <HiringStageCard
                    key={h.id}
                    stage={h}
                    isLast={i === arr.length - 1}
                    onUpdateStatus={handleUpdateStatus}
                    updating={updatingId === h.id}
                  />
                ))}
            </div>
          </div>
        )}
      </div>

      {/* CURRENT TEAM */}
      <div>
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
          <Users className="h-4 w-4 text-primary" />
          Current Team
          <Badge variant="outline" className="ml-1 text-[10px] text-muted-foreground">
            {data.currentTeam.length}
          </Badge>
        </h3>
        {data.currentTeam.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="No team members"
            hint="Add team members from the Team module."
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.currentTeam.map((m) => (
              <TeamMemberRow key={m.id} m={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default HiringDashboard;
