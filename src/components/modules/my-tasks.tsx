"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader, EmptyState, PriorityDot } from "@/components/doz/ui-primitives";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatShortDate } from "@/lib/format";
import { groupMyTasks } from "@/lib/task-buckets";
import { cn } from "@/lib/utils";
import { ListTodo, Check, Loader2, Clock, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// Tasks — every task a person holds, in one place, for every role.
//
// Before this page an intern's only view of their work was the Command
// Center's "today" list, which — correctly — left out anything due later.
// So work assigned from Staff Hub with a deadline two days out reached
// nobody. This page is the complete list: nothing assigned to you is
// hidden from you here, whatever its date.
//
// The API scopes the rows. A non-founder only ever receives their own
// tasks, whatever they ask for; the founder may also look at everyone's.

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string | null;
  dueDate: string | null;
  completedAt: string | null;
  assignee: { id: string; name: string; role: string } | null;
  creator: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
}

type View = "mine" | "everyone";

function dayBounds(): [number, number] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return [start.getTime(), end.getTime()];
}

/** "Due today", "Due tomorrow", "Due in 3 days", "2 days overdue", or a date. */
function dueText(iso: string, todayStart: number): string {
  const due = new Date(iso);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - todayStart) / 86_400_000);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${-days} days overdue`;
  if (days <= 6) return `Due in ${days} days`;
  return `Due ${formatShortDate(iso)}`;
}

export function MyTasks() {
  const { user } = useCurrentUser();
  const isFounder = user?.role === "FOUNDER";
  const [view, setView] = useState<View>("mine");
  const [open, setOpen] = useState<TaskRow[] | null>(null);
  const [done, setDone] = useState<TaskRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    // "Mine" is asked for explicitly by id. For a non-founder the server
    // would scope to them anyway; for the founder, leaving it off means
    // everyone's tasks, which is what "Everyone" is for.
    const who = view === "mine" ? `&assigneeId=${encodeURIComponent(user.id)}` : "";
    try {
      const [o, d] = await Promise.all([
        fetch(`/api/doz/tasks?status=open${who}`, { cache: "no-store" }),
        fetch(`/api/doz/tasks?status=done${who}`, { cache: "no-store" }),
      ]);
      const oj = await o.json().catch(() => null);
      const dj = await d.json().catch(() => null);
      if (!o.ok) throw new Error(oj?.error || `Failed to load tasks (${o.status})`);
      if (!d.ok) throw new Error(dj?.error || `Failed to load tasks (${d.status})`);
      setOpen(oj.tasks ?? []);
      setDone(dj.tasks ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    }
  }, [user, view]);

  useEffect(() => {
    // Deferred a tick so the fetch's state updates land in a callback,
    // not synchronously inside the effect body.
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const [todayStart, todayEnd] = useMemo(() => dayBounds(), []);
  const groups = useMemo(
    () => groupMyTasks([...(open ?? []), ...done], todayStart, todayEnd),
    [open, done, todayStart, todayEnd],
  );

  async function toggle(t: TaskRow) {
    if (togglingId) return;
    setTogglingId(t.id);
    const wasDone = t.status === "DONE";
    try {
      const res = await fetch("/api/doz/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: t.id, action: "toggle" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      toast.success(wasDone ? "Task reopened" : "Task completed");
      await load();
    } catch (e) {
      toast.error("Couldn't update task", { description: e instanceof Error ? e.message : "Try again." });
    } finally {
      setTogglingId(null);
    }
  }

  const openCount = groups.overdue.length + groups.today.length + groups.upcoming.length + groups.undated.length;
  const showAssignee = isFounder && view === "everyone";

  const renderRow = (t: TaskRow) => {
    const isDone = t.status === "DONE";
    const overdue = !isDone && !!t.dueDate && new Date(t.dueDate).getTime() < todayStart;
    const fromSomeoneElse = t.creator && t.assignee && t.creator.id !== t.assignee.id;
    return (
      <div key={t.id} className="flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-accent/40">
        <button
          type="button"
          onClick={() => toggle(t)}
          disabled={togglingId === t.id}
          aria-label={isDone ? "Reopen task" : "Complete task"}
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-50",
            isDone
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40 hover:border-primary hover:bg-primary/10",
          )}
        >
          {togglingId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : isDone ? <Check className="h-3 w-3" /> : null}
        </button>
        <span className="mt-1.5"><PriorityDot priority={t.priority} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn("text-sm font-medium", isDone && "text-muted-foreground line-through", overdue && "text-red-400")}>
              {t.title}
            </p>
            {t.category && (
              <Badge variant="outline" className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                {t.category.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
          {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {showAssignee && t.assignee && <span className="font-medium text-foreground/80">{t.assignee.name}</span>}
            {fromSomeoneElse && <span>From {t.creator!.name}</span>}
            {t.project && <span>{t.project.name}</span>}
            {isDone && t.completedAt ? (
              <span>Completed {formatShortDate(t.completedAt)}</span>
            ) : t.dueDate ? (
              <span className={cn("inline-flex items-center gap-1", overdue && "text-red-400")}>
                <Clock className="h-3 w-3" /> {dueText(t.dueDate, todayStart)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const section = (title: string, rows: TaskRow[], tone?: "danger") =>
    rows.length === 0 ? null : (
      <div>
        <p className={cn("mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", tone === "danger" && "text-red-400")}>
          {title} · {rows.length}
        </p>
        <div className="space-y-0.5">{rows.map(renderRow)}</div>
      </div>
    );

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={<ListTodo className="h-4 w-4" />}
        title="Tasks"
        description={
          view === "everyone"
            ? "Every open task across the team"
            : "Everything assigned to you — today, coming up, and done"
        }
        action={
          <div className="flex items-center gap-2">
            {isFounder && (
              <div className="flex rounded-md border border-border p-0.5">
                {(["mine", "everyone"] as View[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { setOpen(null); setView(v); }}
                    className={cn(
                      "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {v === "mine" ? "Mine" : "Everyone"}
                  </button>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        }
      />

      {error ? (
        <Card className="p-6"><p className="text-sm text-destructive">{error}</p></Card>
      ) : open === null ? (
        <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : (
        <>
          <Card className="space-y-5 p-5">
            {openCount === 0 ? (
              <EmptyState
                icon={<ListTodo className="h-8 w-8" />}
                title="No open tasks"
                hint={view === "everyone" ? "Nobody on the team has open work." : "Nothing is assigned to you right now."}
              />
            ) : (
              <>
                {section("Overdue", groups.overdue, "danger")}
                {section("Today", groups.today)}
                {section("Coming up", groups.upcoming)}
                {section("No due date", groups.undated)}
              </>
            )}
          </Card>

          {groups.done.length > 0 && (
            <Card className="p-5">
              <button
                type="button"
                onClick={() => setShowDone((s) => !s)}
                className="flex w-full items-center gap-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                {showDone ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Done · {groups.done.length}
              </button>
              {showDone && <div className="mt-3 space-y-0.5">{groups.done.map(renderRow)}</div>}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
