"use client";

// ============================================================
// Growth Dashboard (DOZ OS — Task GF2)
//
// The most important dashboard — answers "are we ahead or behind?"
// for every metric on the path to ₦500M. Cockpit-style layout:
//   1. Header with overall status badge
//   2. Company Health Score ring + 6 category mini-bars
//   3. Key Metrics row (6 strategic KPIs)
//   4. 8 functional sections in a responsive grid
//   5. Summary footer (ahead / on track / behind / at risk)
// ============================================================

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatCard,
  StatusBadge,
  EmptyState,
} from "@/components/doz/ui-primitives";
import { formatNGN, formatPct } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Megaphone,
  Heart,
  Settings,
  User,
  Users,
  Rocket,
  Target,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  Activity,
  Gauge,
} from "lucide-react";

// ============================================================
// Types — mirror the API contract
// ============================================================
type Status = "AHEAD" | "ON_TRACK" | "BEHIND" | "AT_RISK";
type Unit = "NGN" | "PERCENT" | "COUNT" | "DAYS" | "HOURS";

interface Metric {
  name: string;
  current: number;
  target: number;
  progressPct: number;
  status: Status;
  unit: Unit;
  displayCurrent: string;
  displayTarget: string;
  weeklyPace?: number;
  confidence?: number;
  lowerIsBetter?: boolean;
}

interface KPI extends Metric {
  id: string;
  category: string;
  yearOneTarget: number;
  yearThreeTarget: number;
  forecast: string;
  isKeyMetric: boolean;
}

interface Sections {
  revenue: Record<string, Metric>;
  bizdev: Record<string, Metric>;
  marketing: Record<string, Metric>;
  clientSuccess: Record<string, Metric>;
  operations: Record<string, Metric>;
  founder: Record<string, Metric>;
  people: Record<string, Metric>;
  eventco: Record<string, Metric>;
}

interface GrowthPayload {
  healthScore: {
    overall: number;
    sales: number;
    marketing: number;
    finance: number;
    operations: number;
    people: number;
    delivery: number;
  };
  kpis: KPI[];
  sections: Sections;
  summary: {
    ahead: number;
    onTrack: number;
    behind: number;
    atRisk: number;
  };
}

// ============================================================
// Status palette — emerald/teal/amber/rose (NO indigo/blue)
// ============================================================
const STATUS_COLOR: Record<Status, string> = {
  AHEAD: "#10b981", // emerald-500
  ON_TRACK: "#14b8a6", // teal-500
  BEHIND: "#f59e0b", // amber-500
  AT_RISK: "#f43f5e", // rose-500
};

const STATUS_BAR_BG: Record<Status, string> = {
  AHEAD: "bg-emerald-500",
  ON_TRACK: "bg-teal-500",
  BEHIND: "bg-amber-500",
  AT_RISK: "bg-rose-500",
};

const STATUS_DOT: Record<Status, string> = {
  AHEAD: "bg-emerald-500",
  ON_TRACK: "bg-teal-500",
  BEHIND: "bg-amber-500",
  AT_RISK: "bg-rose-500",
};

const STATUS_TILE: Record<Status, string> = {
  AHEAD: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  ON_TRACK: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  BEHIND: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  AT_RISK: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

// Health score ring color by score
function healthColor(score: number): string {
  if (score >= 75) return "#10b981"; // emerald
  if (score >= 50) return "#f59e0b"; // amber
  return "#f43f5e"; // rose
}

function healthLabel(score: number): { label: string; status: Status } {
  if (score >= 75) return { label: "AHEAD", status: "AHEAD" };
  if (score >= 50) return { label: "ON TRACK", status: "ON_TRACK" };
  if (score >= 40) return { label: "BEHIND", status: "BEHIND" };
  return { label: "AT RISK", status: "AT_RISK" };
}

// ============================================================
// Sub-components
// ============================================================

// ---------- Health Ring (conic-gradient) ----------
function HealthRing({ score, size = 180 }: { score: number; size?: number }) {
  const color = healthColor(score);
  const pct = Math.max(0, Math.min(100, score));
  const { label } = healthLabel(score);
  const stroke = size * 0.085;
  const inner = size - stroke * 2;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Company health score ${score} out of 100, ${label}`}
    >
      {/* Outer conic ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(from -90deg, ${color} 0% ${pct}%, rgba(255,255,255,0.06) ${pct}% 100%)`,
        }}
      />
      {/* Inner disc (creates the ring effect) */}
      <div
        className="absolute rounded-full bg-card flex flex-col items-center justify-center"
        style={{
          top: stroke,
          left: stroke,
          width: inner,
          height: inner,
        }}
      >
        <div className="flex items-baseline gap-0.5">
          <span
            className="text-4xl font-bold tabular-nums leading-none"
            style={{ color }}
          >
            {score}
          </span>
          <span className="text-sm font-semibold text-muted-foreground">
            /100
          </span>
        </div>
        <span
          className="mt-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

