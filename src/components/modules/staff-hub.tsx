"use client";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { ModuleId } from "@/lib/store";
import {
  Users, Plus, Crown, GraduationCap, Briefcase, CheckCircle2, Circle,
  Clock, AlertCircle, Sparkles, Loader2, Pencil, Trash2, Target, Send,
  ShieldCheck,
} from "lucide-react";
import { SectionHeader, MiniBar, PriorityDot } from "@/components/doz/ui-primitives";
import { formatDate, relativeTime, initials, avatarColor } from "@/lib/format";

// ============================================================
// Module catalog — labels, icons, groups. Mirrors app-shell NAV.
// Used by the PermissionsPicker so the founder can toggle what each
// staff member sees in their sidebar.
// NOTE: Most icons (Users, Plus, Sparkles, Target, etc.) are already imported
// from lucide-react at the top of this file. We only add the additional
// icons here that aren't already imported above.
// ============================================================
import {
  LayoutDashboard, Repeat, Smartphone,
  Megaphone, Clapperboard, Truck, Wallet,
  UserCog, BookOpen, HelpCircle, Package, Users2,
} from "lucide-react";

type ModuleEntry = {
  id: ModuleId;
  label: string;
  icon: React.ReactNode;
  group: string;
};

const MODULE_CATALOG: ModuleEntry[] = [
  { id: "command", label: "Command Center", icon: <LayoutDashboard className="h-3.5 w-3.5" />, group: "Operate" },
  { id: "planning", label: "Strategic Planning", icon: <Target className="h-3.5 w-3.5" />, group: "Operate" },
  { id: "routines", label: "Routines", icon: <Repeat className="h-3.5 w-3.5" />, group: "Operate" },
  { id: "ai", label: "AI Chief of Staff", icon: <Sparkles className="h-3.5 w-3.5" />, group: "Operate" },
  { id: "field", label: "Field Mode", icon: <Smartphone className="h-3.5 w-3.5" />, group: "Operate" },
  { id: "crm", label: "CRM & Sales", icon: <Users2 className="h-3.5 w-3.5" />, group: "Grow" },
  { id: "marketing", label: "Marketing & Growth", icon: <Megaphone className="h-3.5 w-3.5" />, group: "Grow" },
  { id: "projects", label: "Projects & Events", icon: <Clapperboard className="h-3.5 w-3.5" />, group: "Deliver" },
  { id: "procurement", label: "Procurement", icon: <Truck className="h-3.5 w-3.5" />, group: "Deliver" },
  { id: "finance", label: "Financial Intelligence", icon: <Wallet className="h-3.5 w-3.5" />, group: "Control" },
  { id: "team", label: "Team Management", icon: <UserCog className="h-3.5 w-3.5" />, group: "Control" },
  { id: "staff-hub", label: "Staff Hub", icon: <Users className="h-3.5 w-3.5" />, group: "Control" },
  { id: "sop", label: "SOP & Knowledge", icon: <BookOpen className="h-3.5 w-3.5" />, group: "Scale" },
  { id: "help", label: "Help & Guide", icon: <HelpCircle className="h-3.5 w-3.5" />, group: "Scale" },
  { id: "updates", label: "Updates & Backups", icon: <Package className="h-3.5 w-3.5" />, group: "Scale" },
];

// Role-based module defaults — kept in sync with app-shell ROLE_MODULES.
// When the founder picks a role, the picker pre-selects these modules
// so they can start from a sane baseline and tweak from there.
const ROLE_DEFAULT_MODULES: Record<string, ModuleId[]> = {
  FOUNDER: ["command", "planning", "routines", "ai", "field", "crm", "marketing", "projects", "procurement", "finance", "team", "staff-hub", "sop", "help", "updates"],
  STAFF: ["command", "planning", "routines", "field", "crm", "marketing", "projects", "procurement", "finance", "sop", "help"],
  INTERN: ["command", "field", "sop", "help"],
  FREELANCER: ["command", "field", "projects", "help"],
};

