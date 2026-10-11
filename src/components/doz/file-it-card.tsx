"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatNGN } from "@/lib/format";
import {
  Sparkles, Loader2, Check, AlertTriangle, FolderPlus, Wand2, X,
} from "lucide-react";
import { toast } from "sonner";

// "I have paid 4 million for the PTDJ event already. This covers screens,
// sound, and lights."
//
// He types that; this proposes the filing; he confirms it. The proposal is
// not a formality — it is where he catches that "PTDJ" meant the PTDF booth,
// and where he puts in the split if he knows it.
//
// Nothing here writes anything until Confirm. See the route for why.

interface DraftLine {
  serviceName: string;
  category: string | null;
  quantity: number;
  days: number;
  unitPrice: number | null;
}

interface ProjectRef {
  id: string;
  name: string;
  code?: string | null;
}

interface Plan {
  note: string;
  projectName: string;
  projectMatch: { kind: "exact" | "near" | "none"; project: ProjectRef | null; alternatives: ProjectRef[] };
  lines: DraftLine[];
  amount: number | null;
  direction: "PAID_OUT" | "RECEIVED";
  occurredOn: string | null;
  questions: string[];
  notes: string[];
}

export function FileItCard({ onFiled }: { onFiled?: () => void }) {
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const [reading, setReading] = useState(false);
  const [filing, setFiling] = useState(false);

  // What the founder settles on the proposal screen.
  const [chosenProjectId, setChosenProjectId] = useState<string>("");
  const [newProjectName, setNewProjectName] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);

  async function read() {
    if (!text.trim() || reading) return;
    setReading(true);
    try {
      const res = await fetch("/api/doz/ai/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`);
      const p = j.plan as Plan;
      setPlan(p);
      setProjects(j.projects ?? []);
      setLines(p.lines);
      setChosenProjectId(p.projectMatch.project?.id ?? "");
      setNewProjectName(p.projectMatch.kind === "none" ? p.projectName : "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that", { duration: 8000 });
    } finally {
      setReading(false);
    }
  }

  async function confirm() {
    if (!plan || filing) return;
    setFiling(true);
    try {
      const res = await fetch("/api/doz/ai/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "commit",
          note: plan.note,
          amount: plan.amount,
          direction: plan.direction,
          occurredOn: plan.occurredOn,
          projectId: chosenProjectId || undefined,
          newProjectName: chosenProjectId ? undefined : newProjectName,
          lines,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`);
      toast.success(
        `Filed against ${j.projectCode ?? j.projectName}`,
        {
          description: `${formatNGN(j.amount)} recorded${j.createdProject ? ", new project created" : ""}${j.lineCount ? `, ${j.lineCount} cost line${j.lineCount === 1 ? "" : "s"} added` : ""}.`,
        },
      );
      reset();
      onFiled?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't file that", { duration: 10000 });
    } finally {
      setFiling(false);
    }
  }

  function reset() {
    setText("");
    setPlan(null);
    setLines([]);
    setChosenProjectId("");
    setNewProjectName("");
  }

  const sheetTotal = lines.reduce((s, l) => s + l.quantity * l.days * (l.unitPrice ?? 0), 0);
  const anyPriced = lines.some((l) => (l.unitPrice ?? 0) > 0);
  const allPriced = lines.length > 0 && lines.every((l) => (l.unitPrice ?? 0) > 0);
  const mismatch = allPriced && plan?.amount != null && Math.abs(sheetTotal - plan.amount) > 1;
  const projectSettled = Boolean(chosenProjectId || newProjectName.trim());
  const canConfirm = Boolean(plan && plan.amount !== null && projectSettled && !mismatch && !filing);

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">File it</p>
          <p className="text-xs text-muted-foreground">
            Say what happened in your own words — it works out the project, the cost lines and the
            money, and shows you before anything is saved.
          </p>
        </div>
      </div>

      {!plan ? (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="I have paid 4 million for the PTDF event already. This covers screens, sound and lights."
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void read();
            }}
          />
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" disabled={!text.trim() || reading} onClick={read}>
              {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Read it
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* What it understood, in his own sentence. */}
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">You said</p>
            <p className="mt-1 text-xs italic">{plan.note}</p>
          </div>

          {plan.questions.length > 0 && (
            <div className="space-y-2">
              {plan.questions.map((q) => (
                <div key={q} className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <p className="text-xs">{q}</p>
                </div>
              ))}
            </div>
          )}

          {/* WHICH PROJECT — the question it refuses to answer for him. */}
          <div className="space-y-2">
            <Label className="text-xs">Project</Label>
            <div className="flex flex-wrap gap-2">
              {[...plan.projectMatch.alternatives, ...(plan.projectMatch.project ? [plan.projectMatch.project] : [])].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setChosenProjectId(p.id); setNewProjectName(""); }}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-left text-xs transition-colors",
                    chosenProjectId === p.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  <span className="font-medium">{p.name}</span>
                  {p.code && <span className="ml-1.5 font-mono text-[10px] opacity-70">{p.code}</span>}
                </button>
              ))}
              <select
                value={chosenProjectId}
                onChange={(e) => { setChosenProjectId(e.target.value); if (e.target.value) setNewProjectName(""); }}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              >
                <option value="">Another project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.code ? `${p.code} — ${p.name}` : p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <FolderPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Input
                value={newProjectName}
                onChange={(e) => { setNewProjectName(e.target.value); if (e.target.value) setChosenProjectId(""); }}
                placeholder="…or create a new project with this name"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* THE MONEY */}
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {plan.direction === "PAID_OUT" ? "Paid out" : "Received"}
              </p>
              <p className="text-lg font-bold">{plan.amount === null ? "—" : formatNGN(plan.amount)}</p>
            </div>
            {plan.direction === "RECEIVED" && (
              <p className="flex-1 text-[11px] text-amber-400">
                Client money is recorded against its invoice in Documents, so the receipt and the
                withholding figures stay right.
              </p>
            )}
          </div>

          {/* THE COST LINES — blank unless he knows the split. */}
          {lines.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Cost lines</Label>
                {anyPriced && (
                  <span className={cn("text-[11px]", mismatch ? "text-destructive" : "text-muted-foreground")}>
                    {formatNGN(sheetTotal)} of {plan.amount === null ? "—" : formatNGN(plan.amount)}
                  </span>
                )}
              </div>
              {lines.map((l, i) => (
                <div key={`${l.serviceName}-${i}`} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                  <span className="min-w-0 flex-1 text-xs font-medium">{l.serviceName}</span>
                  <Badge variant="outline" className="text-[9px] uppercase tracking-wide text-muted-foreground">
                    {l.category ?? "Uncategorised"}
                  </Badge>
                  <Input
                    value={l.unitPrice === null ? "" : String(l.unitPrice)}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d.]/g, "");
                      setLines((prev) =>
                        prev.map((row, j) => (j === i ? { ...row, unitPrice: raw === "" ? null : Number(raw) } : row)),
                      );
                    }}
                    placeholder="cost (optional)"
                    className="h-8 w-36 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove ${l.serviceName}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {mismatch && (
                <p className="text-[11px] text-destructive">
                  The lines add up to {formatNGN(sheetTotal)} but the payment was{" "}
                  {plan.amount === null ? "—" : formatNGN(plan.amount)}. Fix one, or clear the costs and
                  fill them in later.
                </p>
              )}
            </div>
          )}

          {plan.notes.map((n) => (
            <p key={n} className="text-[11px] text-muted-foreground">{n}</p>
          ))}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={reset} disabled={filing}>Cancel</Button>
            <Button size="sm" className="gap-1.5" disabled={!canConfirm} onClick={confirm}>
              {filing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              File it
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