// ---------- Category mini-bar ----------
function CategoryBar({
  label,
  score,
  icon,
}: {
  label: string;
  score: number;
  icon: React.ReactNode;
}) {
  const color = healthColor(score);
  return (
    <div className="flex items-center gap-2">
      <div className="flex w-32 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        <span className="font-medium">{label}</span>
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(0, Math.min(100, score))}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  );
}

// ---------- Key Metric Card (cockpit tile) ----------
function KeyMetricCard({ kpi }: { kpi: KPI }) {
  const status = kpi.status;
  const paceStr =
    kpi.weeklyPace && kpi.weeklyPace > 0
      ? kpi.unit === "NGN"
        ? `${formatNGN(kpi.weeklyPace, true)}/wk needed`
        : kpi.unit === "PERCENT"
          ? `${kpi.weeklyPace.toFixed(1)}%/wk`
          : `${kpi.weeklyPace.toFixed(0)}/wk`
      : null;

  const confStr =
    kpi.confidence !== undefined && kpi.confidence > 0
      ? `${kpi.confidence}% confidence`
      : null;

  return (
    <Card className="flex flex-col gap-2 p-4">
      {/* Title + status badge */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {kpi.name}
        </p>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
            STATUS_TILE[status],
          )}
        >
          {status.replace(/_/g, " ")}
        </span>
      </div>

      {/* Current value (large) */}
      <div>
        <p className="text-2xl font-bold tracking-tight tabular-nums">
          {kpi.displayCurrent}
        </p>
        <p className="text-xs text-muted-foreground">
          Target:{" "}
          <span className="font-medium text-foreground/70">
            {kpi.displayTarget}
          </span>{" "}
          <span className="ml-1 font-semibold tabular-nums" style={{ color: STATUS_COLOR[status] }}>
            {kpi.progressPct}%
          </span>
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", STATUS_BAR_BG[status])}
          style={{ width: `${Math.max(2, Math.min(100, kpi.progressPct))}%` }}
        />
      </div>

      {/* Pace + confidence */}
      {(paceStr || confStr) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          {paceStr && (
            <span className="inline-flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {paceStr}
            </span>
          )}
          {confStr && (
            <span className="inline-flex items-center gap-1">
              <Gauge className="h-3 w-3" />
              {confStr}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- Section metric row (within a section card) ----------
function SectionMetricRow({ metric }: { metric: Metric }) {
  const status = metric.status;
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[status])} />
          <span className="truncate text-xs font-medium text-foreground/80">
            {metric.name}
          </span>
        </div>
        <div className="flex shrink-0 items-baseline gap-1.5 text-xs">
          <span className="font-semibold tabular-nums">{metric.displayCurrent}</span>
          <span className="text-muted-foreground">/ {metric.displayTarget}</span>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", STATUS_BAR_BG[status])}
            style={{ width: `${Math.max(2, Math.min(100, metric.progressPct))}%` }}
          />
        </div>
        <span
          className="w-9 text-right text-[10px] font-semibold tabular-nums"
          style={{ color: STATUS_COLOR[status] }}
        >
          {metric.progressPct}%
        </span>
      </div>
    </div>
  );
}

// ---------- Section Card ----------
function SectionCard({
  title,
  icon,
  metrics,
  accent,
}: {
  title: string;
  icon: React.ReactNode;
  metrics: Record<string, Metric>;
  accent: string; // tailwind text color class for the icon
}) {
  const list = Object.values(metrics);
  const ahead = list.filter((m) => m.status === "AHEAD").length;
  const total = list.length;
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-md bg-muted/60", accent)}>
            {icon}
          </span>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        </div>
        <Badge variant="outline" className="gap-1 border-border text-[10px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {ahead}/{total}
        </Badge>
      </div>
      <div className="divide-y divide-border/40">
        {list.map((m) => (
          <SectionMetricRow key={m.name} metric={m} />
        ))}
      </div>
    </Card>
  );
}

