"use client";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Crown, Target, CheckCircle2, Circle, Clock, Users, TrendingUp,
  Clapperboard, Rocket, Wallet, Calendar, Lightbulb, Building2, Sun, Moon,
} from "lucide-react";
import { SectionHeader, MiniBar } from "@/components/doz/ui-primitives";
import { toast } from "sonner";

interface Milestone {
  id: string; quarter: number; phase: string; title: string;
  description: string; deliverable: string | null; category: string;
  status: string; dueMonth: number | null; completedAt: string | null;
}

const QUARTER_COLORS: Record<number, string> = {
  1: "border-l-emerald-500/50", 2: "border-l-teal-500/50",
  3: "border-l-amber-500/50", 4: "border-l-violet-500/50",
};
const QUARTER_NAMES: Record<number, string> = {
  1: "Build the Foundation", 2: "Build the Growth Engine",
  3: "Build Assets", 4: "Scale",
};
const STATUS_ICONS: Record<string, React.ReactNode> = {
  NOT_STARTED: <Circle className="h-4 w-4 text-muted-foreground" />,
  IN_PROGRESS: <Clock className="h-4 w-4 text-amber-400" />,
  COMPLETED: <CheckCircle2 className="h-4 w-4 text-primary" />,
};
const ECOSYSTEM = [
  { name: "DOZ Studios", desc: "Corporate Films, Documentaries, Photography, Livestreaming, Events", color: "border-emerald-500/30 bg-emerald-500/5", icon: <Clapperboard className="h-5 w-5 text-emerald-400" /> },
  { name: "Fiestivo.com", desc: "Registration, Check-in, Live Polls, Q&A, Surveys, Event Reports", color: "border-teal-500/30 bg-teal-500/5", icon: <Rocket className="h-5 w-5 text-teal-400" /> },
  { name: "FounderOS", desc: "CRM, Projects, Finance, HR, SOPs, Business Systems", color: "border-amber-500/30 bg-amber-500/5", icon: <Building2 className="h-5 w-5 text-amber-400" /> },
];

const DAILY_ACTIVITIES = [
  { day: "Monday", focus: "Leadership Meeting", detail: "Review KPIs, assign work, sales pipeline, cashflow", icon: <Users className="h-4 w-4" /> },
  { day: "Tuesday", focus: "Sales Day", detail: "Client meetings, proposal review, business development", icon: <TrendingUp className="h-4 w-4" /> },
  { day: "Wednesday", focus: "Creative Day", detail: "Review edits, content strategy, mentor interns", icon: <Clapperboard className="h-4 w-4" /> },
  { day: "Thursday", focus: "Product Day", detail: "Fiestivo.com, FounderOS, AI, automation, process improvements", icon: <Rocket className="h-4 w-4" /> },
  { day: "Friday", focus: "Review Day", detail: "Finance, weekly reports, learning session, plan next week", icon: <Wallet className="h-4 w-4" /> },
];

const MONTHLY_TARGETS = [
  "Meet 5 potential clients", "Attend 1 networking event", "Publish 1 case study",
  "Launch 1 improvement", "Document 1 process", "Teach 1 internal workshop",
  "Read 1 business book", "Review financial dashboard",
];

