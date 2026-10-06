"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { SectionHeader, EmptyState } from "@/components/doz/ui-primitives";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Newspaper, CalendarDays, ExternalLink, RefreshCw, Loader2, Plus, Trash2, AlertTriangle, MapPin,
} from "lucide-react";
import { toast } from "sonner";

// Nigerian energy sector news and events — the same page for everybody.
//
// It carries no money, no client names and nothing about any colleague, so
// unlike the rest of the OS it is not cut down by role. An intern walking
// onto a shoot for an energy client should know what happened in the sector
// that morning, same as the founder.
//
// Every story shows the outlet that reported it and links back to them. The
// system does not write news.

interface NewsRow {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  source: string;
  summary: string | null;
  publishedAt: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  region: string | null;
  /** The listing site it was discovered on. Null when a person added it. */
  foundOn: string | null;
  createdAt: string;
}

// Nigeria, or Nigeria plus the nearer African markets. There is no third
// option any more: the search no longer leaves the continent.
type Region = "Nigeria" | "Africa";

interface Payload {
  news: NewsRow[];
  events: NewsRow[];
  lastRefreshed: string | null;
  stale: boolean;
  unreachable: string[];
  canCurate: boolean;
  sources: string[];
}

/** "2 hours ago", "Yesterday", or the date. Absent dates say so plainly. */
function when(iso: string | null): string {
  if (!iso) return "Undated";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "Undated";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(iso);
}

/** The outlet's domain, so a reader can see where a link goes before clicking. */
function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function eventDates(e: NewsRow): string {
  if (!e.eventStart) return "Date to be confirmed";
  const start = formatDate(e.eventStart);
  if (!e.eventEnd || e.eventEnd === e.eventStart) return start;
  return `${start} — ${formatDate(e.eventEnd)}`;
}

function daysUntilEvent(e: NewsRow): number | null {
  if (!e.eventStart) return null;
  const start = new Date(e.eventStart);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((start.getTime() - today.getTime()) / 86_400_000);
}

