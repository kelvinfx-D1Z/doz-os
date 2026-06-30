"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  KpiTargetCard,
  KpiTargetCardSkeleton,
  type KPI,
  type KpiStatus,
} from "@/components/doz/kpi-target-card";
import { Target, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";

// ============================================================
// GrowthTargetsGrid — A reusable section that fetches KPIs from
// /api/doz/kpis and renders them as KpiTargetCards in a grid.
//
// Two modes:
//   • mode="key"   → show keyMetrics (isKeyMetric=true)
//   • mode="names" → show specific KPIs by name (case-insensitive)
//
// Used by:
//   • Command Center (mode="key") — "Growth Targets" section
//   • Financial Intelligence (mode="names") — Overview tab top cards
// ============================================================

interface KpisResponse {
  kpis: KPI[];
  byCategory: Record<string, KPI[]>;
  keyMetrics: KPI[];
  summary: { ahead: number; onTrack: number; behind: number; atRisk: number; total: number };
}

interface Props {
  mode?: "key" | "names";
  names?: string[];
  title?: string;
  description?: string;
  /** Compact = hide year-targets + confidence (tighter cards) */
  compact?: boolean;
  /** Grid columns. Default 2 → 3 → 4 responsive */
  columns?: 2 | 3 | 4;
  /** Hide the header (title + summary). Default false. */
  hideHeader?: boolean;
  className?: string;
  /** Refresh-able? Shows a refresh button. Default true. */
  refreshable?: boolean;
}

const SUMMARY_TILE: Record<KpiStatus, { label: string; color: string; icon: React.ReactNode }> = {
  AHEAD: { label: "Ahead", color: "text-emerald-400", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  ON_TRACK: { label: "On Track", color: "text-teal-400", icon: <Target className="h-3.5 w-3.5" /> },
  BEHIND: { label: "Behind", color: "text-amber-400", icon: <TrendingDown className="h-3.5 w-3.5" /> },
  AT_RISK: { label: "At Risk", color: "text-rose-400", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
};

export function GrowthTargetsGrid({
  mode = "key",
  names = [],
  title = "Growth Targets — Are we ahead or behind?",
  description = "Every key metric vs its annual target, with forecast and required weekly pace.",
  compact = false,
  columns = 3,
  hideHeader = false,
  className,
  refreshable = true,
}: Props) {
  const [data, setData] = useState<KpisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchKpis = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch("/api/doz/kpis", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as KpisResponse;
      setData(json);
      if (refresh) toast.success("Growth targets refreshed");
    } catch (e) {
      console.error("[GrowthTargetsGrid] fetch failed:", e);
      if (refresh) toast.error("Couldn't refresh growth targets");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchKpis();
  }, [fetchKpis]);

  // Filter the KPIs based on mode
  const kpis: KPI[] = (() => {
    if (!data) return [];
    if (mode === "names") {
      const lower = names.map((n) => n.toLowerCase().trim());
      // Preserve order of `names` for predictable layout
      return lower
        .map((n) => data.kpis.find((k) => k.name.toLowerCase().trim() === n))
        .filter((k): k is KPI => !!k);
    }
    return data.keyMetrics;
  })();

  const summary = data?.summary;

  const gridCols =
    columns === 2
      ? "grid-cols-1 md:grid-cols-2"
      : columns === 4
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";

  return (
    <section className={cn("space-y-4", className)}>
      {/* Header */}
      {!hideHeader && (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-primary">
              <Target className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {summary && !loading && (
              <div className="flex items-center gap-2 text-xs">
                {(["AHEAD", "ON_TRACK", "BEHIND", "AT_RISK"] as KpiStatus[]).map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className={cn("gap-1 border-0 px-2 py-0.5 font-medium", SUMMARY_TILE[s].color)}
                  >
                    {SUMMARY_TILE[s].icon}
                    <span className="tabular-nums">
                      {s === "AHEAD" ? summary.ahead : s === "ON_TRACK" ? summary.onTrack : s === "BEHIND" ? summary.behind : summary.atRisk}
                    </span>
                    <span className="text-muted-foreground">{SUMMARY_TILE[s].label}</span>
                  </Badge>
                ))}
              </div>
            )}
            {refreshable && (
              <button
                type="button"
                onClick={() => fetchKpis(true)}
                disabled={refreshing || loading}
                className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                aria-label="Refresh growth targets"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* KPI grid */}
      <div className={cn("grid gap-4", gridCols)}>
        {loading
          ? Array.from({ length: Math.min(columns === 4 ? 4 : columns === 2 ? 2 : 3, mode === "names" ? Math.max(names.length, 3) : 6) }).map((_, i) => (
              <KpiTargetCardSkeleton key={i} compact={compact} />
            ))
          : kpis.length === 0 ? (
              <Card className="col-span-full flex flex-col items-center justify-center gap-2 border-dashed py-10 text-center">
                <Target className="h-6 w-6 text-muted-foreground/50" />
                <p className="text-sm font-medium">No growth targets found</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  KPIs may not be seeded yet, or none match the current filter.
                </p>
              </Card>
            )
          : kpis.map((k) => (
              <KpiTargetCard key={k.id} kpi={k} compact={compact} />
            ))}
      </div>
    </section>
  );
}

export default GrowthTargetsGrid;
