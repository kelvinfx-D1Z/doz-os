"use client";

import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const MOODS = [
  { value: "GREAT", emoji: "🙂", label: "Great" },
  { value: "OK", emoji: "😐", label: "OK" },
  { value: "STRESSED", emoji: "😖", label: "Stressed" },
];

// Filing a daily report previously meant leaving the Command Center for Field
// Mode, finding the card, opening the form, and submitting — four steps from
// the prompt that asked for it. Zero reports were ever filed. This submits in
// place, hitting the same POST /api/doz/field { action: "submit_report" }.
export function DailyReportDialog({
  open,
  onOpenChange,
  onSubmitted,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmitted: () => void;
  existing?: { tasksDone?: string | null; tasksPlanned?: string | null; blockers?: string | null; hoursWorked?: number | null; mood?: string | null } | null;
}) {
  const [tasksDone, setTasksDone] = useState(existing?.tasksDone ?? "");
  const [tasksPlanned, setTasksPlanned] = useState(existing?.tasksPlanned ?? "");
  const [blockers, setBlockers] = useState(existing?.blockers ?? "");
  const [hoursWorked, setHoursWorked] = useState(String(existing?.hoursWorked ?? 7));
  const [mood, setMood] = useState(existing?.mood ?? "OK");
  const [saving, setSaving] = useState(false);
  // Synchronous guard: two fast clicks fire before setSaving re-renders.
  const savingRef = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    if (!tasksDone.trim()) {
      toast.error("Tell us what you did today");
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
          blockers: blockers.trim() || undefined,
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
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{existing ? "Update today's report" : "File today's report"}</DialogTitle>
          <DialogDescription>
            Takes about 30 seconds. Only the first box is required.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dr-done">What did you do today? *</Label>
            <Textarea
              id="dr-done"
              autoFocus
              rows={4}
              value={tasksDone}
              onChange={(e) => setTasksDone(e.target.value)}
              placeholder={"One per line —\nRegistered on BPP portal\nCollected tax clearance certificate"}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dr-next">What&apos;s next?</Label>
            <Textarea id="dr-next" rows={2} value={tasksPlanned} onChange={(e) => setTasksPlanned(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dr-blockers">Anything blocking you?</Label>
            <Textarea
              id="dr-blockers"
              rows={2}
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              placeholder="Say so here — this is the part the founder reads first"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dr-hours">Hours worked</Label>
              <Input id="dr-hours" type="number" min={0} max={24} value={hoursWorked} onChange={(e) => setHoursWorked(e.target.value)} />
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
