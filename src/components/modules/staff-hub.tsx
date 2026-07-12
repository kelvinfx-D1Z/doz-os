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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Users, Plus, Crown, GraduationCap, Briefcase, CheckCircle2, Circle,
  Clock, AlertCircle, Sparkles, Loader2, Pencil, Trash2, Target, Send,
} from "lucide-react";
import { SectionHeader, MiniBar, PriorityDot } from "@/components/doz/ui-primitives";
import { formatDate, relativeTime, initials, avatarColor } from "@/lib/format";

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
    </div>
  );
}

// ============================================================
// Staff Card — shows roles, responsibilities, and tasks
// Adds Modify (pencil) + Delete (trash) buttons per task so the
// founder can edit any staff/intern task directly.
// ============================================================
function StaffCard({ staff, onToggleTask, onAssign, onDeactivate, onEditTask, onDeleteTask }: any) {
  const [showTasks, setShowTasks] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  // Merge this-week tasks with completed tasks so the founder sees the
  // full picture (completed tasks are tucked under a collapsible section).
  const openTasks = [
    ...staff.tasks.thisWeek,
    ...staff.tasks.today.filter((t: any) => !staff.tasks.thisWeek.find((x: any) => x.id === t.id)),
  ];
  const completedTasks = staff.tasks.completed || [];

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-border p-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(staff.name)}`}>
          {initials(staff.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{staff.name}</h3>
            {ROLE_ICONS[staff.role]}
          </div>
          <p className="text-xs text-muted-foreground">{staff.title} · {staff.email}</p>
        </div>
        <div className="flex gap-1">
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
  const [form, setForm] = useState({ name: "", email: "", role: "INTERN", title: "", phone: "", capacity: "40", password: "" });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) { toast.error("Name, email, and password are required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/doz/staff-hub", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_staff", ...form }),
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
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add New Staff Member</DialogTitle></DialogHeader>
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
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Staff"}</Button>
          </div>
        </form>
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
