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
  FileText,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Calendar,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================
// MonthlyReportCard — AI Chief of Staff monthly board report.
// Auto-fetches on mount. Collapsible. Shows last generated date.
// ============================================================

interface MonthlyReportResponse {
  content: string;
  month: string;
  generatedAt: string;
  cached: boolean;
  error?: boolean;
}

function monthLabel(monthKey: string): string {
  try {
    const [y, m] = monthKey.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString("en-NG", { month: "long", year: "numeric" });
  } catch {
    return monthKey;
  }
}

function daysAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export function MonthlyReportCard() {
  const [content, setContent] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [errored, setErrored] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false); // Collapsed by default

  const fetchReport = useCallback(
    async (opts: { refresh?: boolean } = {}) => {
      const isRefresh = !!opts.refresh;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const url = `/api/doz/ai/monthly-report${isRefresh ? "?refresh=1" : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as MonthlyReportResponse;
        setContent(json.content);
        setMonth(json.month);
        setGeneratedAt(json.generatedAt);
        setCached(!!json.cached);
        setErrored(!!json.error);
        if (isRefresh && !json.error) {
          toast.success(
            json.cached ? "Monthly report loaded" : "New monthly report generated",
          );
        }
      } catch (e) {
        console.error("[MonthlyReportCard] fetch failed:", e);
        setErrored(true);
        if (isRefresh) toast.error("Couldn't refresh monthly report.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <Card className="border-l-4 border-l-primary bg-card p-4 shadow-sm">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-start justify-between gap-3">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-2 text-left"
              aria-expanded={open}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold tracking-tight">
                    Monthly Board Report
                  </h2>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Board-ready
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {loading
                    ? "Preparing monthly report\u2026"
                    : generatedAt
                      ? `Generated ${daysAgo(generatedAt)}${
                          cached ? " \u00b7 cached" : ""
                        }${errored ? " \u00b7 fallback" : ""}${
                          month ? ` \u00b7 ${monthLabel(month)}` : ""
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
            onClick={() => fetchReport({ refresh: true })}
            disabled={refreshing || loading}
            aria-label="Refresh monthly report"
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
              <div
                className="max-h-[32rem] overflow-y-auto pr-1 text-xs leading-relaxed scroll-thin
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
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Collapsed summary footer */}
      {!open && !loading && month && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
          <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
            <Calendar className="h-2.5 w-2.5" />
            {monthLabel(month)}
          </Badge>
          <span>Expand to read the full report</span>
        </div>
      )}
    </Card>
  );
}

export default MonthlyReportCard;
