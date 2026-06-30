"use client";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  GraduationCap,
  Target,
  CheckCircle2,
  Circle,
  Clock,
  TrendingUp,
  Megaphone,
  Calendar,
  Users,
  AlertCircle,
  Loader2,
  Send,
  Plus,
  Pencil,
  Trash2,
  UserPlus,
  CalendarClock,
} from "lucide-react";
import { SectionHeader, EmptyState, MiniBar } from "@/components/doz/ui-primitives";
import { formatDate, relativeTime, avatarColor } from "@/lib/format";
import { useCurrentUser } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================
interface Milestone {
  id: string;
  track: string;
  monthStart: number;
  monthEnd: number;
  phase: string;
  title: string;
  description: string;
  deliverable: string | null;
  kpi: string | null;
  status: string;
  assigneeId: string | null;
  completedAt: string | null;
}

interface InternSummary {
  id: string;
  name: string;
  title: string | null;
}

interface Track {
  name: string;
  intern: InternSummary | null;
  milestones: Milestone[];
  progress: { total: number; completed: number; inProgress: number; pct: number };
  graduationRole: string;
}

interface Standup {
  id: string;
  userId: string;
  date: string;
  yesterday: string;
  today: string;
  blockers: string | null;
}

interface InternshipData {
  currentMonth: number;
  programStartsAt: string;
  hasStarted: boolean;
  tracks: {
    OPERATIONS_GROWTH: Track;
    CONTENT_BRAND: Track;
  };
  interns: InternSummary[];
  roadmap: Record<number, { ops: Milestone[]; content: Milestone[] }>;
  recentStandups: Standup[];
}