export function IndustryNews() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [region, setRegion] = useState<Region>("Africa");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const res = await fetch(`/api/doz/industry-news${force ? "?refresh=1" : ""}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`);
      setData(j);
      setError(null);
      return j as Payload;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load industry news");
      return null;
    }
  }, []);

  useEffect(() => {
    // Show what is stored straight away, then — only if it has gone stale —
    // pull the outlets in the background and swap the list in. Nobody waits
    // on seven newspapers to see yesterday's headlines.
    const t = setTimeout(() => {
      void load().then((first) => {
        if (first?.stale) {
          setRefreshing(true);
          void load(true).finally(() => setRefreshing(false));
        }
      });
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    const j = await load(true);
    setRefreshing(false);
    if (j) {
      const added = j.news.length;
      toast.success(added > 0 ? "Latest headlines pulled in" : "Checked — nothing new since last time");
    }
  }

  async function remove(row: NewsRow) {
    setBusyId(row.id);
    try {
      const res = await fetch("/api/doz/industry-news", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`);
      toast.success("Removed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove that", { duration: 8000 });
    } finally {
      setBusyId(null);
    }
  }

  const { upcoming, past, counts } = useMemo(() => {
    const rows = data?.events ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ahead = rows.filter((e) => !e.eventStart || new Date(e.eventEnd ?? e.eventStart) >= today);
    // A hand-added event has no region; it is the founder's own sector list,
    // so it belongs in every view rather than being filtered out of sight.
    const inRegion = (e: NewsRow) =>
      !e.region || (region === "Nigeria" ? e.region === "Nigeria" : true);
    return {
      upcoming: ahead.filter(inRegion),
      past: rows.filter((e) => e.eventStart && new Date(e.eventEnd ?? e.eventStart) < today).reverse(),
      counts: {
        Nigeria: ahead.filter((e) => !e.region || e.region === "Nigeria").length,
        Africa: ahead.length,
      },
    };
  }, [data, region]);

  const newsRow = (n: NewsRow) => {
    const host = hostOf(n.url);
    return (
      <div key={n.id} className="group border-b border-border py-3 last:border-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                {n.source}
              </Badge>
              <span className="text-[11px] text-muted-foreground">{when(n.publishedAt)}</span>
            </div>
            {/* The outlet's own headline, verbatim. Opens in a new tab and
                cannot reach back into this app. */}
            {n.url ? (
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-1 block text-sm font-semibold hover:text-primary hover:underline"
              >
                {n.title}
              </a>
            ) : (
              <p className="mt-1 text-sm font-semibold">{n.title}</p>
            )}
            {n.summary && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.summary}</p>}
            {host && (
              <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground/70">
                <ExternalLink className="h-2.5 w-2.5" /> {host}
              </p>
            )}
          </div>
          {data?.canCurate && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              disabled={busyId === n.id}
              onClick={() => remove(n)}
              aria-label="Remove"
            >
              {busyId === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>
    );
  };

  const eventCard = (e: NewsRow, isPast = false) => {
    const days = daysUntilEvent(e);
    return (
      <Card key={e.id} className={cn("p-4", isPast && "opacity-60")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1 text-[10px] font-semibold text-primary">
                <CalendarDays className="h-3 w-3" /> {eventDates(e)}
              </Badge>
              {!isPast && days !== null && days >= 0 && (
                <span className={cn("text-[11px] font-medium", days <= 7 ? "text-amber-400" : "text-muted-foreground")}>
                  {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm font-semibold">{e.title}</p>
            {e.summary && <p className="mt-1 text-xs text-muted-foreground">{e.summary}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {(e.venue || e.city || e.country) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {[e.venue, e.city, e.country].filter(Boolean).join(", ")}
                </span>
              )}
              {/* Where it came from, plainly: a listing someone published, or
                  a colleague who checked the date themselves. */}
              <span>{e.foundOn ? `Found on ${e.foundOn}` : `Added by ${e.source}`}</span>
              {e.url && (
                <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 hover:text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> Details
                </a>
              )}
            </div>
          </div>
          {data?.canCurate && (
            <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
              disabled={busyId === e.id} onClick={() => remove(e)} aria-label="Remove event">
              {busyId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={<Newspaper className="h-4 w-4" />}
        title="Industry News"
        description="Nigerian energy sector — headlines from the papers, and events across Nigeria and Africa"
        action={
          <div className="flex items-center gap-2">
            {data?.canCurate && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add event
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" disabled={refreshing} onClick={refresh}>
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
          </div>
        }
      />

      {error ? (
        <Card className="p-6"><p className="text-sm text-destructive">{error}</p></Card>
      ) : !data ? (
        <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : (
        <>
          {data.unreachable.length > 0 && (
            // Said out loud rather than silently showing less news.
            <Card className="flex items-start gap-3 border-amber-500/30 bg-amber-500/5 p-3">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <p className="text-xs text-muted-foreground">
                {data.unreachable.length} source{data.unreachable.length === 1 ? " is" : "s are"} not
                answering right now, so there may be less here than usual.
              </p>
            </Card>
          )}

          <Tabs defaultValue="news">
            <TabsList>
              <TabsTrigger value="news">Headlines</TabsTrigger>
              <TabsTrigger value="events">Events{upcoming.length > 0 ? ` · ${upcoming.length}` : ""}</TabsTrigger>
            </TabsList>

            <TabsContent value="news">
              <Card className="px-5 py-2">
                {data.news.length === 0 ? (
                  <div className="py-6">
                    <EmptyState
                      icon={<Newspaper className="h-8 w-8" />}
                      title="No headlines yet"
                      hint="Press Refresh to pull the latest from the energy desks."
                    />
                  </div>
                ) : (
                  data.news.map(newsRow)
                )}
              </Card>
              <p className="mt-2 px-1 text-[11px] text-muted-foreground">
                From {data.sources.join(", ")}. Headlines link back to the outlet that published them.
                {data.lastRefreshed && ` Last checked ${when(data.lastRefreshed)}.`}
              </p>
            </TabsContent>

            <TabsContent value="events" className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-md border border-border p-0.5">
                  {(["Nigeria", "Africa"] as Region[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRegion(r)}
                      className={cn(
                        "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                        region === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {r === "Africa" ? "Nigeria + Africa" : r} · {counts[r]}
                    </button>
                  ))}
                </div>
              </div>
              {upcoming.length === 0 ? (
                <Card className="p-6">
                  <EmptyState
                    icon={<CalendarDays className="h-8 w-8" />}
                    title="No events listed yet"
                    hint={
                      region === "Nigeria"
                        ? "Nothing listed in Nigeria yet — try Nigeria + Africa, or press Refresh."
                        : "Press Refresh to search the listing sites for events in this industry."
                    }
                  />
                </Card>
              ) : (
                upcoming.map((e) => eventCard(e))
              )}

              {past.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Past · {past.length}
                  </p>
                  {past.slice(0, 10).map((e) => eventCard(e, true))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      <AddEventDialog open={addOpen} onOpenChange={setAddOpen} onSaved={() => void load()} />
    </div>
  );
}

function AddEventDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ title: "", eventStart: "", eventEnd: "", venue: "", city: "", url: "", summary: "" });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/doz/industry-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, kind: "EVENT" }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`);
      toast.success("Event added");
      setForm({ title: "", eventStart: "", eventEnd: "", venue: "", city: "", url: "", summary: "" });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add the event", { duration: 8000 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add a sector event</DialogTitle>
          <DialogDescription>
            Conferences, summits and industry days worth knowing about. Everyone in the
            company sees these, so put in dates you have checked.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ev-title">Event</Label>
            <Input id="ev-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Nigeria Oil & Gas (NOG) Energy Week" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-start">Starts</Label>
              <Input id="ev-start" type="date" value={form.eventStart} onChange={(e) => set("eventStart", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-end">Ends (optional)</Label>
              <Input id="ev-end" type="date" value={form.eventEnd} onChange={(e) => set("eventEnd", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-venue">Venue</Label>
              <Input id="ev-venue" value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="ICC" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-city">City</Label>
              <Input id="ev-city" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Abuja" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-url">Link (optional)</Label>
            <Input id="ev-url" value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-note">Why it matters (optional)</Label>
            <Textarea id="ev-note" rows={2} value={form.summary} onChange={(e) => set("summary", e.target.value)} placeholder="Who will be there, and what D1Z could win from it." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.title.trim() || !form.eventStart} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Add event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
