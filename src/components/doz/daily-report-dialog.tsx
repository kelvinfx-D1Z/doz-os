"use client";

import { useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Loader2, ClipboardList } from "lucide-react";
import { toast } from "sonner";

export type ReportTask = { id: string; title: string; project?: { name: string } | null };

const MOODS = [
  { value: "GREAT", emoji: "🙂", label: "Good" },
  { value: "OK", emoji: "😐", label: "OK" },
  { value: "STRESSED", emoji: "😖", label: "Tough" },
];

// Common blockers, so the hardest box to fill becomes two clicks. This is the
// field the founder reads first, and a blank textarea at the end of a long day
// reliably gets left empty — which is exactly when it matters most.
const BLOCKERS = [
  "Nothing — all clear",
  "Waiting on the founder",
  "Waiting on a vendor",
  "Waiting on the client",
  "Need information",
  "Need money released",
];

const HOUR_PRESETS = [3, 5, 7, 8];

// Filing used to mean typing into three empty boxes. Now the common path is
// ticking the tasks you already have and tapping a blocker chip — typing is
// only needed for anything that was not already on your list.
export function DailyReportDialog({
  open,
  onOpenChange,
  onSubmitted,
  existing,
  tasks = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmitted: () => void;
  existing?: { tasksDone?: string | null; tasksPlanned?: string | null; blockers?: string | null; hoursWorked?: number | null; mood?: string | null } | null;
  tasks?: ReportTask[];
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState(existing?.tasksDone ?? "");
  const [tasksPlanned, setTasksPlanned] = useState(existing?.tasksPlanned ?? "");
  const [blockerChip, setBlockerChip] = useState<string | null>(null);
  const [blockerNote, setBlockerNote] = useState(existing?.blockers ?? "");
  const [hoursWorked, setHoursWorked] = useState(String(existing?.hoursWorked ?? 7));
  const [mood, setMood] = useState(existing?.mood ?? "OK");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // The report body: ticked task titles first, then anything typed.
  const tasksDone = useMemo(() => {
    const lines = tasks.filter((t) => ticked.has(t.id)).map((t) => t.title);
    const typed = extra.trim();
    if (typed) lines.push(...typed.split("\n").map((l) => l.trim()).filter(Boolean));
    return lines.join("\n");
  }, [tasks, ticked, extra]);

  const blockers = useMemo(() => {
    const parts: string[] = [];
    if (blockerChip && blockerChip !== BLOCKERS[0]) parts.push(blockerChip);
    if (blockerNote.trim()) parts.push(blockerNote.trim());
    return parts.join(" — ");
  }, [blockerChip, blockerNote]);

  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    if (!tasksDone.trim()) {
      toast.error("Tick at least one task, or type what you did");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await fetch("/api/doz/field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_report",
          tasksDone,
          tasksPlanned: tasksPlanned.trim() || undefined,
          blockers: blockers || undefined,
          hoursWorked: Number(hoursWorked) || 0,
          mood,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Failed (${res.status})`);
      toast.success(existing ? "Report updated ✓" : "Report filed ✓", {
        description: "Your founder can see it now.",
      });
      onOpenChange(false);
      onSubmitted();
    } catch (err) {
      toast.error("Couldn't file your report", {
        description: err instanceof Error ? err.message : undefined,
        duration: 8000,
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto scroll-thin sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            {existing ? "Update today's report" : "Today's report"}
          </DialogTitle>
          <DialogDescription>
            Mostly ticking. Should take under a minute.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* 1 — what you worked on */}
          <div className="space-y-2">
            <Label>What did you work on? *</Label>
            {tasks.length > 0 ? (
              <div className="scroll-thin max-h-44 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {tasks.map((t) => (
                  <label
                    key={t.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded p-1.5 text-sm transition-colors hover:bg-accent",
                      ticked.has(t.id) && "bg-primary/5",
                    )}
                  >
                    <Checkbox checked={ticked.has(t.id)} onCheckedChange={() => toggle(t.id)} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block">{t.title}</span>
                      {t.project?.name && (
                        <span className="text-[11px] text-muted-foreground">{t.project.name}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-border p-2.5 text-[11px] text-muted-foreground">
                No tasks assigned to you right now — just type what you did below.
              </p>
            )}
            <Textarea
              rows={2}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Anything else you did that wasn't on the list — one per line"
            />
          </div>

          {/* 2 — blockers, the field the founder reads first */}
          <div className="space-y-2">
            <Label>Anything blocking you?</Label>
            <div className="flex flex-wrap gap-1.5">
              {BLOCKERS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBlockerChip(blockerChip === b ? null : b)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    blockerChip === b
                      ? b === BLOCKERS[0]
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
            {blockerChip && blockerChip !== BLOCKERS[0] && (
              <Input
                autoFocus
                value={blockerNote}
                onChange={(e) => setBlockerNote(e.target.value)}
                placeholder="What exactly? (optional but helpful)"
              />
            )}
          </div>

          {/* 3 — what's next */}
          <div className="space-y-1.5">
            <Label htmlFor="dr-next">What&apos;s next?</Label>
            <Textarea id="dr-next" rows={2} value={tasksPlanned} onChange={(e) => setTasksPlanned(e.target.value)} placeholder="Optional" />
          </div>

          {/* 4 — hours + mood, both tap-only */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Hours worked</Label>
              <div className="flex gap-1.5">
                {HOUR_PRESETS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHoursWorked(String(h))}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors",
                      Number(hoursWorked) === h
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>How was it?</Label>
              <div className="flex gap-1.5">
                {MOODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMood(m.value)}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors",
                      mood === m.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <span className="mr-1">{m.emoji}</span>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !tasksDone.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {existing ? "Update report" : "File report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
