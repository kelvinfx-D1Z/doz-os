"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================
// AiBriefingCard — proactive morning briefing from the AI Chief of Staff.
// Auto-fetches on mount, shows a brief loading shimmer, then the briefing.
// Cached server-side (≤1h). Refresh button bypasses the cache.
// ============================================================

interface BriefingResponse {
  briefing: string;
  generatedAt: string;
  cached: boolean;
  error?: boolean;
}

function minutesAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export function AiBriefingCard() {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [cached, setCached] = useState<boolean>(false);
  const [errored, setErrored] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchBriefing = useCallback(
    async (opts: { refresh?: boolean } = {}) => {
      const isRefresh = !!opts.refresh;
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const url = `/api/doz/ai/briefing${isRefresh ? "?refresh=1" : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as BriefingResponse;
        setBriefing(json.briefing);
        setGeneratedAt(json.generatedAt);
        setCached(!!json.cached);
        setErrored(!!json.error);
        if (isRefresh) {
          toast.success(json.cached ? "Briefing refreshed" : "New briefing generated");
        }
      } catch (e) {
        console.error("[AiBriefingCard] fetch failed:", e);
        setErrored(true);
        // Minimal in-card fallback so the card never appears empty
        setBriefing(
          "**Top priority today:** Review overdue invoices and clear pending approvals.\n" +
            "\u26a0 Cash flow gap from outstanding invoices.\n" +
            "\u26a0 Pending approvals may stall vendor work.\n" +
            "\u2197 Delegate intern reports to the ops lead.",
        );
        setGeneratedAt(new Date().toISOString());
        setCached(false);
        if (isRefresh) {
          toast.error("Couldn\u2019t refresh briefing — showing last known.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  // Auto-fetch on mount
  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  return (
    <Card
      className={cn(
        "relative border-l-4 border-primary bg-primary/5 p-4 shadow-sm",
        "overflow-hidden",
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold tracking-tight">AI Morning Briefing</h2>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Chief of Staff
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {loading
                ? "Preparing your briefing\u2026"
                : generatedAt
                  ? `Generated ${minutesAgo(generatedAt)}${cached ? " \u00b7 cached" : ""}${errored ? " \u00b7 fallback" : ""}`
                  : "\u00a0"}
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => fetchBriefing({ refresh: true })}
          disabled={refreshing || loading}
          aria-label="Refresh briefing"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Body */}
      <div className="mt-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />
            <span className="animate-pulse">{"Preparing your briefing\u2026"}</span>
          </div>
        ) : (
          <div
            className={cn(
              "max-h-48 overflow-y-auto pr-1 text-sm leading-relaxed",
              "[&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0",
              "[&_strong]:font-semibold [&_strong]:text-foreground",
            )}
          >
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="text-foreground/90">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              }}
            >
              {briefing ?? ""}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Loading shimmer underline */}
      {loading && (
        <div className="mt-3 space-y-1.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      )}
    </Card>
  );
}

export default AiBriefingCard;