// ---------- Skeletons ----------
function HealthSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center">
        <Skeleton className="h-44 w-44 rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2 flex-1" />
              <Skeleton className="h-3 w-8" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function KeyMetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="space-y-3 p-4">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-1/2" />
        </Card>
      ))}
    </div>
  );
}

function SectionsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i} className="space-y-3 p-4">
          <Skeleton className="h-5 w-2/3" />
          {Array.from({ length: 5 }).map((_, j) => (
            <div key={j} className="space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================
export function GrowthDashboard() {
  const [data, setData] = useState<GrowthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/doz/growth", { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 401) {
            setError("Unauthorized — please sign in.");
            return;
          }
          throw new Error(`status_${res.status}`);
        }
        const json = (await res.json()) as GrowthPayload;
        if (alive) setData(json);
      } catch (e: any) {
        if (alive) {
          setError(e?.message ?? "Failed to load growth data");
          toast.error("Failed to load growth dashboard", {
            description: e?.message,
          });
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ---------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------
  if (loading) {
    return (
      <div className="space-y-6">
        <HeaderSkeleton />
        <HealthSkeleton />
        <KeyMetricsSkeleton />
        <SectionsSkeleton />
      </div>
    );
  }

  // ---------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------
  if (error || !data) {
    return (
      <div className="space-y-6">
        <Header
          overall={0}
          status="AT_RISK"
          error
        />
        <Card className="border-rose-500/40 bg-rose-500/[0.03] p-8">
          <EmptyState
            icon={<AlertTriangle className="h-8 w-8 text-rose-500" />}
            title="Growth dashboard unavailable"
            hint={error ?? "Try refreshing the page."}
          />
        </Card>
      </div>
    );
  }

  const { healthScore, kpis, sections, summary } = data;
  const overall = healthScore.overall;
  const { label: overallLabel, status: overallStatus } = healthLabel(overall);

  // Hand-picked 6 key metrics — spanning all strategic areas:
  // Revenue, Sales (Leads), Marketing (Referral Dep), Founder (Freedom), EventCo (Platform)
  const keyMetricNames = [
    "Annual Revenue",
    "Monthly Qualified Leads",
    "Proposal Win Rate",
    "Referral Dependency",
    "Founder Freedom Score",
    "EventCo Platform Progress",
  ];
  const keyMetrics = keyMetricNames
    .map((name) => kpis.find((k) => k.name === name))
    .filter((k): k is KPI => !!k);

  // Health score categories with labels + icons
  const healthCategories = [
    { key: "sales", label: "Sales", score: healthScore.sales, icon: <TrendingUp className="h-3 w-3" /> },
    { key: "marketing", label: "Marketing", score: healthScore.marketing, icon: <Megaphone className="h-3 w-3" /> },
    { key: "finance", label: "Finance", score: healthScore.finance, icon: <Wallet className="h-3 w-3" /> },
    { key: "operations", label: "Operations", score: healthScore.operations, icon: <Settings className="h-3 w-3" /> },
    { key: "people", label: "People", score: healthScore.people, icon: <Users className="h-3 w-3" /> },
    { key: "delivery", label: "Delivery", score: healthScore.delivery, icon: <Rocket className="h-3 w-3" /> },
  ];

  return (
    <div className="space-y-6">
      {/* ---------- Header ---------- */}
      <Header overall={overall} status={overallStatus} label={overallLabel} />

      {/* ---------- Company Health Score (full-width) ---------- */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold tracking-tight">
            Company Health Score
          </h2>
          <span className="text-xs text-muted-foreground">
            — average progress across all KPIs
          </span>
        </div>
        <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:gap-12">
          <HealthRing score={overall} size={180} />
          <div className="w-full flex-1 space-y-2.5">
            {healthCategories.map((c) => (
              <CategoryBar
                key={c.key}
                label={c.label}
                score={c.score}
                icon={c.icon}
              />
            ))}
          </div>
        </div>
      </Card>

      {/* ---------- Key Metrics Row ---------- */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold tracking-tight">
            Key Metrics
          </h2>
          <span className="text-xs text-muted-foreground">
            — the 6 numbers that define whether we win the year
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {keyMetrics.map((kpi) => (
            <KeyMetricCard key={kpi.id} kpi={kpi} />
          ))}
        </div>
      </div>

      {/* ---------- 8 Sections Grid ---------- */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold tracking-tight">
            Functional Sections
          </h2>
          <span className="text-xs text-muted-foreground">
            — every metric, every function, one glance
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SectionCard
            title="Revenue"
            icon={<Wallet className="h-4 w-4 text-emerald-400" />}
            accent="text-emerald-400"
            metrics={sections.revenue}
          />
          <SectionCard
            title="Business Development"
            icon={<TrendingUp className="h-4 w-4 text-teal-400" />}
            accent="text-teal-400"
            metrics={sections.bizdev}
          />
          <SectionCard
            title="Marketing"
            icon={<Megaphone className="h-4 w-4 text-amber-400" />}
            accent="text-amber-400"
            metrics={sections.marketing}
          />
          <SectionCard
            title="Client Success"
            icon={<Heart className="h-4 w-4 text-rose-400" />}
            accent="text-rose-400"
            metrics={sections.clientSuccess}
          />
          <SectionCard
            title="Operations"
            icon={<Settings className="h-4 w-4 text-teal-400" />}
            accent="text-teal-400"
            metrics={sections.operations}
          />
          <SectionCard
            title="Founder"
            icon={<User className="h-4 w-4 text-emerald-400" />}
            accent="text-emerald-400"
            metrics={sections.founder}
          />
          <SectionCard
            title="People"
            icon={<Users className="h-4 w-4 text-amber-400" />}
            accent="text-amber-400"
            metrics={sections.people}
          />
          <SectionCard
            title="EventCo"
            icon={<Rocket className="h-4 w-4 text-rose-400" />}
            accent="text-rose-400"
            metrics={sections.eventco}
          />
        </div>
      </div>

      {/* ---------- Summary Footer ---------- */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Growth Summary</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <SummaryPill label="Ahead" count={summary.ahead} status="AHEAD" />
            <SummaryPill label="On Track" count={summary.onTrack} status="ON_TRACK" />
            <SummaryPill label="Behind" count={summary.behind} status="BEHIND" />
            <SummaryPill label="At Risk" count={summary.atRisk} status="AT_RISK" />
          </div>
        </div>
      </Card>
    </div>
  );
}

// ---------- Summary pill ----------
function SummaryPill({
  label,
  count,
  status,
}: {
  label: string;
  count: number;
  status: Status;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        STATUS_TILE[status],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
      <span className="tabular-nums font-bold">{count}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}

// ---------- Header ----------
function Header({
  overall,
  status,
  label,
  error,
}: {
  overall: number;
  status: Status;
  label?: string;
  error?: boolean;
}) {
  const color = error ? "#f43f5e" : STATUS_COLOR[status];
  const labelText = error ? "UNAVAILABLE" : label ?? status.replace(/_/g, " ");
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Growth Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Progress toward ₦500M vision
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-2 rounded-md border px-3 py-1.5"
          style={{
            borderColor: `${color}40`,
            backgroundColor: `${color}10`,
          }}
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {error ? "—" : overall}
          </span>
          <div className="leading-tight">
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              Overall
            </p>
            <p
              className="text-xs font-bold uppercase tracking-wide"
              style={{ color }}
            >
              {labelText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <Skeleton className="h-12 w-32 rounded-md" />
    </div>
  );
}

export default GrowthDashboard;
