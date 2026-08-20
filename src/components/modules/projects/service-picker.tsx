"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Search, Bookmark, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type ServiceCategory = { id: string; name: string; items: { id: string; name: string }[] };
export type Template = { id: string; name: string; services: string[]; count: number; createdById?: string | null };

/** "CATEGORY::Service" — the encoding shared by the picker, templates and project create. */
export const svcKey = (category: string, name: string) => `${category}::${name}`;

// The service catalogue as a tick list, grouped by the department that delivers
// it. A PM starts from the full list and unticks what this job does not need —
// the way the costing spreadsheets were actually used — rather than recalling
// every line from scratch.
export function ServicePicker({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [categories, setCategories] = useState<ServiceCategory[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [query, setQuery] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/doz/services").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/doz/event-templates").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([svc, tpl]) => {
        if (cancelled) return;
        setCategories(svc?.categories ?? []);
        setTemplates(tpl?.templates ?? []);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!categories) return [];
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(q)) }))
      .filter((c) => c.items.length > 0);
  }, [categories, query]);

  function toggle(k: string) {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onChange(next);
  }

  function toggleCategory(c: ServiceCategory) {
    const keys = c.items.map((i) => svcKey(c.name, i.name));
    const allOn = keys.every((k) => selected.has(k));
    const next = new Set(selected);
    for (const k of keys) {
      if (allOn) next.delete(k);
      else next.add(k);
    }
    onChange(next);
  }

  async function saveTemplate() {
    if (selected.size === 0) {
      toast.error("Pick some services first");
      return;
    }
    const name = window.prompt('Name this list — e.g. "Conference", "Exhibition booth"');
    if (!name?.trim()) return;
    setSavingTemplate(true);
    try {
      const r = await fetch("/api/doz/event-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), services: [...selected] }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      toast.success(`Saved "${name.trim()}"`, { description: "Reuse it next time from Saved lists." });
      const tpl = await fetch("/api/doz/event-templates").then((x) => x.json()).catch(() => null);
      if (tpl?.templates) setTemplates(tpl.templates);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save", { duration: 8000 });
    } finally {
      setSavingTemplate(false);
    }
  }

  async function removeTemplate(t: Template) {
    if (!window.confirm(`Delete the saved list "${t.name}"?`)) return;
    try {
      const r = await fetch("/api/doz/event-templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: t.id }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete");
    }
  }

  if (categories === null) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Loading services…</p>;
  }
  if (categories.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        No service catalogue found. You can still create the project and add lines to it afterwards.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {templates.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Saved lists</p>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onChange(new Set(t.services));
                    toast.success(`Loaded "${t.name}" — ${t.count} services`);
                  }}
                  className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/20"
                >
                  {t.name} · {t.count}
                </button>
                <button
                  type="button"
                  onClick={() => removeTemplate(t)}
                  className="text-muted-foreground/60 transition-colors hover:text-destructive"
                  aria-label={`Delete ${t.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services…"
          className="pl-8"
        />
      </div>

      <div className="scroll-thin max-h-[300px] space-y-3 overflow-y-auto rounded-md border border-border p-3">
        {filtered.map((c) => {
          const keys = c.items.map((i) => svcKey(c.name, i.name));
          const on = keys.filter((k) => selected.has(k)).length;
          return (
            <div key={c.id}>
              <button
                type="button"
                onClick={() => toggleCategory(c)}
                className="mb-1 flex w-full items-center gap-2 text-left"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {c.name}
                </span>
                {on > 0 && (
                  <Badge variant="outline" className="text-[9px]">
                    {on}
                  </Badge>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground/60">
                  {on === keys.length ? "clear all" : "select all"}
                </span>
              </button>
              <div className="space-y-0.5">
                {c.items.map((i) => {
                  const k = svcKey(c.name, i.name);
                  return (
                    <label
                      key={i.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded px-1.5 py-1 text-sm transition-colors hover:bg-accent",
                        selected.has(k) && "bg-primary/5",
                      )}
                    >
                      <Checkbox checked={selected.has(k)} onCheckedChange={() => toggle(k)} />
                      <span>{i.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">Nothing matches that search.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">{selected.size}</strong> service{selected.size === 1 ? "" : "s"} selected
        </p>
        {selected.size > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onChange(new Set())}
          >
            Clear
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-7 gap-1.5 text-xs"
          onClick={saveTemplate}
          disabled={savingTemplate || selected.size === 0}
        >
          {savingTemplate ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bookmark className="h-3 w-3" />}
          Save as reusable list
        </Button>
      </div>
    </div>
  );
}
