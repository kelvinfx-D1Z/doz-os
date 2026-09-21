"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHeader } from "@/components/doz/ui-primitives";
import { cn } from "@/lib/utils";
// Types only. The playbook's text arrives from the founder-only API; a value
// import here would bundle it into the JavaScript every signed-in user
// downloads. src/lib/founder-playbook-boundary.test.ts enforces this.
import type { Block, DayPlan, Priority, PlaybookContent } from "@/lib/founder-playbook";
import { weekStart, dayKey } from "@/lib/week-keys";
import {
  Compass, Check, Loader2, Ban, Target, CalendarDays, HelpCircle, Moon, Save,
} from "lucide-react";
import { toast } from "sonner";

// The founder's own weekly operating system, inside the OS it governs.
//
// Opens on today, because that is the only day he can act on. The rest of
// the week, the scoreboard and the parking zone are behind tabs — present
// when he wants them, not competing with the block he should be in now.

interface ReviewState {
  answers: Record<string, string>;
  nextWeek: string;
}

export function Playbook() {
  // Fixed at mount: the founder's own clock decides what "today" is, and a
  // page left open overnight should not silently re-key his ticks.
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => dayKey(today), [today]);
  const monday = useMemo(() => weekStart(today), [today]);
  const mondayKey = useMemo(() => dayKey(monday), [monday]);
  const weekDayKeys = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        return dayKey(d);
      }),
    [monday],
  );

  const [content, setContent] = useState<PlaybookContent | null>(null);
  // Labels and colours come with the content. Kept out of this file so the
  // venture names never appear in the client bundle.
  const tone = (p: Priority) => content?.tones[p] ?? "";
  const label = (p: Priority) => content?.labels[p] ?? "";
  const [done, setDone] = useState<Set<string> | null>(null);
  const [review, setReview] = useState<ReviewState>({ answers: {}, nextWeek: "" });
  const [savingReview, setSavingReview] = useState(false);
  const [busyBlock, setBusyBlock] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/doz/playbook?week=${mondayKey}&days=${weekDayKeys.join(",")}`,
        { cache: "no-store" },
      );
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`);
      setContent(j.content ?? null);
      setDone(new Set<string>(j.done ?? []));
      setReview({ answers: j.review?.answers ?? {}, nextWeek: j.review?.nextWeek ?? "" });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your playbook");
    }
  }, [mondayKey, weekDayKeys]);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function toggleBlock(day: string, blockId: string) {
    if (busyBlock) return;
    const key = `${day}|${blockId}`;
    const wasDone = done?.has(key) ?? false;
    setBusyBlock(key);
    // Optimistic: ticking a block should feel instant, and the only cost
    // of being wrong is one reverted checkbox.
    setDone((prev) => {
      const next = new Set(prev ?? []);
      if (wasDone) next.delete(key); else next.add(key);
      return next;
    });
    try {
      const res = await fetch("/api/doz/playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, blockId, done: !wasDone }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed (${res.status})`);
      }
    } catch (e) {
      setDone((prev) => {
        const next = new Set(prev ?? []);
        if (wasDone) next.add(key); else next.delete(key);
        return next;
      });
      toast.error(e instanceof Error ? e.message : "Couldn't save that", { duration: 8000 });
    } finally {
      setBusyBlock(null);
    }
  }

  async function saveReview() {
    setSavingReview(true);
    try {
      const res = await fetch("/api/doz/playbook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: mondayKey, answers: review.answers, nextWeek: review.nextWeek }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`);
      toast.success("Weekly review saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the review", { duration: 8000 });
    } finally {
      setSavingReview(false);
    }
  }

  const blockRow = (b: Block, day: string, interactive: boolean) => {
    const key = `${day}|${b.id}`;
    const isDone = done?.has(key) ?? false;
    const busy = busyBlock === key;
    return (
      <div
        key={b.id}
        className={cn(
          "rounded-lg border border-border p-4 transition-colors",
          isDone && "border-primary/30 bg-primary/5",
        )}
      >
        <div className="flex items-start gap-3">
          {interactive && (
            <button
              type="button"
              onClick={() => toggleBlock(day, b.id)}
              disabled={busy}
              aria-label={isDone ? `Mark ${b.title} not done` : `Mark ${b.title} done`}
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-50",
                isDone
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/40 hover:border-primary hover:bg-primary/10",
              )}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : isDone ? <Check className="h-3 w-3" /> : null}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {b.slot}
              </span>
              <Badge variant="outline" className={cn("text-[9px] font-bold uppercase tracking-wide", tone(b.priority))}>
                {label(b.priority)}
              </Badge>
              {b.duration && <span className="text-[11px] text-muted-foreground">{b.duration}</span>}
            </div>
            <p className={cn("mt-1 text-sm font-semibold", isDone && "text-muted-foreground line-through")}>
              {b.title}
            </p>
            {b.intent && <p className="mt-0.5 text-xs text-muted-foreground">{b.intent}</p>}
            {b.points.length > 0 && (
              <ul className="mt-2 space-y-1">
                {b.points.map((p) => (
                  <li key={p} className="flex gap-2 text-xs text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    {p}
                  </li>
                ))}
              </ul>
            )}
            {b.note && (
              <p className="mt-2 border-l-2 border-primary/40 pl-2 text-xs italic text-foreground/80">{b.note}</p>
            )}
            {b.example && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">e.g. {b.example}</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const dayCard = (plan: DayPlan, day: string, interactive: boolean) => (
    <Card className="space-y-3 p-5" key={plan.weekday}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold">{plan.name}</p>
          <p className="text-xs text-muted-foreground">
            {plan.theme}
            {plan.budget && <span className="ml-1.5 text-muted-foreground/70">· {plan.budget}</span>}
          </p>
        </div>
        <Badge variant="outline" className={cn("text-[9px] font-bold uppercase tracking-wide", tone(plan.priority))}>
          {label(plan.priority)}
        </Badge>
      </div>
      {plan.question && (
        <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3">
          <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-xs font-medium italic">{plan.question}</p>
        </div>
      )}
      {plan.blocks.length > 0 && <div className="space-y-2">{plan.blocks.map((b) => blockRow(b, day, interactive))}</div>}
      {plan.closing && (
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <p className="text-xs font-semibold">{plan.closing.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{plan.closing.body}</p>
        </div>
      )}
    </Card>
  );

  const header = (
    <SectionHeader
      icon={<Compass className="h-4 w-4" />}
      title="Playbook"
      description="Four priorities. One rule. Seven days."
    />
  );
  const todayPlan = content?.week.find((d) => d.weekday === today.getDay()) ?? null;

  if (error) {
    return (
      <div className="space-y-5">
        {header}
        <Card className="p-6"><p className="text-sm text-destructive">{error}</p></Card>
      </div>
    );
  }
  if (!content || done === null || !todayPlan) {
    return (
      <div className="space-y-5">
        {header}
        <div className="space-y-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-24 w-full" /></div>
      </div>
    );
  }

  const doneToday = todayPlan.blocks.filter((b) => done.has(`${todayKey}|${b.id}`)).length;

  return (
    <div className="space-y-5">
      {header}

      {/* The one rule sits above everything, because everything else is
          downstream of it. */}
      <Card className="border-primary/30 bg-primary/5 p-5">
        <div className="flex items-start gap-3">
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">The one rule</p>
            <p className="mt-1 text-sm font-semibold">{content.rule.headline}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{content.rule.body}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {content.priorities.map((p) => (
            <div key={p.id} className={cn("rounded-md border px-3 py-2", tone(p.id))}>
              <p className="text-xs font-bold">{p.label}</p>
              <p className="text-[11px] opacity-80">{p.goal}</p>
            </div>
          ))}
        </div>
      </Card>

      <Tabs defaultValue="today">
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">The week</TabsTrigger>
            <TabsTrigger value="review">Sunday review</TabsTrigger>
            <TabsTrigger value="scoreboard">Scoreboard</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-xs text-muted-foreground">
                {today.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              </p>
              {todayPlan.blocks.length > 0 && (
                <p className="text-xs font-medium">
                  {doneToday} of {todayPlan.blocks.length} blocks done
                </p>
              )}
            </div>
            {dayCard(todayPlan, todayKey, true)}
            {todayPlan.weekday === 0 && (
              <Card className="flex items-start gap-3 border-border bg-muted/30 p-4">
                <Moon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{content.sundayGuard}</p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="week" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {content.week.map((plan) => {
                // Index within the Monday-first week, which is how the seven
                // day-keys above are ordered.
                const idx = plan.weekday === 0 ? 6 : plan.weekday - 1;
                return dayCard(plan, weekDayKeys[idx], weekDayKeys[idx] === todayKey);
              })}
            </div>
          </TabsContent>

          <TabsContent value="review" className="space-y-4">
            <Card className="space-y-4 p-5">
              <SectionHeader
                icon={<CalendarDays className="h-4 w-4" />}
                title="Weekly review"
                description={`Week of ${monday.toLocaleDateString(undefined, { day: "numeric", month: "long" })} — four questions`}
              />
              {content.reviewQuestions.map((q) => (
                <div key={q.key} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[9px] font-bold uppercase tracking-wide", tone(q.priority))}>
                      {label(q.priority)}
                    </Badge>
                    <p className="text-xs font-medium">{q.question}</p>
                  </div>
                  <Textarea
                    rows={2}
                    value={review.answers[q.key] ?? ""}
                    onChange={(e) =>
                      setReview((r) => ({ ...r, answers: { ...r.answers, [q.key]: e.target.value } }))
                    }
                    placeholder="Honestly."
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Then plan the following week.</p>
                <Textarea
                  rows={3}
                  value={review.nextWeek}
                  onChange={(e) => setReview((r) => ({ ...r, nextWeek: e.target.value }))}
                  placeholder="What next week has to produce."
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={saveReview} disabled={savingReview} className="gap-1.5">
                  {savingReview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save review
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="scoreboard" className="space-y-4">
            <Card className="p-5">
              <SectionHeader icon={<Target className="h-4 w-4" />} title="A different definition of work" description="The question on the left is the one that feels like work" />
              <div className="mt-3 space-y-2">
                {content.redefinitions.map((r) => (
                  <div key={r.priority} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[120px_1fr_1fr] sm:items-center">
                    <Badge variant="outline" className={cn("w-fit text-[9px] font-bold uppercase tracking-wide", tone(r.priority))}>
                      {label(r.priority)}
                    </Badge>
                    <p className="text-xs text-muted-foreground line-through">{r.instead}</p>
                    <p className="text-xs font-semibold">{r.ask}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader title="Monthly targets" description="Keep the scoreboard small" icon={<Target className="h-4 w-4" />} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {content.monthlyTargets.map((m) => (
                  <div key={m.priority} className="rounded-md border border-border p-3">
                    <Badge variant="outline" className={cn("text-[9px] font-bold uppercase tracking-wide", tone(m.priority))}>
                      {label(m.priority)}
                    </Badge>
                    <ul className="mt-2 space-y-1">
                      {m.targets.map((t) => (
                        <li key={t} className="flex gap-2 text-xs text-muted-foreground">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader title="Ideas parking zone" description="Not now" icon={<Ban className="h-4 w-4" />} />
              <div className="mt-3 flex flex-wrap gap-2">
                {content.notNow.items.map((i) => (
                  <Badge key={i} variant="outline" className="gap-1 border-destructive/30 bg-destructive/5 text-destructive">
                    <Ban className="h-3 w-3" /> {i}
                  </Badge>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{content.notNow.note}</p>
            </Card>
          </TabsContent>
        </Tabs>
    </div>
  );
}