const STATUS_STYLES: Record<string, string> = {
  NOT_STARTED: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-amber-500/15 text-amber-400",
  COMPLETED: "bg-primary/15 text-primary",
  OVERDUE: "bg-destructive/15 text-destructive",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  NOT_STARTED: <Circle className="h-3.5 w-3.5" />,
  IN_PROGRESS: <Clock className="h-3.5 w-3.5" />,
  COMPLETED: <CheckCircle2 className="h-3.5 w-3.5" />,
  OVERDUE: <AlertCircle className="h-3.5 w-3.5" />,
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function InternshipProgram() {
  const { user: currentUser } = useCurrentUser();
  const [data, setData] = useState<InternshipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [standupYesterday, setStandupYesterday] = useState("");
  const [standupToday, setStandupToday] = useState("");
  const [standupBlockers, setStandupBlockers] = useState("");
  const [submittingStandup, setSubmittingStandup] = useState(false);

  // Edit mode + dialog state
  const [editMode, setEditMode] = useState(false);
  const [addInternOpen, setAddInternOpen] = useState(false);
  const [addMilestoneFor, setAddMilestoneFor] = useState<string | null>(null); // track key
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [deletingMilestone, setDeletingMilestone] = useState<Milestone | null>(null);

  const isFounder = currentUser?.role === "FOUNDER";

  async function load() {
    try {
      const res = await fetch("/api/doz/internship");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json);
    } catch {
      toast.error("Couldn't load internship programme");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function postAction(body: any, successMsg: string): Promise<boolean> {
    try {
      const res = await fetch("/api/doz/internship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `status_${res.status}`);
      }
      toast.success(successMsg);
      load();
      return true;
    } catch (e: any) {
      toast.error("Action failed", { description: e?.message });
      return false;
    }
  }

  async function updateMilestone(id: string, status: string) {
    await postAction(
      { action: "update_milestone", milestoneId: id, status },
      status === "COMPLETED" ? "Milestone completed ✓" : "Status updated"
    );
  }

  async function submitStandup(e: React.FormEvent) {
    e.preventDefault();
    if (!standupYesterday.trim() || !standupToday.trim()) {
      toast.error("Please fill in what you did yesterday and what you're doing today");
      return;
    }
    setSubmittingStandup(true);
    try {
      const res = await fetch("/api/doz/internship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_standup",
          yesterday: standupYesterday,
          today: standupToday,
          blockers: standupBlockers || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Standup submitted ✓");
      setStandupYesterday("");
      setStandupToday("");
      setStandupBlockers("");
      load();
    } catch {
      toast.error("Failed to submit standup");
    } finally {
      setSubmittingStandup(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const ops = data.tracks.OPERATIONS_GROWTH;
  const content = data.tracks.CONTENT_BRAND;
  const currentMonth = data.currentMonth;
  const hasStarted = data.hasStarted;
  const startDateLabel = "July 6";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          icon={<GraduationCap className="h-5 w-5" />}
          title="NJFP Internship Programme"
          description="12-month structured development — building the first layer of management"
        />
        {isFounder && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-1.5">
              <Switch checked={editMode} onCheckedChange={setEditMode} id="edit-mode" />
              <Label htmlFor="edit-mode" className="cursor-pointer text-xs font-medium">
                Edit Mode
              </Label>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddInternOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" /> Add Intern
            </Button>
          </div>
        )}
      </div>

      {/* Programme Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Current Month</p>
          {hasStarted ? (
            <>
              <p className="mt-1 text-2xl font-semibold">Month {currentMonth}</p>
              <p className="text-xs text-muted-foreground">of 12</p>
            </>
          ) : (
            <>
              <p className="mt-1 flex items-center gap-1.5 text-base font-semibold text-amber-400">
                <CalendarClock className="h-4 w-4" /> Starts {startDateLabel}
              </p>
              <p className="text-xs text-muted-foreground">Programme hasn't started yet</p>
            </>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Ops & Growth Progress</p>
          <p className="mt-1 text-2xl font-semibold text-primary">{ops.progress.pct}%</p>
          <MiniBar value={ops.progress.completed} max={ops.progress.total} />
          <p className="mt-1 text-xs text-muted-foreground">{ops.progress.completed}/{ops.progress.total} milestones</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Content & Brand Progress</p>
          <p className="mt-1 text-2xl font-semibold text-primary">{content.progress.pct}%</p>
          <MiniBar value={content.progress.completed} max={content.progress.total} />
          <p className="mt-1 text-xs text-muted-foreground">{content.progress.completed}/{content.progress.total} milestones</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Year 1 Goal</p>
          <p className="mt-1 text-sm font-semibold leading-snug">Founder-led → Systems-driven company</p>
          <p className="mt-1 text-xs text-muted-foreground">By Month 12, take a 2-week vacation</p>
        </Card>
      </div>

      <Tabs defaultValue="roadmap">
        <TabsList>
          <TabsTrigger value="roadmap">12-Month Roadmap</TabsTrigger>
          <TabsTrigger value="ops">Operations & Growth</TabsTrigger>
          <TabsTrigger value="content">Content & Brand</TabsTrigger>
          <TabsTrigger value="standup">Daily Standup</TabsTrigger>
        </TabsList>

        {/* Roadmap Tab */}
        <TabsContent value="roadmap" className="space-y-4">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Calendar className="h-4 w-4 text-primary" />
              12-Month Roadmap
            </div>
            {!hasStarted && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3 text-xs text-amber-400">
                <CalendarClock className="h-4 w-4" />
                Programme kicks off <span className="font-semibold">July 6</span>. Months below show the planned track.
              </div>
            )}
            <div className="space-y-3">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                const monthData = data.roadmap[month];
                const isCurrent = hasStarted && month === currentMonth;
                const isPast = hasStarted && month < currentMonth;
                const isFuture = !hasStarted || month > currentMonth;
                const totalMs = monthData.ops.length + monthData.content.length;
                const doneMs = [...monthData.ops, ...monthData.content].filter((m) => m.status === "COMPLETED").length;

                return (
                  <div
                    key={month}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      isCurrent
                        ? "border-primary/40 bg-primary/5"
                        : isPast
                          ? "border-border opacity-60"
                          : "border-border"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          isCurrent
                            ? "bg-primary text-primary-foreground"
                            : isPast
                              ? "bg-muted text-muted-foreground"
                              : "bg-muted/50 text-muted-foreground"
                        )}
                      >
                        {month}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">Month {month}</p>
                          {isCurrent && <Badge className="bg-primary/20 text-primary text-[10px]">CURRENT</Badge>}
                          {isPast && <Badge variant="outline" className="text-[10px]">PAST</Badge>}
                          {isFuture && hasStarted && <Badge variant="outline" className="text-[10px] text-muted-foreground">UPCOMING</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {totalMs} milestones · {doneMs} completed
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {monthData.ops.length > 0 && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <TrendingUp className="h-2.5 w-2.5" /> {monthData.ops.length}
                          </Badge>
                        )}
                        {monthData.content.length > 0 && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <Megaphone className="h-2.5 w-2.5" /> {monthData.content.length}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {(monthData.ops.length > 0 || monthData.content.length > 0) && (
                      <div className="mt-2 grid gap-1.5 pl-11 sm:grid-cols-2">
                        {monthData.ops.map((m) => (
                          <div key={m.id} className="flex items-center gap-1.5 text-xs">
                            <span className={m.status === "COMPLETED" ? "text-primary" : "text-muted-foreground"}>
                              {STATUS_ICONS[m.status]}
                            </span>
                            <span className={m.status === "COMPLETED" ? "text-muted-foreground line-through" : "text-foreground/80"}>
                              {m.title}
                            </span>
                          </div>
                        ))}
                        {monthData.content.map((m) => (
                          <div key={m.id} className="flex items-center gap-1.5 text-xs">
                            <span className={m.status === "COMPLETED" ? "text-primary" : "text-muted-foreground"}>
                              {STATUS_ICONS[m.status]}
                            </span>
                            <span className={m.status === "COMPLETED" ? "text-muted-foreground line-through" : "text-foreground/80"}>
                              {m.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        {/* Operations & Growth Tab */}
        <TabsContent value="ops" className="space-y-4">
          <TrackDetail
            track={ops}
            icon={<TrendingUp className="h-5 w-5" />}
            onUpdate={updateMilestone}
            editMode={editMode && isFounder}
            onAddMilestone={() => setAddMilestoneFor("OPERATIONS_GROWTH")}
            onEditMilestone={(m) => setEditingMilestone(m)}
            onDeleteMilestone={(m) => setDeletingMilestone(m)}
            interns={data.interns}
          />
        </TabsContent>

        {/* Content & Brand Tab */}
        <TabsContent value="content" className="space-y-4">
          <TrackDetail
            track={content}
            icon={<Megaphone className="h-5 w-5" />}
            onUpdate={updateMilestone}
            editMode={editMode && isFounder}
            onAddMilestone={() => setAddMilestoneFor("CONTENT_BRAND")}
            onEditMilestone={(m) => setEditingMilestone(m)}
            onDeleteMilestone={(m) => setDeletingMilestone(m)}
            interns={data.interns}
          />
        </TabsContent>

        {/* Daily Standup Tab */}
        <TabsContent value="standup" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Send className="h-4 w-4 text-primary" />
                Submit Daily Standup
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                Quick 10-minute daily check-in. What did you do yesterday? What are you doing today? Any blockers?
              </p>
              <form onSubmit={submitStandup} className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Yesterday — what I completed</Label>
                  <Textarea
                    value={standupYesterday}
                    onChange={(e) => setStandupYesterday(e.target.value)}
                    placeholder="What did you finish yesterday?"
                    rows={3}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Today — what I'm working on</Label>
                  <Textarea
                    value={standupToday}
                    onChange={(e) => setStandupToday(e.target.value)}
                    placeholder="What are you doing today?"
                    rows={3}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Blockers (optional)</Label>
                  <Textarea
                    value={standupBlockers}
                    onChange={(e) => setStandupBlockers(e.target.value)}
                    placeholder="Any obstacles? Where do you need help?"
                    rows={2}
                    className="text-sm"
                  />
                </div>
                <Button type="submit" disabled={submittingStandup} className="w-full">
                  {submittingStandup ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Submit Standup</>}
                </Button>
              </form>
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-primary" />
                Recent Standups
              </div>
              {data.recentStandups.length === 0 ? (
                <EmptyState icon={<Clock className="h-6 w-6" />} title="No standups yet" hint="Submit your first standup using the form." />
              ) : (
                <div className="scroll-thin max-h-96 space-y-3 overflow-y-auto">
                  {data.recentStandups.map((s) => (
                    <div key={s.id} className="rounded-lg border border-border p-3">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">
                        {formatDate(s.date)} · {relativeTime(s.date)}
                      </p>
                      <div className="space-y-1.5 text-xs">
                        <p><span className="font-semibold text-emerald-400">Yesterday:</span> <span className="text-muted-foreground">{s.yesterday}</span></p>
                        <p><span className="font-semibold text-teal-400">Today:</span> <span className="text-muted-foreground">{s.today}</span></p>
                        {s.blockers && (
                          <p><span className="font-semibold text-amber-400">Blockers:</span> <span className="text-muted-foreground">{s.blockers}</span></p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Weekly Workflow Card */}
      <Card className="border-l-4 border-l-primary p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" />
          Weekly Workflow
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-xs font-semibold text-primary">Monday (30 min)</p>
            <p className="mt-1 text-xs text-muted-foreground">Team Meeting: What did I finish? What will I deliver? Blockers?</p>
          </div>
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-xs font-semibold text-primary">Daily (10 min)</p>
            <p className="mt-1 text-xs text-muted-foreground">Quick standup: Yesterday, Today, Blockers</p>
          </div>
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-xs font-semibold text-primary">Friday (45 min)</p>
            <p className="mt-1 text-xs text-muted-foreground">Review: leads found, SOPs done, posts published, case studies, opportunities</p>
          </div>
        </div>
      </Card>

      {/* Three Golden Rules */}
      <Card className="border-l-4 border-l-amber-500/50 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-amber-400" />
          The Three Golden Rules
        </div>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p><span className="font-semibold text-foreground">Rule 1:</span> Never give a task you haven't explained. Teach first.</p>
          <p><span className="font-semibold text-foreground">Rule 2:</span> Every task must create an asset — not just "do work."</p>
          <p><span className="font-semibold text-foreground">Rule 3:</span> By Month 12, the business runs without you for 2 weeks.</p>
        </div>
      </Card>

      {/* ============================== Dialogs ============================== */}
      <AddInternDialog
        open={addInternOpen}
        onOpenChange={setAddInternOpen}
        onSubmit={async (payload) => {
          const ok = await postAction(
            { action: "add_intern", ...payload },
            `${payload.name} added as an intern ✓`
          );
          if (ok) setAddInternOpen(false);
        }}
      />

      <MilestoneFormDialog
        key={`add-${addMilestoneFor ?? "none"}`}
        open={!!addMilestoneFor}
        trackKey={addMilestoneFor}
        milestone={null}
        interns={data.interns}
        onOpenChange={(open) => !open && setAddMilestoneFor(null)}
        onSubmit={async (payload) => {
          if (!addMilestoneFor) return;
          const ok = await postAction(
            { action: "add_milestone", track: addMilestoneFor, ...payload },
            "Milestone added ✓"
          );
          if (ok) setAddMilestoneFor(null);
        }}
      />

      <MilestoneFormDialog
        key={`edit-${editingMilestone?.id ?? "none"}`}
        open={!!editingMilestone}
        trackKey={editingMilestone?.track ?? null}
        milestone={editingMilestone}
        interns={data.interns}
        onOpenChange={(open) => !open && setEditingMilestone(null)}
        onSubmit={async (payload) => {
          if (!editingMilestone) return;
          const ok = await postAction(
            { action: "edit_milestone", milestoneId: editingMilestone.id, ...payload },
            "Milestone updated ✓"
          );
          if (ok) setEditingMilestone(null);
        }}
      />

      <DeleteMilestoneDialog
        milestone={deletingMilestone}
        onOpenChange={(open) => !open && setDeletingMilestone(null)}
        onConfirm={async () => {
          if (!deletingMilestone) return;
          const ok = await postAction(
            { action: "delete_milestone", milestoneId: deletingMilestone.id },
            "Milestone deleted"
          );
          if (ok) setDeletingMilestone(null);
        }}
      />
    </div>
  );
}

// ============================================================
// Track Detail Component
// ============================================================
interface TrackDetailProps {
  track: Track;
  icon: React.ReactNode;
  onUpdate: (id: string, status: string) => void;
  editMode: boolean;
  onAddMilestone: () => void;
  onEditMilestone: (m: Milestone) => void;
  onDeleteMilestone: (m: Milestone) => void;
  interns: InternSummary[];
}

function TrackDetail({
  track,
  icon,
  onUpdate,
  editMode,
  onAddMilestone,
  onEditMilestone,
  onDeleteMilestone,
}: TrackDetailProps) {
  // Group milestones by phase
  const phases: Record<string, Milestone[]> = {};
  for (const m of track.milestones) {
    if (!phases[m.phase]) phases[m.phase] = [];
    phases[m.phase].push(m);
  }

  return (
    <Card className="p-5">
      {/* Prominent intern header */}
      <div className="mb-4 flex flex-wrap items-start gap-4 border-b border-border pb-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{track.name}</h3>
            <Badge className="bg-primary/15 text-primary">
              <GraduationCap className="mr-1 h-3 w-3" />
              Graduates as {track.graduationRole}
            </Badge>
          </div>
          {track.intern ? (
            <div className="mt-2 flex items-center gap-2.5">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold",
                  avatarColor(track.intern.name)
                )}
              >
                {initials(track.intern.name)}
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">{track.intern.name}</p>
                {track.intern.title && (
                  <p className="text-xs text-muted-foreground">{track.intern.title}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No intern assigned to this track yet.</p>
          )}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1">
              <MiniBar value={track.progress.completed} max={track.progress.total} />
            </div>
            <span className="text-xs font-semibold text-primary">{track.progress.pct}%</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {track.progress.completed} of {track.progress.total} milestones completed
          </p>
        </div>
        {editMode && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onAddMilestone}>
            <Plus className="h-3.5 w-3.5" /> Add Milestone
          </Button>
        )}
      </div>

      {/* Milestones by phase */}
      {track.milestones.length === 0 ? (
        <EmptyState
          icon={<Target className="h-6 w-6" />}
          title="No milestones yet"
          hint={editMode ? "Use 'Add Milestone' to start building the track." : "Toggle Edit Mode to add milestones."}
        />
      ) : (
        <div className="space-y-5">
          {Object.entries(phases).map(([phase, milestones]) => (
            <div key={phase}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{phase}</p>
              <div className="space-y-2">
                {milestones.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      m.status === "COMPLETED" ? "border-primary/20 bg-primary/5" : "border-border"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => {
                          const next =
                            m.status === "COMPLETED"
                              ? "IN_PROGRESS"
                              : m.status === "IN_PROGRESS"
                                ? "COMPLETED"
                                : "IN_PROGRESS";
                          onUpdate(m.id, next);
                        }}
                        className="mt-0.5 shrink-0"
                        title="Click to cycle status"
                      >
                        <span
                          className={cn(
                            m.status === "COMPLETED"
                              ? "text-primary"
                              : m.status === "IN_PROGRESS"
                                ? "text-amber-400"
                                : "text-muted-foreground"
                          )}
                        >
                          {STATUS_ICONS[m.status]}
                        </span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={cn("text-sm font-medium", m.status === "COMPLETED" && "text-muted-foreground line-through")}>
                            {m.title}
                          </p>
                          <Badge className={cn("text-[10px]", STATUS_STYLES[m.status])}>
                            {m.status.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            Month {m.monthStart}
                            {m.monthEnd !== m.monthStart ? `-${m.monthEnd}` : ""}
                          </span>
                          {editMode && (
                            <span className="ml-auto flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => onEditMilestone(m)}
                                title="Edit milestone"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => onDeleteMilestone(m)}
                                title="Delete milestone"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
                        {m.deliverable && (
                          <p className="mt-1.5 text-xs">
                            <span className="font-semibold text-primary">Deliverable:</span>{" "}
                            <span className="text-muted-foreground">{m.deliverable}</span>
                          </p>
                        )}
                        {m.kpi && (
                          <p className="mt-0.5 text-xs">
                            <span className="font-semibold text-amber-400">KPI:</span>{" "}
                            <span className="text-muted-foreground">{m.kpi}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ============================================================
// Add Intern Dialog
// ============================================================
interface AddInternPayload {
  name: string;
  email: string;
  track: string;
  graduationRole: string;
  password: string;
}

function AddInternDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: AddInternPayload) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [track, setTrack] = useState("OPERATIONS_GROWTH");
  const [graduationRole, setGraduationRole] = useState("Junior Operations Manager");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleTrackChange(t: string) {
    setTrack(t);
    setGraduationRole(t === "OPERATIONS_GROWTH" ? "Junior Operations Manager" : "Brand & Marketing Associate");
  }

  async function handleSubmit() {
    if (!name.trim()) return toast.error("Name is required");
    if (!email.trim()) return toast.error("Email is required");
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setSubmitting(true);
    await onSubmit({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      track,
      graduationRole: graduationRole.trim(),
      password,
    });
    setSubmitting(false);
    setName("");
    setEmail("");
    setPassword("");
    setTrack("OPERATIONS_GROWTH");
    setGraduationRole("Junior Operations Manager");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Intern</DialogTitle>
          <DialogDescription>
            Creates a new user with role INTERN and assigns them to a track. The intern can log in with this email + password.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Full name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Akpala Arome"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Email (login)</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="intern@digitonezero.com"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Track</Label>
            <Select value={track} onValueChange={handleTrackChange}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPERATIONS_GROWTH">Operations & Growth</SelectItem>
                <SelectItem value="CONTENT_BRAND">Content & Brand</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Graduation role</Label>
            <Input
              value={graduationRole}
              onChange={(e) => setGraduationRole(e.target.value)}
              placeholder="e.g. Junior Operations Manager"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Password (min 6 chars)</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Set their login password"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add Intern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Milestone Add/Edit Dialog
// ============================================================
interface MilestonePayload {
  title: string;
  phase: string;
  description: string;
  monthStart: number;
  monthEnd: number;
  deliverable: string;
  kpi: string;
  assigneeId: string;
}

function MilestoneFormDialog({
  open,
  trackKey,
  milestone,
  interns,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  trackKey: string | null;
  milestone: Milestone | null;
  interns: InternSummary[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: MilestonePayload) => Promise<void>;
}) {
  const isEdit = !!milestone;
  // Initial state derived from the milestone prop. Because the parent remounts
  // this component via `key` when the milestone changes, these run once per edit
  // target — no need for a sync-effect that would trigger cascading renders.
  const [title, setTitle] = useState(milestone?.title ?? "");
  const [phase, setPhase] = useState(milestone?.phase ?? "");
  const [description, setDescription] = useState(milestone?.description ?? "");
  const [monthStart, setMonthStart] = useState(String(milestone?.monthStart ?? 1));
  const [monthEnd, setMonthEnd] = useState(String(milestone?.monthEnd ?? 1));
  const [deliverable, setDeliverable] = useState(milestone?.deliverable ?? "");
  const [kpi, setKpi] = useState(milestone?.kpi ?? "");
  const [assigneeId, setAssigneeId] = useState(milestone?.assigneeId ?? "__none__");
  const [submitting, setSubmitting] = useState(false);

  const trackInterns = interns.filter((i) =>
    trackKey === "OPERATIONS_GROWTH"
      ? (i.title ?? "").toLowerCase().includes("operation")
      : (i.title ?? "").toLowerCase().includes("content") || (i.title ?? "").toLowerCase().includes("brand")
  );

  async function handleSubmit() {
    if (!title.trim()) return toast.error("Title is required");
    if (!phase.trim()) return toast.error("Phase is required");
    setSubmitting(true);
    await onSubmit({
      title: title.trim(),
      phase: phase.trim(),
      description: description.trim(),
      monthStart: Number(monthStart),
      monthEnd: Number(monthEnd),
      deliverable: deliverable.trim(),
      kpi: kpi.trim(),
      assigneeId: assigneeId === "__none__" ? "" : assigneeId,
    });
    setSubmitting(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Milestone" : "Add Milestone"}</DialogTitle>
          <DialogDescription>
            {trackKey === "OPERATIONS_GROWTH" ? "Operations & Growth track" : "Content & Brand track"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Build Client Database"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Phase</Label>
            <Input
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              placeholder="e.g. Learn the Business"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What should the intern do?"
              rows={2}
              className="mt-1 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Month start (1-12)</Label>
              <Select value={monthStart} onValueChange={(v) => { setMonthStart(v); if (Number(v) > Number(monthEnd)) setMonthEnd(v); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                    <SelectItem key={m} value={m}>Month {m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Month end (1-12)</Label>
              <Select value={monthEnd} onValueChange={setMonthEnd}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                    <SelectItem key={m} value={m}>Month {m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Deliverable (optional)</Label>
            <Input
              value={deliverable}
              onChange={(e) => setDeliverable(e.target.value)}
              placeholder="What they produce"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">KPI (optional)</Label>
            <Input
              value={kpi}
              onChange={(e) => setKpi(e.target.value)}
              placeholder="e.g. 100 companies added"
              className="mt-1"
            />
          </div>
          {trackInterns.length > 0 && (
            <div>
              <Label className="text-xs">Assign to</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— unassigned —</SelectItem>
                  {trackInterns.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}{i.title ? ` · ${i.title}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? "Save Changes" : "Add Milestone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Delete Milestone Confirmation
// ============================================================
function DeleteMilestoneDialog({
  milestone,
  onOpenChange,
  onConfirm,
}: {
  milestone: Milestone | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  }

  return (
    <Dialog open={!!milestone} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete milestone?</DialogTitle>
          <DialogDescription>
            This will permanently remove the milestone
            {milestone ? ` "${milestone.title}"` : ""}. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={deleting} className="gap-2">
            {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
