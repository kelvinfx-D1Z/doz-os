"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Smartphone,
  Clock,
  ClipboardCheck,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Send,
  Wifi,
  WifiOff,
  Loader2,
  Calendar,
  MapPin,
  ChevronRight,
  FileText,
  AlertTriangle,
  RefreshCw,
  Target,
  Briefcase,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { MiniBar, EmptyState } from "@/components/doz/ui-primitives";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatDate, relativeTime } from "@/lib/format";
import { toast } from "sonner";

// ============================================================
// Field Mode (DOZ OS — Phase 4, Task P4-A)
// Mobile-first on-site experience:
//   - Quick daily report filing (≤30s)
//   - Offline-capable event day run-sheet
// ============================================================

type Mood = "GREAT" | "OK" | "STRESSED";

type ApiProject = {
  id: string;
  name: string;
  code: string | null;
  eventDate: string | null;
  venue: string | null;
  serviceType: string;
  status: string;
  role: string;
  milestones: {
    id: string;
    title: string;
    dueDate: string;
    status: string;
    completedAt: string | null;
  }[];
};

type ApiTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  project: { name: string } | null;
};

type ApiData = {
  user: { id: string; name: string; role: string; title: string | null };
  myTasks: ApiTask[];
  myProjects: ApiProject[];
  todayReport: {
    id: string;
    tasksDone: string;
    tasksPlanned: string | null;
    blockers: string | null;
    hoursWorked: number;
    mood: string | null;
    reportDate: string;
  } | null;
  crewAssignments: {
    id: string;
    projectName: string;
    role: string;
    status: string;
    dayRate: number;
  }[];
};

type View = "home" | "report" | "projects" | "runsheet";

// ---- localStorage types -----------------------------------------
type TemplateItem = { label: string; done: boolean; completedAt: string | null };
type QueueItem = { milestoneId: string; done: boolean; timestamp: number };

// Standard event-day checklist template (not in DB; localStorage only)
const EVENT_DAY_TEMPLATE: string[] = [
  "Crew call confirmed",
  "Equipment loaded & verified",
  "Venue access confirmed",
  "Power/generator confirmed",
  "Sound check complete",
  "Lighting check complete",
  "Camera positions locked",
  "Client briefing done",
  "Livestream test (if applicable)",
  "Doors open",
  "Event wrap & handover",
];

const MOOD_OPTIONS: { value: Mood; emoji: string; label: string }[] = [
  { value: "GREAT", emoji: "😄", label: "Great" },
  { value: "OK", emoji: "😐", label: "OK" },
  { value: "STRESSED", emoji: "😟", label: "Stressed" },
];

// ---- localStorage helpers ---------------------------------------
const TEMPLATE_KEY = (pid: string) => `doz-run-sheet-${pid}`;
const QUEUE_KEY = (pid: string) => `doz-run-sheet-queue-${pid}`;

function loadTemplate(projectId: string): TemplateItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TEMPLATE_KEY(projectId));
    if (!raw) {
      // Initialize from the standard template (none done)
      const init: TemplateItem[] = EVENT_DAY_TEMPLATE.map((label) => ({
        label,
        done: false,
        completedAt: null,
      }));
      window.localStorage.setItem(TEMPLATE_KEY(projectId), JSON.stringify(init));
      return init;
    }
    return JSON.parse(raw) as TemplateItem[];
  } catch {
    return [];
  }
}

function saveTemplate(projectId: string, items: TemplateItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEMPLATE_KEY(projectId), JSON.stringify(items));
  } catch {
    /* noop */
  }
}

function loadQueue(projectId: string): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY(projectId));
    if (!raw) return [];
    return JSON.parse(raw) as QueueItem[];
  } catch {
    return [];
  }
}

function saveQueue(projectId: string, items: QueueItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUEUE_KEY(projectId), JSON.stringify(items));
  } catch {
    /* noop */
  }
}