// ============================================================
// PermissionsPicker — checkbox grid of all modules, grouped.
// Controlled component: parent owns the `selected` array.
// ============================================================
function PermissionsPicker({
  selected,
  onChange,
}: {
  selected: ModuleId[];
  onChange: (next: ModuleId[]) => void;
}) {
  // Group modules by group label for nicer UX
  const grouped = MODULE_CATALOG.reduce<Record<string, ModuleEntry[]>>((acc, m) => {
    (acc[m.group] ||= []).push(m);
    return acc;
  }, {});

  function toggle(id: ModuleId) {
    // "command" is always required — it's the landing page
    if (id === "command") return;
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="max-h-64 space-y-3 overflow-y-auto scroll-thin rounded-lg border border-border bg-muted/20 p-3">
      {Object.entries(grouped).map(([group, items]) => (
        <div key={group}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {group}
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {items.map((m) => {
              const checked = selected.includes(m.id);
              const isLocked = m.id === "command"; // always-on
              return (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-xs transition-colors ${
                    checked
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:border-primary/30 hover:bg-muted/40"
                  } ${isLocked ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  <Checkbox
                    checked={checked}
                    disabled={isLocked}
                    onCheckedChange={() => toggle(m.id)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-muted-foreground">{m.icon}</span>
                  <span className={`flex-1 ${checked ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                    {m.label}
                  </span>
                  {isLocked && <span className="text-[9px] uppercase text-muted-foreground">required</span>}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const ROLE_ICONS: Record<string, React.ReactNode> = {
  FOUNDER: <Crown className="h-4 w-4 text-emerald-400" />,
  STAFF: <Briefcase className="h-4 w-4 text-teal-400" />,
  INTERN: <GraduationCap className="h-4 w-4 text-violet-400" />,
};

const PILLAR_COLORS: Record<string, string> = {
  DOZ_STUDIOS: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  FIESTIVO: "bg-teal-500/10 text-teal-400 border-teal-500/30",
  FOUNDEROS: "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

const PILLAR_NAMES: Record<string, string> = {
  DOZ_STUDIOS: "DOZ Studios",
  FIESTIVO: "Fiestivo.com",
  FOUNDEROS: "FounderOS",
};

const PRIORITY_LABELS: Record<string, string> = {
  URGENT: "Urgent", HIGH: "High", MEDIUM: "Medium", LOW: "Low",
};

export function StaffHub() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [showAssignTask, setShowAssignTask] = useState(false);
  const [showDIDI, setShowDIDI] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string>("");
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<any | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/doz/staff-hub");
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch { toast.error("Couldn't load staff hub"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function toggleTask(taskId: string) {
    try {
      await fetch("/api/doz/staff-hub", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_task", taskId }),
      });
      load();
    } catch { toast.error("Failed to update task"); }
  }

  async function deleteTask(taskId: string, title: string) {
    if (!confirm(`Delete task "${title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch("/api/doz/staff-hub", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_task", taskId }),
      });
      if (!res.ok) throw new Error();
      toast.success("Task deleted");
      load();
    } catch { toast.error("Failed to delete task"); }
  }

  async function deactivate(userId: string) {
    if (!confirm("Deactivate this staff member?")) return;
    try {
      await fetch("/api/doz/staff-hub", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
      toast.success("Staff member deactivated");
      load();
    } catch { toast.error("Failed"); }
  }

  if (loading || !data) {
    return <div className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Users className="h-5 w-5" />}
        title="Staff Hub"
        description="Manage your team — roles, responsibilities, tasks, and accountability"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowDIDI(true)} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> DIDI Assign
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAssignTarget(""); setShowAssignTask(true); }} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Assign Task
            </Button>
            <Button size="sm" onClick={() => setShowAddStaff(true)} className="gap-1.5 bg-primary text-primary-foreground">
              <Plus className="h-3.5 w-3.5" /> Add Staff
            </Button>
          </div>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active Staff</p><p className="text-xl font-bold">{data.summary.totalStaff}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Open Tasks</p><p className="text-xl font-bold">{data.summary.totalTasks}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Due Today</p><p className="text-xl font-bold text-amber-400">{data.summary.todayTasks}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Overdue</p><p className="text-xl font-bold text-rose-400">{data.summary.overdueTasks}</p></Card>
      </div>

      {/* Staff Cards */}
      <div className="space-y-4">
        {data.staff.filter((s: any) => s.isActive).map((staff: any) => (
          <StaffCard
            key={staff.id}
            staff={staff}
            onToggleTask={toggleTask}
            onAssign={() => { setAssignTarget(staff.id); setShowAssignTask(true); }}
            onDeactivate={() => deactivate(staff.id)}
            onEditTask={(task: any) => setEditingTask(task)}
            onDeleteTask={(taskId: string, title: string) => deleteTask(taskId, title)}
            onPermissions={() => setPermissionsUser(staff)}
          />
        ))}
      </div>

      {/* Add Staff Dialog */}
      {showAddStaff && <AddStaffDialog onClose={() => setShowAddStaff(false)} onSaved={load} />}

      {/* Assign Task Dialog */}
      {showAssignTask && <AssignTaskDialog onClose={() => setShowAssignTask(false)} onSaved={load} staff={data.staff} presetAssignee={assignTarget} />}

      {/* DIDI Assign Dialog */}
      {showDIDI && <DIDIAssignDialog onClose={() => setShowDIDI(false)} onSaved={load} staff={data.staff} />}

      {/* Modify Task Dialog — founder edits any task */}
      {editingTask && (
        <ModifyTaskDialog
          task={editingTask}
          staff={data.staff}
          onClose={() => setEditingTask(null)}
          onSaved={() => { setEditingTask(null); load(); }}
        />
      )}

      {/* Permissions Dialog — founder sets what this user can see */}
      {permissionsUser && (
        <PermissionsDialog
          user={permissionsUser}
          onClose={() => setPermissionsUser(null)}
          onSaved={() => { setPermissionsUser(null); load(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// Staff Card — shows roles, responsibilities, and tasks
// Adds Modify (pencil) + Delete (trash) buttons per task so the
// founder can edit any staff/intern task directly.
// ============================================================
function StaffCard({ staff, onToggleTask, onAssign, onDeactivate, onEditTask, onDeleteTask, onPermissions }: any) {
  const [showTasks, setShowTasks] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  // Merge this-week tasks with completed tasks so the founder sees the
  // full picture (completed tasks are tucked under a collapsible section).
  const openTasks = [
    ...staff.tasks.thisWeek,
    ...staff.tasks.today.filter((t: any) => !staff.tasks.thisWeek.find((x: any) => x.id === t.id)),
  ];
  const completedTasks = staff.tasks.completed || [];
  // Has custom permissions? (null = role defaults apply)
  const hasCustomPerms = Array.isArray(staff.permissions) && staff.permissions.length > 0;

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-border p-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(staff.name)}`}>
          {initials(staff.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">{staff.name}</h3>
            {ROLE_ICONS[staff.role]}
            {hasCustomPerms && (
              <Badge variant="outline" className="gap-1 border-primary/40 bg-primary/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-primary">
                <ShieldCheck className="h-2.5 w-2.5" /> {staff.permissions.length} modules
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{staff.title} · {staff.email}</p>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onPermissions} title="Module access permissions">
            <ShieldCheck className="h-3 w-3" /> Access
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onAssign}>
            <Plus className="h-3 w-3" /> Task
          </Button>
          {staff.role !== "FOUNDER" && (
            <Button size="sm" variant="ghost" className="h-7 w-7 text-rose-400" onClick={onDeactivate}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Pillar Allocations */}
      {staff.roles.length > 0 && (
        <div className="border-b border-border p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pillar Allocation</p>
          <div className="flex flex-wrap gap-2">
            {staff.roles.map((r: any, i: number) => (
              <div key={i} className={`rounded-lg border px-3 py-1.5 text-xs ${PILLAR_COLORS[r.pillar] || "bg-muted"}`}>
                <span className="font-semibold">{PILLAR_NAMES[r.pillar] || r.pillar}</span>
                <span className="ml-1.5 opacity-70">{r.percentage}%</span>
              </div>
            ))}
          </div>
          {staff.roles.some((r: any) => r.responsibilities.length > 0) && (
            <div className="mt-3 space-y-1">
              {staff.roles.map((r: any, i: number) => r.responsibilities.length > 0 && (
                <div key={i}>
                  <p className="text-[10px] font-medium text-muted-foreground">{PILLAR_NAMES[r.pillar] || r.pillar}:</p>
                  <p className="text-xs text-muted-foreground">{r.responsibilities.join(" · ")}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Task Summary */}
      <div className="flex items-center gap-3 border-b border-border p-3 text-xs flex-wrap">
        <span className="flex items-center gap-1 text-amber-400"><Clock className="h-3 w-3" /> {staff.tasks.today.length} today</span>
        <span className="flex items-center gap-1 text-muted-foreground"><Target className="h-3 w-3" /> {openTasks.length} open</span>
        {staff.tasks.overdue.length > 0 && (
          <span className="flex items-center gap-1 text-rose-400"><AlertCircle className="h-3 w-3" /> {staff.tasks.overdue.length} overdue</span>
        )}
        {completedTasks.length > 0 && (
          <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3 w-3" /> {completedTasks.length} done</span>
        )}
        <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => setShowTasks(!showTasks)}>
          {showTasks ? "Hide" : "Show"} tasks
        </Button>
      </div>

      {/* Task List — open tasks */}
      {showTasks && openTasks.length > 0 && (
        <div className="divide-y divide-border">
          {openTasks.map((task: any) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={() => onToggleTask(task.id)}
              onEdit={() => onEditTask(task)}
              onDelete={() => onDeleteTask(task.id, task.title)}
            />
          ))}
        </div>
      )}

      {/* Completed tasks (collapsible) */}
      {showTasks && completedTasks.length > 0 && (
        <>
          <button
            className="flex w-full items-center gap-2 border-t border-border bg-muted/30 px-3 py-2 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted/50"
            onClick={() => setShowCompleted(!showCompleted)}
          >
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            {showCompleted ? "Hide" : "Show"} {completedTasks.length} completed task{completedTasks.length !== 1 ? "s" : ""}
          </button>
          {showCompleted && (
            <div className="divide-y divide-border">
              {completedTasks.map((task: any) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={() => onToggleTask(task.id)}
                  onEdit={() => onEditTask(task)}
                  onDelete={() => onDeleteTask(task.id, task.title)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showTasks && openTasks.length === 0 && completedTasks.length === 0 && (
        <div className="p-4 text-center text-xs text-muted-foreground">No tasks yet. Click "Task" to assign one.</div>
      )}
    </Card>
  );
}

// ============================================================
// Task Row — single task with toggle + edit + delete actions
// ============================================================
function TaskRow({ task, onToggle, onEdit, onDelete }: any) {
  const isDone = task.status === "DONE";
  const isOverdue = !isDone && task.dueDate && new Date(task.dueDate).getTime() < Date.now();
  return (
    <div className="group flex items-start gap-2 p-3 hover:bg-muted/20">
      <button onClick={onToggle} className="mt-0.5 shrink-0" title={isDone ? "Reopen" : "Mark done"}>
        {isDone
          ? <CheckCircle2 className="h-4 w-4 text-primary" />
          : <Circle className="h-4 w-4 text-muted-foreground hover:text-primary" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-xs ${isDone ? "text-muted-foreground line-through" : ""}`}>{task.title}</p>
        {task.description && (
          <p className="mt-0.5 text-[10px] text-muted-foreground/80 line-clamp-2">{task.description}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <PriorityDot priority={task.priority} />
          <span className="text-[10px] text-muted-foreground">{PRIORITY_LABELS[task.priority] || task.priority}</span>
          {task.dueDate && (
            <span className={`text-[10px] ${isOverdue ? "text-rose-400 font-medium" : "text-muted-foreground"}`}>
              {relativeTime(task.dueDate)}
            </span>
          )}
          {task.category && (
            <span className="text-[10px] text-muted-foreground/70">· {task.category}</span>
          )}
          {task.isDistraction && <Badge className="text-[9px] bg-amber-500/15 text-amber-400">Distraction</Badge>}
          {task.creator && (
            <span className="text-[10px] text-muted-foreground/60">· by {task.creator}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onEdit} title="Modify task">
          <Pencil className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-rose-400 hover:text-rose-500" onClick={onDelete} title="Delete task">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Modify Task Dialog — founder edits an existing staff/intern task
// Can change: title, description, assignee (reassign), priority,
// category, due date, status. Also exposes a Delete button.
// ============================================================
function ModifyTaskDialog({ task, staff, onClose, onSaved }: any) {
  // Pre-populate the form from the existing task
  const dueDateValue = task.dueDate
    ? new Date(task.dueDate).toISOString().slice(0, 10)
    : "";

  const [form, setForm] = useState({
    title: task.title || "",
    description: task.description || "",
    assigneeId: task.assigneeId || "",
    priority: task.priority || "MEDIUM",
    category: task.category || "OPERATIONAL",
    dueDate: dueDateValue,
    status: task.status || "TODO",
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title cannot be empty"); return; }
    setSubmitting(true);
    try {
      const fields: any = {
        title: form.title,
        description: form.description,
        priority: form.priority,
        category: form.category,
        dueDate: form.dueDate || null,
        status: form.status,
      };
      // Only send assigneeId if it actually changed (avoid nulling it accidentally)
      if (form.assigneeId && form.assigneeId !== task.assigneeId) {
        fields.assigneeId = form.assigneeId;
      }

      const res = await fetch("/api/doz/staff-hub", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_task", taskId: task.id, fields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      toast.success("Task updated");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Failed to update task");
    } finally { setSubmitting(false); }
  }

  async function handleDelete() {
    if (!confirm(`Delete task "${task.title}"? This cannot be undone.`)) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/doz/staff-hub", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_task", taskId: task.id }),
      });
      if (!res.ok) throw new Error();
      toast.success("Task deleted");
      onSaved();
    } catch { toast.error("Failed to delete task"); }
    finally { setSubmitting(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" /> Modify Task
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-xs">Task Title *</Label>
            <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} />
          </div>
          <div>
            <Label className="text-xs">Assigned To</Label>
            <Select value={form.assigneeId} onValueChange={v => setForm({...form, assigneeId: v})}>
              <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
              <SelectContent>
                {staff.filter((s: any) => s.isActive).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.assigneeId !== task.assigneeId && (
              <p className="mt-1 text-[10px] text-amber-400">Reassigning — this will move the task to the new person's Command Center.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm({...form, priority: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STRATEGIC">Strategic</SelectItem>
                  <SelectItem value="OPERATIONAL">Operational</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODO">To Do</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="DONE">Done</SelectItem>
                  <SelectItem value="BLOCKED">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleDelete} disabled={submitting}
              className="gap-1.5 border-rose-500/40 text-rose-400 hover:bg-rose-500/10 hover:text-rose-500">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="gap-1.5">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Pencil className="h-3.5 w-3.5" /> Save Changes</>}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Add Staff Dialog
// ============================================================
function AddStaffDialog({ onClose, onSaved }: any) {
  // `permissions` starts as null → role defaults will apply on the backend.
  // When the founder toggles a module, we store the resulting array here.
  const [form, setForm] = useState({ name: "", email: "", role: "INTERN", title: "", phone: "", capacity: "40", password: "" });
  const [permissions, setPermissions] = useState<ModuleId[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Effective selected modules: if the founder has customized, use their list;
  // otherwise fall back to the role defaults. Computed during render (no effect).
  const effectivePermissions: ModuleId[] =
    permissions ?? (ROLE_DEFAULT_MODULES[form.role] ?? ROLE_DEFAULT_MODULES.INTERN);

  function handlePermsChange(next: ModuleId[]) {
    setPermissions(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) { toast.error("Name, email, and password are required"); return; }
    setSubmitting(true);
    try {
      // Only send permissions if the founder customized them; otherwise backend
      // will store null and the role defaults will apply at sign-in time.
      const payload: any = { action: "add_staff", ...form };
      if (permissions) {
        payload.permissions = permissions;
      }
      const res = await fetch("/api/doz/staff-hub", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`${form.name} added to the team`);
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message || "Failed to add staff"); }
    finally { setSubmitting(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add New Team Member</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><Label className="text-xs">Full Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
          <div><Label className="text-xs">Email *</Label><Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Role *</Label>
              <Select value={form.role} onValueChange={v => setForm({...form, role: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FOUNDER">Founder</SelectItem>
                  <SelectItem value="STAFF">Staff</SelectItem>
                  <SelectItem value="INTERN">Intern</SelectItem>
                  <SelectItem value="FREELANCER">Freelancer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Title</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g., Operations Lead" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+234..." /></div>
            <div><Label className="text-xs">Capacity (hrs/week)</Label><Input type="number" value={form.capacity} onChange={e => setForm({...form, capacity: e.target.value})} /></div>
          </div>
          <div><Label className="text-xs">Password *</Label><Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required minLength={6} /></div>

          {/* Module Access Permissions */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3 text-primary" /> Module Access
              </Label>
              {!permissions && (
                <span className="text-[10px] text-muted-foreground">
                  Defaults for {form.role.toLowerCase()} — click to customize
                </span>
              )}
            </div>
            <PermissionsPicker
              selected={effectivePermissions}
              onChange={handlePermsChange}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Pick exactly which pages this person can see in their sidebar. Command Center is always required. The Help page will only show guides for modules they can access.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Team Member"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Permissions Dialog — founder edits an existing user's module access
// ============================================================
function PermissionsDialog({ user, onClose, onSaved }: any) {
  // Start from the user's current permissions (or role defaults if none set)
  const initial: ModuleId[] = Array.isArray(user.permissions) && user.permissions.length > 0
    ? user.permissions
    : (ROLE_DEFAULT_MODULES[user.role] ?? ROLE_DEFAULT_MODULES.INTERN);
  const [selected, setSelected] = useState<ModuleId[]>(initial);
  const [submitting, setSubmitting] = useState(false);
  const hadCustomPerms = Array.isArray(user.permissions) && user.permissions.length > 0;

  async function handleSave() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/doz/staff-hub", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_permissions",
          userId: user.id,
          permissions: selected,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Updated ${user.name}'s module access`);
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Failed to update permissions");
    } finally { setSubmitting(false); }
  }

  async function handleResetToRoleDefaults() {
    if (!confirm(`Reset ${user.name}'s access to the default modules for their role (${user.role})?`)) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/doz/staff-hub", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_permissions",
          userId: user.id,
          permissions: null, // clear the override
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${user.name} now uses ${user.role} role defaults`);
      onSaved();
    } catch { toast.error("Failed to reset permissions"); }
    finally { setSubmitting(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Module Access — {user.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-muted/30 border border-border p-2.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{user.name}</span> · <span className="uppercase tracking-wide text-[10px]">{user.role}</span>
            {hadCustomPerms
              ? <span className="ml-2 text-primary">· Custom access ({user.permissions.length} modules)</span>
              : <span className="ml-2">· Using {user.role} role defaults</span>
            }
          </div>

          <Label className="text-xs">Visible Modules</Label>
          <PermissionsPicker selected={selected} onChange={setSelected} />
          <p className="text-[10px] text-muted-foreground">
            Changes take effect the next time {user.name} signs in. Command Center is always required.
          </p>

          <div className="flex justify-between gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={handleResetToRoleDefaults} disabled={submitting} className="text-xs">
              Reset to role defaults
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button type="button" onClick={handleSave} disabled={submitting} className="gap-1.5">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldCheck className="h-3.5 w-3.5" /> Save Access</>}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Assign Task Dialog
// ============================================================
function AssignTaskDialog({ onClose, onSaved, staff, presetAssignee }: any) {
  const [form, setForm] = useState({
    title: "", description: "", assigneeId: presetAssignee || "",
    priority: "MEDIUM", category: "OPERATIONAL", dueDate: "",
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.assigneeId) { toast.error("Title and assignee are required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/doz/staff-hub", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign_task", ...form }),
      });
      if (!res.ok) throw new Error();
      toast.success("Task assigned");
      onSaved(); onClose();
    } catch { toast.error("Failed to assign task"); }
    finally { setSubmitting(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Assign Task</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><Label className="text-xs">Task Title *</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g., Research 20 potential clients" required /></div>
          <div><Label className="text-xs">Assign To *</Label>
            <Select value={form.assigneeId} onValueChange={v => setForm({...form, assigneeId: v})}>
              <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
              <SelectContent>
                {staff.filter((s: any) => s.isActive).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm({...form, priority: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STRATEGIC">Strategic</SelectItem>
                  <SelectItem value="OPERATIONAL">Operational</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label className="text-xs">Due Date</Label><Input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign Task"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// DIDI Assign Dialog — describe work, DIDI creates tasks for staff
// ============================================================
function DIDIAssignDialog({ onClose, onSaved, staff }: any) {
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !assigneeId) { toast.error("Please describe the work and select a staff member"); return; }
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/doz/staff-hub", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "didi_create_activities", description: description.trim(), assigneeId, priority, dueDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      toast.success(`DIDI created ${data.created} task(s)`);
      onSaved();
    } catch (e: any) { toast.error(e.message || "DIDI couldn't create tasks"); }
    finally { setSubmitting(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> DIDI Task Creator</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground">
            <span className="font-semibold text-primary">DIDI:</span> Describe the work you need done. I'll break it down into individual tasks and assign them. For example: "Research 20 potential clients in the energy sector. Add them to the CRM with contact info. Follow up with 5 by email."
          </div>
          <div><Label className="text-xs">Describe the work *</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe what needs to be done. DIDI will break it into tasks..."
              rows={4}
              required
            />
          </div>
          <div><Label className="text-xs">Assign To *</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
              <SelectContent>
                {staff.filter((s: any) => s.isActive).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Due Date</Label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
          </div>

          {result && (
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-3">
              <p className="text-xs font-semibold text-primary mb-2">✓ {result.created} task(s) created:</p>
              <div className="space-y-1">
                {result.tasks.map((t: any, i: number) => (
                  <p key={t.id} className="text-xs text-muted-foreground">{i + 1}. {t.title}</p>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            <Button type="submit" disabled={submitting} className="gap-1.5">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-3.5 w-3.5" /> Create Tasks</>}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