export function FounderTasks() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scorecardChecks, setScorecardChecks] = useState<Record<number, boolean>>({});

  async function load() {
    try {
      const res = await fetch("/api/doz/founder-tasks");
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch { toast.error("Couldn't load founder roadmap"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function updateMilestone(id: string, status: string) {
    const next = status === "COMPLETED" ? "IN_PROGRESS" : status === "IN_PROGRESS" ? "COMPLETED" : "IN_PROGRESS";
    try {
      await fetch("/api/doz/founder-tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ milestoneId: id, status: next }) });
      toast.success(next === "COMPLETED" ? "Milestone completed ✓" : "Status updated");
      load();
    } catch { toast.error("Failed to update"); }
  }

  if (loading || !data) return <div className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-64 w-full" /></div>;

  const { milestones, stats, scorecard } = data;
  const quarters = [1, 2, 3, 4];

  return (
    <div className="space-y-6">
      <SectionHeader icon={<Crown className="h-5 w-5" />} title="Founder's Roadmap" description="From Operator → CEO — 12 months to build a company that can build other companies" />

      {/* 1. MONTHLY SCORECARD (on top) */}
      <Card className="border-l-4 border-l-primary p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-primary" /> Monthly Scorecard — Was this month successful?
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {scorecard.map((q: string, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <Switch checked={!!scorecardChecks[i]} onCheckedChange={(v) => setScorecardChecks(prev => ({ ...prev, [i]: v }))} />
              <span className={`text-xs ${scorecardChecks[i] ? "text-primary font-medium" : "text-muted-foreground"}`}>{q}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* 2. DAILY ACTIVITIES (Mon-Fri schedule) */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Sun className="h-4 w-4 text-amber-400" /> Daily Activities — Weekly CEO Schedule</div>
        <div className="grid gap-2 sm:grid-cols-5">
          {DAILY_ACTIVITIES.map((d) => (
            <div key={d.day} className="rounded-lg bg-muted/30 p-3 border border-border">
              <div className="flex items-center gap-1.5 mb-1.5 text-primary">{d.icon}</div>
              <p className="text-xs font-semibold">{d.day}</p>
              <p className="text-[11px] text-primary font-medium mt-0.5">{d.focus}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{d.detail}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* 3. WEEKLY (summarized from daily) */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Calendar className="h-4 w-4 text-primary" /> Weekly Rhythm</div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
            <p className="text-xs font-semibold text-emerald-400">Mon & Tue</p>
            <p className="text-[10px] text-muted-foreground mt-1">Leadership + Sales — review KPIs, meet clients, advance pipeline</p>
          </div>
          <div className="rounded-lg bg-teal-500/5 border border-teal-500/20 p-3">
            <p className="text-xs font-semibold text-teal-400">Wed & Thu</p>
            <p className="text-[10px] text-muted-foreground mt-1">Creative + Product — review work, mentor interns, build Fiestivo/FounderOS</p>
          </div>
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
            <p className="text-xs font-semibold text-amber-400">Friday</p>
            <p className="text-[10px] text-muted-foreground mt-1">Review — finance, reports, learning, plan next week</p>
          </div>
        </div>
      </Card>

      {/* 4. MONTHLY COMMITMENTS */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-primary" /> Monthly Commitments</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MONTHLY_TARGETS.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Circle className="h-3 w-3 shrink-0" /> {t}
            </div>
          ))}
        </div>
      </Card>

      {/* 5. QUARTERLY ROADMAP (milestones) */}
      <div>
        <h3 className="mb-3 text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Quarterly Roadmap — 12 Month Plan</h3>
        <div className="grid gap-3 sm:grid-cols-4 mb-4">
          <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p><p className="text-xl font-bold">{stats.total}</p></Card>
          <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Completed</p><p className="text-xl font-bold text-primary">{stats.completed}</p></Card>
          <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">In Progress</p><p className="text-xl font-bold text-amber-400">{stats.inProgress}</p></Card>
          <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Not Started</p><p className="text-xl font-bold text-muted-foreground">{stats.notStarted}</p></Card>
        </div>
        <div className="space-y-4">
          {quarters.map(q => {
            const qMilestones = milestones.filter((m: Milestone) => m.quarter === q);
            const qDone = qMilestones.filter((m: Milestone) => m.status === "COMPLETED").length;
            return (
              <Card key={q} className={`border-l-4 p-5 ${QUARTER_COLORS[q]}`}>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold">Q{q}: {QUARTER_NAMES[q]}</h4>
                    <p className="text-xs text-muted-foreground">{qDone} of {qMilestones.length} completed</p>
                  </div>
                  <div className="w-24"><MiniBar value={qDone} max={qMilestones.length} /></div>
                </div>
                <div className="space-y-2">
                  {qMilestones.map((m: Milestone) => (
                    <div key={m.id} className={`rounded-lg border p-3 ${m.status === "COMPLETED" ? "border-primary/20 bg-primary/5" : "border-border"}`}>
                      <div className="flex items-start gap-3">
                        <button onClick={() => updateMilestone(m.id, m.status)} className="mt-0.5 shrink-0">{STATUS_ICONS[m.status]}</button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-medium ${m.status === "COMPLETED" ? "text-muted-foreground line-through" : ""}`}>{m.title}</p>
                            <Badge variant="outline" className="text-[10px]">{m.category}</Badge>
                            {m.dueMonth && <span className="text-[10px] text-muted-foreground">Month {m.dueMonth}</span>}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
                          {m.deliverable && <p className="mt-1 text-xs"><span className="font-semibold text-primary">Deliverable:</span> <span className="text-muted-foreground">{m.deliverable}</span></p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 6. QUARTERLY RETREAT */}
      <Card className="border-l-4 border-l-amber-500/50 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Lightbulb className="h-4 w-4 text-amber-400" /> Quarterly CEO Retreat</div>
        <p className="mb-3 text-xs text-muted-foreground">Take one day away from the office. Answer only these questions:</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {["What generated the most revenue?", "What wasted the most time?", "Which clients should we stop serving?", "Which clients should we pursue?", "What should be automated?", "What should be delegated?", "What new service should we launch?", "What product should we build?"].map((q, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {q}</p>
          ))}
        </div>
      </Card>

      {/* 7. ECOSYSTEM VISION (yearly/end state) */}
      <div>
        <h3 className="mb-3 text-sm font-semibold flex items-center gap-2"><Moon className="h-4 w-4 text-violet-400" /> Year-End Vision — The Ecosystem</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {ECOSYSTEM.map(e => (
            <Card key={e.name} className={`border-l-4 p-4 ${e.color}`}>
              <div className="flex items-center gap-2 mb-1">{e.icon}<h4 className="text-sm font-semibold">{e.name}</h4></div>
              <p className="text-xs text-muted-foreground">{e.desc}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
