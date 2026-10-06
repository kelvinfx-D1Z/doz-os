"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppStore, type ModuleId } from "@/lib/store";
import { Newspaper, ArrowRight, CalendarDays, ExternalLink } from "lucide-react";

// The sector's three latest headlines and its next event, on every
// dashboard in the company — founder, staff, intern, freelancer, production
// manager alike.
//
// Short on purpose. The full list is one click away; this is the part that
// makes someone open it.

interface Row {
  id: string;
  title: string;
  url: string | null;
  source: string;
  publishedAt: string | null;
  eventStart: string | null;
  venue: string | null;
  city: string | null;
}

function when(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const hrs = Math.round((Date.now() - t) / 3_600_000);
  if (hrs < 1) return "Just now";
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function eventWhen(iso: string | null): string {
  if (!iso) return "Date to be confirmed";
  const start = new Date(iso);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((start.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function IndustryNewsCard() {
  const setModule = useAppStore((s) => s.setModule);
  const [news, setNews] = useState<Row[]>([]);
  const [nextEvent, setNextEvent] = useState<Row | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/doz/industry-news", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setNews((j.news ?? []).slice(0, 3));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        setNextEvent(
          (j.events ?? []).find((e: Row) => e.eventStart && new Date(e.eventStart) >= today) ?? null,
        );
        setLoaded(true);
        // The dashboard never fetches the outlets itself — five of these
        // cards racing to refresh would hammer every paper at once. The
        // Industry News page owns refreshing.
      })
      // A dashboard must not break because an outlet is down.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Nothing to say yet: stay off the dashboard rather than showing an empty box.
  if (!loaded || (news.length === 0 && !nextEvent)) return null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Industry news
            </p>
            <p className="mt-0.5 text-sm font-bold">Nigerian energy sector</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary"
          onClick={() => setModule("news" as ModuleId)}
        >
          All news <ArrowRight className="h-3 w-3" />
        </Button>
      </div>

      {news.length > 0 && (
        <div className="mt-3 space-y-2.5">
          {news.map((n) => (
            <div key={n.id} className="border-b border-border pb-2.5 last:border-0 last:pb-0">
              {n.url ? (
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-xs font-medium leading-snug hover:text-primary hover:underline"
                >
                  {n.title}
                </a>
              ) : (
                <p className="text-xs font-medium leading-snug">{n.title}</p>
              )}
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <ExternalLink className="h-2.5 w-2.5" />
                {n.source}
                {when(n.publishedAt) && <span>· {when(n.publishedAt)}</span>}
              </p>
            </div>
          ))}
        </div>
      )}

      {nextEvent && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-muted/40 p-3">
          <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[9px] font-semibold uppercase tracking-wide text-primary">
                Next event
              </Badge>
              <span className="text-[11px] font-medium">{eventWhen(nextEvent.eventStart)}</span>
            </div>
            <p className="mt-0.5 text-xs font-medium">{nextEvent.title}</p>
            {(nextEvent.venue || nextEvent.city) && (
              <p className="text-[10px] text-muted-foreground">
                {[nextEvent.venue, nextEvent.city].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
