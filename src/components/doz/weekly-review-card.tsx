"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Calendar,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ListOrdered,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================
// WeeklyReviewCard — AI Chief of Staff weekly CEO review.
// Auto-fetches on mount. On Mondays, shows a prominent prompt
// to review. Otherwise collapsed in a "Weekly Review" section.
// ============================================================

interface WeeklyReviewResponse {
  content: string;
  topPriorities: string[];
  weekStart: string;
  generatedAt: string;
  cached: boolean;
  error?: boolean;
}

function isMonday(): boolean {
  return new Date().getDay() === 1;
}

function daysAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  const weeks = Math.floor(days / 7);
  return `${weeks} weeks ago`;
}

function weekStartLabel(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-NG", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function WeeklyReviewCard() {
  const monday = isMonday();
  const [content, setContent] = useState<string | null>(null);
  const [topPriorities, setTopPriorities] = useState<string[]>([]);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [errored, setErrored] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // On Monday, default open. Otherwise collapsed.
  const [open, setOpen] = useState(monday);

  const fetchReview = useCallback(
    async (opts: { refresh?: boolean } = {}) => {
      const isRefresh = !!opts.refresh;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const url = `/api/doz/ai/weekly-review${isRefresh ? "?refresh=1" : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as WeeklyReviewResponse;
        setContent(json.content);
        setTopPriorities(json.topPriorities ?? []);
        setWeekStart(json.weekStart);
        setGeneratedAt(json.generatedAt);
        setCached(!!json.cached);
        setErrored(!!json.error);
        if (isRefresh && !json.error) {
          toast.success(json.cached ? "Weekly review loaded" : "New weekly review generated");
        }
      } catch (e) {
        console.error("[WeeklyReviewCard] fetch failed:", e);
        setErrored(true);
        if (isRefresh) toast.error("Couldn't refresh weekly review.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchReview();
  }, [fetchReview]);

  return (
    <Card
      className={cn(
        "border-l-4 p-4 shadow-sm",
        monday ? "border-l-amber-500 bg-amber-500/[0.03]" : "border-l-primary bg-card",
      )}
    >
      {/* Monday prompt banner */}
      {monday && !loading && (
        <div className="mb-3 flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/[0.08] p-2.5">
          <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <p className="text-xs text-amber-300">
            <span className="font-semibold">It&apos;s Monday</span> — review your weekly CEO report.
          </p>
        </div>
      )}

      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-start justify-between gap-3">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-2 text-left"
              aria-expanded={open}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold tracking-tight">Weekly CEO Review</h2>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Chief of Staff
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {loading
                    ? "Preparing last week's review\u2026"
                    : generatedAt
                      ? `Generated ${daysAgo(generatedAt)}${
                          cached ? " \u00b7 cached" : ""
                        }${errored ? " \u00b7 fallback" : ""}${
                          weekStart ? ` \u00b7 week of ${weekStartLabel(weekStart)}` : ""
                        }`
                      : "\u00a0"}
                </p>
              </div>
              <div className="ml-auto shrink-0 self-center text-muted-foreground">
                {open ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            </button>
          </CollapsibleTrigger>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => fetchReview({ refresh: true })}
            disabled={refreshing || loading}
            aria-label="Refresh weekly review"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>

        <CollapsibleContent>
          <div className="mt-3">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ) : (
              <>
                {/* Top 5 priorities highlight chip row (always visible at top) */}
                {topPriorities.length > 0 && (
                  <div className="mb-3 rounded-md border border-primary/20 bg-primary/[0.04] p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                      <ListOrdered className="h-3 w-3" />
                      Top 5 CEO Priorities This Week
                    </div>
                    <ol className="mt-1.5 space-y-1">
                      {topPriorities.map((p, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-xs text-foreground/90"
                        >
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-primary/15 text-[10px] font-bold text-primary">
                            {i + 1}
                          </span>
                          <span className="leading-snug">{p}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Markdown content */}
                <div
                  className="max-h-[28rem] overflow-y-auto pr-1 text-xs leading-relaxed scroll-thin
                    [&_h1]:mt-3 [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:text-foreground
                    [&_h2]:mt-3 [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:text-primary
                    [&_h3]:mt-2 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-foreground
                    [&_p]:my-1.5 [&_p]:text-foreground/90
                    [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5
                    [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5
                    [&_li]:text-foreground/85 [&_li]:leading-snug
                    [&_strong]:font-semibold [&_strong]:text-foreground
                    [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[10px]
                    [&_a]:text-primary [&_a]:underline"
                >
                  <ReactMarkdown>{content ?? ""}</ReactMarkdown>
                </div>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Collapsed summary footer (shown when closed) */}
      {!open && !loading && topPriorities.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
          <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
            <ListOrdered className="h-2.5 w-2.5" />
            {topPriorities.length} priorities queued
          </Badge>
          <span>Expand to read the full review</span>
        </div>
      )}
    </Card>
  );
}

export default WeeklyReviewCard;
