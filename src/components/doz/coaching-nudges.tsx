"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Clock,
  X,
  Megaphone,
  Wallet,
  Users,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================
// CoachingNudges — proactive AI Growth Coach nudges.
// Auto-fetches on mount. Each nudge: severity color, category icon,
// message, "Dismiss" button (marks read).
// ============================================================

interface Nudge {
  id: string;
  category: string;
  message: string;
  severity: string; // INFO, WARNING, ACTION
  isRead: boolean;
  createdAt: string;
}

interface CoachingResponse {
  nudges: Nudge[];
  unreadCount: number;
  generated?: number;
  error?: boolean;
}

// ---- severity styling (NO indigo/blue) ----
function severityBorder(sev: string): string {
  switch (sev) {
    case "ACTION":
      return "border-l-rose-500";
    case "WARNING":
      return "border-l-amber-500";
    case "INFO":
    default:
      return "border-l-teal-500";
  }
}

function severityAccent(sev: string): string {
  switch (sev) {
    case "ACTION":
      return "bg-rose-500/10 text-rose-400";
    case "WARNING":
      return "bg-amber-500/10 text-amber-400";
    case "INFO":
    default:
      return "bg-teal-500/10 text-teal-400";
  }
}

function severityLabel(sev: string): string {
  switch (sev) {
    case "ACTION":
      return "Action needed";
    case "WARNING":
      return "Warning";
    case "INFO":
    default:
      return "Info";
  }
}

// ---- category icon picker ----
function CategoryIcon({ category, className }: { category: string; className?: string }) {
  switch (category) {
    case "FOUNDER_TIME":
      return <Clock className={className} />;
    case "BD_ACTIVITY":
      return <Users className={className} />;
    case "REFERRAL_DEP":
      return <Megaphone className={className} />;
    case "DELEGATION":
      return <Target className={className} />;
    case "CASH":
      return <Wallet className={className} />;
    case "FOCUS":
      return <TrendingUp className={className} />;
    default:
      return <Sparkles className={className} />;
  }
}

function minutesAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function CoachingNudges() {
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  const fetchNudges = useCallback(
    async (opts: { refresh?: boolean } = {}) => {
      const isRefresh = !!opts.refresh;
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const url = `/api/doz/ai/coaching${isRefresh ? "?refresh=1" : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as CoachingResponse;
        setNudges(json.nudges ?? []);
        setUnreadCount(json.unreadCount ?? 0);
        setErrored(!!json.error);
        if (isRefresh && !json.error) {
          toast.success(
            json.generated && json.generated > 0
              ? `${json.generated} new nudge${json.generated > 1 ? "s" : ""} generated`
              : "Coaching nudges refreshed",
          );
        }
      } catch (e) {
        console.error("[CoachingNudges] fetch failed:", e);
        setErrored(true);
        if (isRefresh) toast.error("Couldn't refresh nudges.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchNudges();
  }, [fetchNudges]);

  const handleDismiss = useCallback(
    async (nudgeId: string) => {
      setDismissingId(nudgeId);
      // Optimistic update
      setNudges((prev) =>
        prev.map((n) => (n.id === nudgeId ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        const res = await fetch("/api/doz/ai/coaching", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nudgeId, action: "read" }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.success("Nudge dismissed");
      } catch (e) {
        console.error("[CoachingNudges] dismiss failed:", e);
        toast.error("Couldn't dismiss nudge — try again.");
        // Revert optimistic
        setNudges((prev) =>
          prev.map((n) => (n.id === nudgeId ? { ...n, isRead: false } : n)),
        );
        setUnreadCount((c) => c + 1);
      } finally {
        setDismissingId(null);
      }
    },
    [],
  );

  // Show only unread nudges (and at most 3) so the card stays compact
  const visibleNudges = nudges.filter((n) => !n.isRead).slice(0, 3);

  return (
    <Card className="border-l-4 border-l-primary bg-primary/[0.03] p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold tracking-tight">AI Growth Coach</h2>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Coaching nudges
              </span>
              {unreadCount > 0 && !loading && (
                <span className="inline-flex items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {unreadCount} new
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {loading
                ? "Checking your business for coaching opportunities\u2026"
                : errored
                  ? "Showing last known nudges"
                  : visibleNudges.length > 0
                    ? `${visibleNudges.length} active ${visibleNudges.length === 1 ? "nudge" : "nudges"} \u00b7 ${unreadCount} unread`
                    : "All caught up \u2014 no active nudges"}
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => fetchNudges({ refresh: true })}
          disabled={refreshing || loading}
          aria-label="Refresh coaching nudges"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Body */}
      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="rounded-md border border-border bg-card/40 p-3"
              >
                <Skeleton className="h-3 w-32" />
                <Skeleton className="mt-2 h-3 w-full" />
                <Skeleton className="mt-1 h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : visibleNudges.length === 0 ? (
          <div className="flex items-start gap-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div>
              <p className="text-xs font-medium text-emerald-300">
                You&apos;re on track
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                No active coaching nudges. Keep up the disciplined execution.
              </p>
            </div>
          </div>
        ) : (
          visibleNudges.map((nudge) => (
            <div
              key={nudge.id}
              className={cn(
                "rounded-md border border-border border-l-4 bg-card/40 p-3",
                severityBorder(nudge.severity),
              )}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                    severityAccent(nudge.severity),
                  )}
                >
                  <CategoryIcon
                    category={nudge.category}
                    className="h-3.5 w-3.5"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wider",
                        nudge.severity === "ACTION"
                          ? "text-rose-400"
                          : nudge.severity === "WARNING"
                            ? "text-amber-400"
                            : "text-teal-400",
                      )}
                    >
                      {severityLabel(nudge.severity)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {minutesAgo(nudge.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/90">
                    {nudge.message}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => handleDismiss(nudge.id)}
                  disabled={dismissingId === nudge.id}
                  aria-label="Dismiss nudge"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer hint */}
      {!loading && visibleNudges.length > 0 && (
        <p className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground">
          <AlertTriangle className="h-3 w-3" />
          The coach generates new nudges every 6 hours based on your latest data.
        </p>
      )}
    </Card>
  );
}

export default CoachingNudges;