function formatTime(iso: string | number | Date | null): string {
  if (!iso) return "";
  try {
    const d = typeof iso === "string" || typeof iso === "number" ? new Date(iso) : iso;
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// ============================================================
// Main component
// ============================================================
export function FieldMode() {
  const { user, status } = useCurrentUser();
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");
  const [selectedProject, setSelectedProject] = useState<ApiProject | null>(null);
  const [online, setOnline] = useState(true);

  // Initial data fetch
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/doz/field", { cache: "no-store" });
      if (res.status === 401) {
        setError("Please sign in to access Field Mode.");
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ApiData;
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load field data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      void reload();
    } else if (status === "unauthenticated") {
      setError("Please sign in to access Field Mode.");
      setLoading(false);
    }
  }, [status, reload]);

  // Online/offline detection
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      toast.success("Back online — syncing queued updates", { duration: 2500 });
    };
    const goOffline = () => {
      setOnline(false);
      toast.warning("You're offline — changes saved locally", { duration: 2500 });
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ============================================================
  // Loading state
  // ============================================================
  if (status === "loading" || (loading && !data)) {
    return (
      <div className="mx-auto max-w-md px-4 py-6">
        <FieldHeaderSkeleton />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <EmptyState
          icon={<AlertTriangle className="size-8" />}
          title="Couldn't load Field Mode"
          hint={error}
        />
        <Button onClick={() => void reload()} variant="outline" className="mt-4 w-full min-h-12">
          <RefreshCw className="size-4" /> Try again
        </Button>
      </div>
    );
  }

  const userName = user?.name ?? data?.user.name ?? "there";
  const userTitle = user?.title ?? data?.user.title ?? null;

  // ============================================================
  // VIEW ROUTER
  // ============================================================
  return (
    <div className="mx-auto max-w-md px-4 py-6">
      {/* HEADER */}
      <header className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Smartphone className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Field Mode</h1>
          <p className="text-sm text-muted-foreground">On-site tools for fast reporting & event execution</p>
        </div>
      </header>

      {/* USER BANNER */}
      <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-border bg-card/50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {(userName || "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {userTitle ?? data?.user.role}
            </p>
          </div>
        </div>
        <OnlineBadge online={online} />
      </div>

      {/* VIEW CONTENT */}
      <div className="mt-5">
        {view === "home" && (
          <HomeView
            data={data!}
            onOpenReport={() => setView("report")}
            onOpenRunSheet={() => setView("projects")}
          />
        )}

        {view === "report" && (
          <ReportView
            data={data!}
            onBack={() => setView("home")}
            onSubmitted={() => void reload()}
            online={online}
          />
        )}

        {view === "projects" && (
          <ProjectsView
            data={data!}
            onBack={() => setView("home")}
            onOpenProject={(p) => {
              setSelectedProject(p);
              setView("runsheet");
            }}
          />
        )}

        {view === "runsheet" && selectedProject && (
          <RunSheetView
            project={selectedProject}
            onBack={() => setView("projects")}
            online={online}
            onOnlineSyncDone={() => void reload()}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Online badge
// ============================================================
function OnlineBadge({ online }: { online: boolean }) {
  return online ? (
    <Badge className="gap-1 border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
      <Wifi className="size-3" /> Online
    </Badge>
  ) : (
    <Badge className="gap-1 border border-amber-500/30 bg-amber-500/10 text-amber-400">
      <WifiOff className="size-3" /> Offline
    </Badge>
  );
}

// ============================================================
// HOME VIEW — two big feature cards
// ============================================================
function HomeView({
  data,
  onOpenReport,
  onOpenRunSheet,
}: {
  data: ApiData;
  onOpenReport: () => void;
  onOpenRunSheet: () => void;
}) {
  const reportFiled = !!data.todayReport;
  const openTasks = data.myTasks.length;
  const activeProjects = data.myProjects.length;

  return (
    <div className="space-y-4">
      {/* Quick stats strip */}
      <div className="grid grid-cols-3 gap-2">
        <QuickStat
          icon={<ClipboardCheck className="size-3.5" />}
          label="Projects"
          value={activeProjects}
        />
        <QuickStat icon={<Target className="size-3.5" />} label="Tasks" value={openTasks} />
        <QuickStat
          icon={<CheckCircle2 className="size-3.5" />}
          label="Report"
          value={reportFiled ? "Filed" : "—"}
          tone={reportFiled ? "primary" : "muted"}
        />
      </div>

      {/* File Daily Report card */}
      <button
        onClick={onOpenReport}
        className="group w-full text-left"
        aria-label="File Daily Report"
      >
        <Card className="relative overflow-hidden p-5 transition-all hover:border-primary/40 hover:bg-accent/30 min-h-[124px]">
          <div className="absolute right-4 top-4 text-primary/40 transition-transform group-hover:translate-x-1">
            <ChevronRight className="size-5" />
          </div>
          <div className="flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
              <Clock className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">File Daily Report</h3>
                {reportFiled && (
                  <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                    Filed ✓
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Submit your EOD report in 30 seconds
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {reportFiled
                  ? "Tap to view or update today's report"
                  : "Today's report is pending — tap to file now"}
              </p>
            </div>
          </div>
        </Card>
      </button>

      {/* Event Run-Sheet card */}
      <button
        onClick={onOpenRunSheet}
        className="group w-full text-left"
        aria-label="Event Run-Sheet"
      >
        <Card className="relative overflow-hidden p-5 transition-all hover:border-primary/40 hover:bg-accent/30 min-h-[124px]">
          <div className="absolute right-4 top-4 text-primary/40 transition-transform group-hover:translate-x-1">
            <ChevronRight className="size-5" />
          </div>
          <div className="flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-400">
              <ClipboardCheck className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold">Event Run-Sheet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                On-site checklist for your active events
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {activeProjects > 0
                  ? `${activeProjects} active ${activeProjects === 1 ? "event" : "events"} · works offline`
                  : "No active events assigned yet"}
              </p>
            </div>
          </div>
        </Card>
      </button>

      {/* Open tasks preview (mobile list) */}
      {openTasks > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Target className="size-4 text-primary" /> Your open tasks
            </h3>
            <Badge variant="secondary">{openTasks}</Badge>
          </div>
          <div className="mt-3 max-h-72 overflow-y-auto scroll-thin">
            <ul className="divide-y divide-border">
              {data.myTasks.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-start gap-3 py-2.5">
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{t.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.project?.name ?? "No project"} · {relativeTime(t.dueDate)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
}

function QuickStat({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: "default" | "primary" | "muted";
}) {
  const toneCls =
    tone === "primary"
      ? "text-primary"
      : tone === "muted"
      ? "text-muted-foreground"
      : "";
  return (
    <Card className="p-2.5">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className={`mt-1 text-base font-semibold ${toneCls}`}>{value}</p>
    </Card>
  );
}

// ============================================================
// REPORT VIEW
// ============================================================
function ReportView({
  data,
  onBack,
  onSubmitted,
  online,
}: {
  data: ApiData;
  onBack: () => void;
  onSubmitted: () => void;
  online: boolean;
}) {
  const existing = data.todayReport;
  const [tasksDone, setTasksDone] = useState(existing?.tasksDone ?? "");
  const [tasksPlanned, setTasksPlanned] = useState(existing?.tasksPlanned ?? "");
  const [blockers, setBlockers] = useState(existing?.blockers ?? "");
  const [hoursWorked, setHoursWorked] = useState(existing?.hoursWorked ?? 8);
  const [mood, setMood] = useState<Mood>(
    (existing?.mood as Mood) ?? "OK"
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (!tasksDone.trim()) {
      toast.error("Tell us what you did today");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/doz/field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_report",
          tasksDone,
          tasksPlanned: tasksPlanned.trim() || undefined,
          blockers: blockers.trim() || undefined,
          hoursWorked,
          mood,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      toast.success(existing ? "Report updated ✓" : "Report submitted ✓", { duration: 2500 });
      setSubmitted(true);
      onSubmitted();
    } catch (e: any) {
      toast.error("Failed to submit report", { description: e?.message });
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Confirmation state
  if (submitted) {
    return (
      <div>
        <BackBar onBack={onBack} label="Field Mode" />
        <Card className="mt-4 p-6 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 className="size-8" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Report submitted ✓</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {existing ? "Your daily report has been updated." : "Thanks — your EOD report is filed."}
          </p>

          <div className="mt-5 space-y-3 text-left">
            <SummaryRow label="Hours" value={`${hoursWorked}h`} />
            <SummaryRow label="Mood" value={`${MOOD_OPTIONS.find((m) => m.value === mood)?.emoji ?? ""} ${MOOD_OPTIONS.find((m) => m.value === mood)?.label ?? mood}`} />
            <SummaryRow label="Done today" value={tasksDone.split("\n").filter(Boolean).length + " items"} />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="min-h-12"
              onClick={() => {
                setSubmitted(false);
                setTasksDone("");
                setTasksPlanned("");
                setBlockers("");
                setHoursWorked(8);
                setMood("OK");
              }}
            >
              File another
            </Button>
            <Button className="min-h-12" onClick={onBack}>
              Done
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <BackBar onBack={onBack} label="Field Mode" />

      {existing && (
        <Card className="mt-4 border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-xs font-medium text-emerald-400">
            You already filed today's report
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Submitting again will update it. Last filed: {formatTime(existing.reportDate)} ·{" "}
            {existing.hoursWorked}h · mood {existing.mood ?? "—"}
          </p>
        </Card>
      )}

      <div className="mt-4 space-y-4">
        {/* What did you do today */}
        <Field label="What did you do today?" required>
          <Textarea
            value={tasksDone}
            onChange={(e) => setTasksDone(e.target.value)}
            placeholder="One task per line…"
            className="min-h-24 text-base"
            autoFocus={!existing}
          />
        </Field>

        {/* What's planned tomorrow */}
        <Field label="What's planned for tomorrow?" hint="Optional">
          <Textarea
            value={tasksPlanned}
            onChange={(e) => setTasksPlanned(e.target.value)}
            placeholder="Tomorrow's focus…"
            className="min-h-20 text-base"
          />
        </Field>

        {/* Blockers */}
        <Field label="Any blockers?" hint="Optional">
          <Textarea
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            placeholder="Anything slowing you down?"
            className="min-h-16 text-base"
          />
        </Field>

        {/* Hours worked */}
        <Field label={`Hours worked — ${hoursWorked}h`}>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-12 shrink-0"
              onClick={() => setHoursWorked((h) => Math.max(0, Math.round((h - 1) * 10) / 10))}
              aria-label="Decrease hours"
            >
              −
            </Button>
            <Slider
              value={[hoursWorked]}
              min={0}
              max={12}
              step={0.5}
              onValueChange={(v) => setHoursWorked(v[0] ?? 0)}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-12 shrink-0"
              onClick={() => setHoursWorked((h) => Math.min(12, Math.round((h + 1) * 10) / 10))}
              aria-label="Increase hours"
            >
              +
            </Button>
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>0h</span>
            <span>12h</span>
          </div>
        </Field>

        {/* Mood */}
        <Field label="How do you feel?">
          <div className="grid grid-cols-3 gap-2">
            {MOOD_OPTIONS.map((m) => {
              const selected = mood === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMood(m.value)}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 p-3 transition-all ${
                    selected
                      ? "border-primary bg-primary/10 ring-2 ring-primary"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                  aria-pressed={selected}
                  aria-label={`Mood: ${m.label}`}
                >
                  <span className="text-3xl">{m.emoji}</span>
                  <span className={`text-xs font-medium ${selected ? "text-primary" : "text-muted-foreground"}`}>
                    {m.label}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={submitting || !tasksDone.trim()}
          className="min-h-12 w-full text-base"
          size="lg"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Submitting…
            </>
          ) : (
            <>
              <Send className="size-4" /> {existing ? "Update Report" : "Submit Report"}
            </>
          )}
        </Button>

        {!online && (
          <p className="text-center text-[11px] text-amber-400">
            <WifiOff className="mr-1 inline size-3" />
            You're offline — report will be saved when you reconnect
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="text-sm font-medium">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

// ============================================================
// PROJECTS LIST VIEW
// ============================================================
function ProjectsView({
  data,
  onBack,
  onOpenProject,
}: {
  data: ApiData;
  onBack: () => void;
  onOpenProject: (p: ApiProject) => void;
}) {
  const projects = data.myProjects;

  return (
    <div>
      <BackBar onBack={onBack} label="Field Mode" />

      <div className="mt-4 mb-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ClipboardCheck className="size-4 text-amber-400" /> Your active events
        </h2>
        <p className="text-xs text-muted-foreground">
          Tap a project to open its run-sheet
        </p>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="size-8" />}
          title="No active events assigned"
          hint="You'll see your upcoming events here once you're added to a crew."
        />
      ) : (
        <div className="space-y-3">
          {projects.map((p) => {
            const totalMilestones = p.milestones.length;
            const doneMilestones = p.milestones.filter((m) => m.status === "DONE").length;
            return (
              <button
                key={p.id}
                onClick={() => onOpenProject(p)}
                className="w-full text-left"
                aria-label={`Open run-sheet for ${p.name}`}
              >
                <Card className="relative overflow-hidden p-4 transition-all hover:border-primary/40 hover:bg-accent/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold">{p.name}</h3>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {p.code ?? "—"} · {p.role.replace(/_/g, " ")}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {p.status.replace(/_/g, " ")}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {p.eventDate && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3" /> {formatDate(p.eventDate)}
                      </span>
                    )}
                    {p.venue && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" /> {p.venue}
                      </span>
                    )}
                  </div>

                  {totalMilestones > 0 && (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Milestones</span>
                        <span>
                          {doneMilestones} / {totalMilestones} done
                        </span>
                      </div>
                      <MiniBar
                        value={doneMilestones}
                        max={totalMilestones}
                        color="bg-primary"
                      />
                    </div>
                  )}
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// RUN-SHEET VIEW (single project)
// ============================================================
function RunSheetView({
  project,
  onBack,
  online,
  onOnlineSyncDone,
}: {
  project: ApiProject;
  onBack: () => void;
  online: boolean;
  onOnlineSyncDone: () => void;
}) {
  // We keep an internal copy of milestones so we can optimistically toggle.
  const [milestones, setMilestones] = useState(project.milestones);
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Hydrate from localStorage on mount + when project changes
  useEffect(() => {
    setMilestones(project.milestones);
    setTemplateItems(loadTemplate(project.id));
    setQueue(loadQueue(project.id));
  }, [project.id, project.milestones]);

  // ---- AUTO-FLUSH QUEUE WHEN ONLINE ----
  const flushQueue = useCallback(async () => {
    const q = loadQueue(project.id);
    if (q.length === 0) return;
    setSyncing(true);
    let ok = 0;
    let fail = 0;
    for (const item of q) {
      try {
        const res = await fetch("/api/doz/field", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "toggle_milestone",
            milestoneId: item.milestoneId,
            done: item.done,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    // Remove successfully-synced items from queue (keep failed ones)
    if (fail === 0) {
      saveQueue(project.id, []);
      setQueue([]);
    } else {
      // Keep the failed tail (last `fail` items)
      const remaining = q.slice(q.length - fail);
      saveQueue(project.id, remaining);
      setQueue(remaining);
    }
    setSyncing(false);
    if (ok > 0) {
      toast.success(`Synced ${ok} update${ok === 1 ? "" : "s"} ✓`, { duration: 2500 });
      onOnlineSyncDone();
    }
    if (fail > 0) {
      toast.error(`${fail} update${fail === 1 ? "" : "s"} failed to sync`, { duration: 3000 });
    }
  }, [project.id, onOnlineSyncDone]);

  // When we transition from offline -> online (queue may have items), flush.
  const queueLen = queue.length;
  useEffect(() => {
    if (online && queueLen > 0) {
      void flushQueue();
    }
  }, [online, queueLen, flushQueue]);

  // ---- MILESTONE TOGGLE ----
  async function toggleMilestone(m: { id: string; status: string }) {
    const nextDone = m.status !== "DONE";
    // Optimistic UI
    setMilestones((prev) =>
      prev.map((mm) =>
        mm.id === m.id
          ? {
              ...mm,
              status: nextDone ? "DONE" : "PENDING",
              completedAt: nextDone ? new Date().toISOString() : null,
            }
          : mm
      )
    );
    setBusyId(m.id);

    if (!online) {
      // Queue for sync
      const item: QueueItem = {
        milestoneId: m.id,
        done: nextDone,
        timestamp: Date.now(),
      };
      const cur = loadQueue(project.id);
      // Replace any existing queued toggle for the same milestone
      const filtered = cur.filter((q) => q.milestoneId !== m.id);
      const next = [...filtered, item];
      saveQueue(project.id, next);
      setQueue(next);
      toast("Saved offline — will sync", { duration: 2000 });
      setBusyId(null);
      return;
    }

    // Online — POST directly
    try {
      const res = await fetch("/api/doz/field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_milestone",
          milestoneId: m.id,
          done: nextDone,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const j = await res.json();
      // Reconcile server state
      if (j?.milestone) {
        setMilestones((prev) =>
          prev.map((mm) =>
            mm.id === m.id
              ? {
                  ...mm,
                  status: j.milestone.status,
                  completedAt: j.milestone.completedAt,
                }
              : mm
          )
        );
      }
    } catch (e: any) {
      // Revert optimistic update
      setMilestones((prev) =>
        prev.map((mm) =>
          mm.id === m.id
            ? { ...mm, status: m.status, completedAt: mm.completedAt }
            : mm
        )
      );
      toast.error("Couldn't update milestone", { description: e?.message, duration: 3000 });
    } finally {
      setBusyId(null);
    }
  }

  // ---- TEMPLATE ITEM TOGGLE (localStorage only) ----
  function toggleTemplate(idx: number) {
    setTemplateItems((prev) => {
      const next = prev.map((it, i) =>
        i === idx
          ? {
              ...it,
              done: !it.done,
              completedAt: !it.done ? new Date().toISOString() : null,
            }
          : it
      );
      saveTemplate(project.id, next);
      return next;
    });
  }

  // ---- COMPUTE PROGRESS ----
  const milestoneDone = milestones.filter((m) => m.status === "DONE").length;
  const templateDone = templateItems.filter((t) => t.done).length;
  const totalItems = milestones.length + templateItems.length;
  const totalDone = milestoneDone + templateDone;

  return (
    <div>
      {/* Header bar */}
      <BackBar onBack={onBack} label="Active Events" />

      {/* Project header */}
      <Card className="mt-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-tight">{project.name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {project.code ?? "—"} · {project.role.replace(/_/g, " ")}
            </p>
          </div>
          <OnlineBadge online={online} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {project.eventDate && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3" /> {formatDate(project.eventDate)}
            </span>
          )}
          {project.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" /> {project.venue}
            </span>
          )}
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium">
              {totalDone} of {totalItems} complete
            </span>
            <span className="text-muted-foreground">
              {Math.round(totalItems > 0 ? (totalDone / totalItems) * 100 : 0)}%
            </span>
          </div>
          <MiniBar value={totalDone} max={totalItems} color="bg-primary" />
        </div>

        {/* Sync button */}
        {queue.length > 0 && (
          <Button
            variant="outline"
            className="mt-3 min-h-10 w-full border-amber-500/40 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10"
            onClick={() => void flushQueue()}
            disabled={syncing || !online}
          >
            {syncing ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Syncing…
              </>
            ) : (
              <>
                <RefreshCw className="size-4" />
                {online ? "Sync now" : `Offline · ${queue.length} queued`}
              </>
            )}
            {!syncing && queue.length > 0 && (
              <Badge className="ml-1 bg-amber-500/20 text-amber-300">{queue.length}</Badge>
            )}
          </Button>
        )}
      </Card>

      {/* Milestones section */}
      {milestones.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Target className="size-4 text-primary" /> Project Milestones
            <Badge variant="secondary" className="ml-auto">
              {milestoneDone}/{milestones.length}
            </Badge>
          </h3>
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-border">
              {milestones.map((m) => {
                const done = m.status === "DONE";
                const busy = busyId === m.id;
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => void toggleMilestone(m)}
                      disabled={busy}
                      className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/30 disabled:opacity-60"
                      aria-pressed={done}
                      aria-label={`Toggle milestone: ${m.title}`}
                    >
                      {busy ? (
                        <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
                      ) : done ? (
                        <CheckCircle2 className="size-5 shrink-0 text-primary" />
                      ) : (
                        <Circle className="size-5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm ${
                            done ? "text-muted-foreground line-through" : "font-medium"
                          }`}
                        >
                          {m.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Due {formatDate(m.dueDate)}
                          {done && m.completedAt
                            ? ` · done ${formatTime(m.completedAt)}`
                            : ""}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}

      {/* Event-day checklist template */}
      <div className="mt-5">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <ClipboardCheck className="size-4 text-amber-400" /> Event-Day Checklist
          <Badge variant="secondary" className="ml-auto">
            {templateDone}/{templateItems.length}
          </Badge>
        </h3>
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {templateItems.map((it, idx) => (
              <li key={idx}>
                <button
                  onClick={() => toggleTemplate(idx)}
                  className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/30"
                  aria-pressed={it.done}
                  aria-label={`Toggle: ${it.label}`}
                >
                  {it.done ? (
                    <CheckCircle2 className="size-5 shrink-0 text-primary" />
                  ) : (
                    <Circle className="size-5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm ${
                        it.done ? "text-muted-foreground line-through" : "font-medium"
                      }`}
                    >
                      {it.label}
                    </p>
                    {it.done && it.completedAt && (
                      <p className="text-[10px] text-muted-foreground">
                        done {formatTime(it.completedAt)}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Saved on this device — works offline
        </p>
      </div>

      {/* If nothing at all */}
      {milestones.length === 0 && templateItems.length === 0 && (
        <EmptyState
          icon={<FileText className="size-8" />}
          title="No checklist items yet"
          hint="Your run-sheet will appear here once the project has milestones."
        />
      )}
    </div>
  );
}

// ============================================================
// BackBar — sticky-ish back button at the top of sub-views
// ============================================================
function BackBar({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button
      onClick={onBack}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label={`Back to ${label}`}
    >
      <ArrowLeft className="size-4" /> Back to {label}
    </button>
  );
}

// ============================================================
// FieldHeaderSkeleton — for loading state
// ============================================================
function FieldHeaderSkeleton() {
  return (
    <div className="flex items-start gap-3">
      <Skeleton className="size-11 shrink-0 rounded-2xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-56" />
      </div>
    </div>
  );
}
