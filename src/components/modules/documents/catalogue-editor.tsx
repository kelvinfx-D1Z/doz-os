"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { SectionHeader, EmptyState } from "@/components/doz/ui-primitives";
import { Layers, Plus, Loader2, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";

// The catalogue editor — the founder's own screen for maintaining the
// Section/Description dropdowns used when building quotations and invoices
// (see section-combobox.tsx / description-combobox.tsx). This is a separate
// screen, not a change to those comboboxes or to document-builder.tsx: they
// only ever read the catalogue, they don't need to know it's editable here.
//
// SAFETY PROPERTY: nothing in the database references ServiceItem by id.
// InvoiceLine.description, QuotationLine.description and
// ProjectService.serviceName all store the service name as plain text,
// captured at the moment a document line was created — the only relation to
// ServiceItem anywhere in prisma/schema.prisma is ServiceCategory.items. So
// renaming or deleting a department or service here can never alter or break
// a document already issued: an invoice keeps the words it was issued with.
// That's what makes this safe to hand to the founder with no developer
// involved each time the offering changes.

interface CatalogueItem { id: string; name: string; isCustom: boolean }
interface CatalogueCategory { id: string; name: string; icon: string | null; items: CatalogueItem[] }

export function CatalogueEditor() {
  const [categories, setCategories] = useState<CatalogueCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addDeptOpen, setAddDeptOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetch("/api/doz/services")
      .then((r) => r.json().then((j) => ({ ok: r.ok, status: r.status, j })))
      .then(({ ok, status, j }) => {
        if (!ok) throw new Error(j?.error || `Failed to load catalogue (${status})`);
        setCategories(j.categories ?? []);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load catalogue");
    });
    return () => { cancelled = true; };
  }, [load]);

  async function call(action: string, extra: Record<string, unknown>) {
    const r = await fetch("/api/doz/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
    return j;
  }

  async function renameDepartment(categoryId: string, name: string) {
    setBusyId(categoryId);
    try {
      await call("catalogue_rename_department", { categoryId, name });
      toast.success("Department renamed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't rename department", { duration: 8000 });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteDepartment(cat: CatalogueCategory) {
    if (cat.items.length > 0) {
      toast.error(`Move or delete "${cat.name}"'s ${cat.items.length} service${cat.items.length === 1 ? "" : "s"} first, then delete the department`, { duration: 8000 });
      return;
    }
    if (!confirm(`Delete department "${cat.name}"? This cannot be undone.`)) return;
    setBusyId(cat.id);
    try {
      await call("catalogue_delete_department", { categoryId: cat.id });
      toast.success(`"${cat.name}" deleted`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete department", { duration: 8000 });
    } finally {
      setBusyId(null);
    }
  }

  async function addService(categoryId: string, name: string) {
    setBusyId(categoryId);
    try {
      await call("catalogue_add_item", { categoryId, name });
      toast.success(`"${name}" added`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add service", { duration: 8000 });
    } finally {
      setBusyId(null);
    }
  }

  async function renameService(itemId: string, name: string) {
    setBusyId(itemId);
    try {
      await call("catalogue_rename_item", { itemId, name });
      toast.success("Service renamed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't rename service", { duration: 8000 });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteService(item: CatalogueItem) {
    if (!confirm(`Delete "${item.name}"? This cannot be undone. Documents already issued keep the words they were issued with.`)) return;
    setBusyId(item.id);
    try {
      await call("catalogue_delete_item", { itemId: item.id });
      toast.success(`"${item.name}" deleted`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete service", { duration: 8000 });
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <Card className="p-6"><p className="text-sm text-destructive">{error}</p></Card>;
  if (!categories) {
    return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={<Layers className="h-4 w-4" />}
        title="Service catalogue"
        description="What powers the Section and Description dropdowns on every quotation and invoice line. Renaming or deleting an entry never touches a document already issued — it only stores plain text at the time it was created."
        action={
          <Button className="gap-1.5" onClick={() => setAddDeptOpen(true)}>
            <Plus className="h-4 w-4" /> Add department
          </Button>
        }
      />

      {categories.length === 0 ? (
        <EmptyState icon={<Layers className="h-8 w-8" />} title="No departments yet" hint="Add one to start building the catalogue." />
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => (
            <DepartmentCard
              key={cat.id}
              cat={cat}
              busy={busyId === cat.id}
              busyId={busyId}
              onRenameDepartment={(name) => renameDepartment(cat.id, name)}
              onDeleteDepartment={() => deleteDepartment(cat)}
              onAddService={(name) => addService(cat.id, name)}
              onRenameService={(itemId, name) => renameService(itemId, name)}
              onDeleteService={(item) => deleteService(item)}
            />
          ))}
        </div>
      )}

      <AddDepartmentDialog
        open={addDeptOpen}
        onOpenChange={setAddDeptOpen}
        onSaved={() => load().catch(() => {})}
      />
    </div>
  );
}

function DepartmentCard({
  cat, busy, busyId, onRenameDepartment, onDeleteDepartment, onAddService, onRenameService, onDeleteService,
}: {
  cat: CatalogueCategory;
  busy: boolean;
  busyId: string | null;
  onRenameDepartment: (name: string) => void;
  onDeleteDepartment: () => void;
  onAddService: (name: string) => void;
  onRenameService: (itemId: string, name: string) => void;
  onDeleteService: (item: CatalogueItem) => void;
}) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [newService, setNewService] = useState("");
  const [addingService, setAddingService] = useState(false);

  const canDeleteDept = cat.items.length === 0;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editingName !== null ? (
          <div className="flex flex-1 items-center gap-1.5">
            <Input
              autoFocus
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && editingName.trim()) { onRenameDepartment(editingName.trim()); setEditingName(null); }
                if (e.key === "Escape") setEditingName(null);
              }}
              className="h-8 max-w-[280px]"
            />
            <Button size="icon" variant="outline" className="h-8 w-8" disabled={!editingName.trim() || busy} onClick={() => { onRenameDepartment(editingName.trim()); setEditingName(null); }}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setEditingName(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{cat.icon ? `${cat.icon} ${cat.name}` : cat.name}</h3>
            <span className="text-xs text-muted-foreground">
              {cat.items.length} service{cat.items.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
        {editingName === null && (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => setEditingName(cat.name)}>
              <Pencil className="h-3.5 w-3.5" /> Rename
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-destructive hover:text-destructive disabled:opacity-40"
              disabled={busy}
              title={canDeleteDept ? undefined : "Move or delete its services first"}
              onClick={onDeleteDepartment}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-1.5 border-t border-border pt-3">
        {cat.items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No services yet.</p>
        ) : (
          cat.items.map((item) => (
            <ServiceRow
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onRename={(name) => onRenameService(item.id, name)}
              onDelete={() => onDeleteService(item)}
            />
          ))
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-3">
        {addingService ? (
          <>
            <Input
              autoFocus
              value={newService}
              placeholder="New service name"
              onChange={(e) => setNewService(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newService.trim()) { onAddService(newService.trim()); setNewService(""); setAddingService(false); }
                if (e.key === "Escape") { setNewService(""); setAddingService(false); }
              }}
              className="h-8 max-w-[280px]"
            />
            <Button size="sm" disabled={!newService.trim() || busy} onClick={() => { onAddService(newService.trim()); setNewService(""); setAddingService(false); }}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setNewService(""); setAddingService(false); }}>Cancel</Button>
          </>
        ) : (
          <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => setAddingService(true)}>
            <Plus className="h-3.5 w-3.5" /> Add service
          </Button>
        )}
      </div>
    </Card>
  );
}

function ServiceRow({
  item, busy, onRename, onDelete,
}: { item: CatalogueItem; busy: boolean; onRename: (name: string) => void; onDelete: () => void }) {
  const [editingName, setEditingName] = useState<string | null>(null);

  if (editingName !== null) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={editingName}
          onChange={(e) => setEditingName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && editingName.trim()) { onRename(editingName.trim()); setEditingName(null); }
            if (e.key === "Escape") setEditingName(null);
          }}
          className="h-8 max-w-[280px]"
        />
        <Button size="icon" variant="outline" className="h-8 w-8" disabled={!editingName.trim() || busy} onClick={() => { onRename(editingName.trim()); setEditingName(null); }}>
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setEditingName(null)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-accent/50">
      <span className="text-sm">{item.name}</span>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} onClick={() => setEditingName(item.name)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" disabled={busy} onClick={onDelete}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function AddDepartmentDialog({
  open, onOpenChange, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/doz/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "catalogue_add_department", name: name.trim() }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      toast.success(`"${name.trim()}" added`);
      setName("");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add department", { duration: 8000 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add a department</DialogTitle>
          <DialogDescription>A new section for the quotation/invoice dropdowns, e.g. &quot;Stage &amp; Scenic&quot;.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nd-name">Department name *</Label>
            <Input id="nd-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Add department
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
