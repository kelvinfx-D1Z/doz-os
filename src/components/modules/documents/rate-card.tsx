"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SectionHeader, EmptyState } from "@/components/doz/ui-primitives";
import { Wallet, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { marginFor, suggestOfficialPrice } from "@/lib/pricing";
import { formatNGN, formatPct } from "@/lib/format";

// The founder's own request, verbatim: "make sure that the founder has a
// page where he can see and modify the BP (Budget Rate) and CP (Client
// Rate)." Sibling to catalogue-editor.tsx — same fetch/toast/table idiom —
// but this screen edits the two price columns on ServiceItem rather than the
// department/service names.
//
// BP = ServiceItem.standardCost — what a job costs D1Z.
// CP = ServiceItem.standardClientRate — what the client is charged.
// Both are `number | null`; null means "not yet priced", not zero. A typed
// 0 is a real, saved complimentary price (see src/lib/rate-card.ts).

interface RateItem {
  id: string;
  name: string;
  isCustom: boolean;
  standardCost: number | null;
  standardClientRate: number | null;
  unit: string;
}
interface RateCategory { id: string; name: string; icon: string | null; items: RateItem[] }

/** Parses one input box's current text into a rate: "" -> null (unpriced),
 * a valid non-negative number (including "0") -> that number, anything else
 * -> undefined (not a value we can act on yet — still mid-edit). */
function parseBoxValue(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function boxValueFromRate(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

type Field = "standardCost" | "standardClientRate";

export function RateCard() {
  const [categories, setCategories] = useState<RateCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-row, per-field editable text — separate from the loaded numbers so a
  // half-typed value never gets clobbered by a background refetch, and so an
  // empty box is distinguishable from a typed 0.
  const [bpBox, setBpBox] = useState<Record<string, string>>({});
  const [cpBox, setCpBox] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    return fetch("/api/doz/services")
      .then((r) => r.json().then((j) => ({ ok: r.ok, status: r.status, j })))
      .then(({ ok, status, j }) => {
        if (!ok) throw new Error(j?.error || `Failed to load rate card (${status})`);
        const cats: RateCategory[] = j.categories ?? [];
        setCategories(cats);
        const nextBp: Record<string, string> = {};
        const nextCp: Record<string, string> = {};
        for (const cat of cats) {
          for (const item of cat.items) {
            nextBp[item.id] = boxValueFromRate(item.standardCost);
            nextCp[item.id] = boxValueFromRate(item.standardClientRate);
          }
        }
        setBpBox(nextBp);
        setCpBox(nextCp);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load rate card");
    });
    return () => { cancelled = true; };
  }, [load]);

  // Sends only the one field that changed — omitting the other, per
  // catalogue_set_rates's semantics, leaves it untouched server-side.
  async function saveField(itemId: string, field: Field, value: number | null) {
    setBusy((prev) => ({ ...prev, [itemId]: true }));
    try {
      const r = await fetch("/api/doz/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "catalogue_set_rates", itemId, [field]: value }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      setCategories((prev) =>
        prev
          ? prev.map((cat) => ({
              ...cat,
              items: cat.items.map((it) => (it.id === itemId ? { ...it, ...j.item } : it)),
            }))
          : prev,
      );
      toast.success(field === "standardCost" ? "BP saved" : "CP saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save rate", { duration: 8000 });
      // Revert the box to the last known-good server value.
      const it = categories?.flatMap((c) => c.items).find((i) => i.id === itemId);
      if (it) {
        const setBox = field === "standardCost" ? setBpBox : setCpBox;
        setBox((b) => ({ ...b, [itemId]: boxValueFromRate(it[field]) }));
      }
    } finally {
      setBusy((prev) => ({ ...prev, [itemId]: false }));
    }
  }

  function commitField(itemId: string, field: Field, raw: string, lastSaved: number | null) {
    const parsed = parseBoxValue(raw);
    if (parsed === undefined) {
      // Not a usable number (mid-edit garbage) — revert without a network call.
      const setBox = field === "standardCost" ? setBpBox : setCpBox;
      setBox((b) => ({ ...b, [itemId]: boxValueFromRate(lastSaved) }));
      return;
    }
    if (parsed === lastSaved) return; // unchanged, nothing to save
    saveField(itemId, field, parsed);
  }

  function applySuggested(itemId: string, suggested: number) {
    setCpBox((b) => ({ ...b, [itemId]: String(suggested) }));
    saveField(itemId, "standardClientRate", suggested);
  }

  if (error) return <Card className="p-6"><p className="text-sm text-destructive">{error}</p></Card>;
  if (!categories) {
    return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={<Wallet className="h-4 w-4" />}
        title="Rate card"
        description="BP is what a job costs us. CP is what the client is charged. Both are starting points — you can override either on any project."
      />

      {categories.length === 0 ? (
        <EmptyState icon={<Wallet className="h-8 w-8" />} title="No departments yet" hint="Add services in the Catalogue tab first." />
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => (
            <DepartmentRates
              key={cat.id}
              cat={cat}
              bpBox={bpBox}
              cpBox={cpBox}
              busy={busy}
              onBpChange={(id, v) => setBpBox((b) => ({ ...b, [id]: v }))}
              onCpChange={(id, v) => setCpBox((b) => ({ ...b, [id]: v }))}
              onBpBlur={(item) => commitField(item.id, "standardCost", bpBox[item.id] ?? "", item.standardCost)}
              onCpBlur={(item) => commitField(item.id, "standardClientRate", cpBox[item.id] ?? "", item.standardClientRate)}
              onApplySuggested={applySuggested}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DepartmentRates({
  cat, bpBox, cpBox, busy, onBpChange, onCpChange, onBpBlur, onCpBlur, onApplySuggested,
}: {
  cat: RateCategory;
  bpBox: Record<string, string>;
  cpBox: Record<string, string>;
  busy: Record<string, boolean>;
  onBpChange: (id: string, v: string) => void;
  onCpChange: (id: string, v: string) => void;
  onBpBlur: (item: RateItem) => void;
  onCpBlur: (item: RateItem) => void;
  onApplySuggested: (id: string, suggested: number) => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{cat.icon ? `${cat.icon} ${cat.name}` : cat.name}</h3>
        <span className="text-xs text-muted-foreground">
          {cat.items.length} service{cat.items.length === 1 ? "" : "s"}
        </span>
      </div>

      {cat.items.length === 0 ? (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">No services yet.</p>
      ) : (
        <div className="mt-3 border-t border-border pt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">BP (cost)</TableHead>
                <TableHead className="text-right">CP (client rate)</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cat.items.map((item) => {
                const bpRaw = bpBox[item.id] ?? "";
                const cpRaw = cpBox[item.id] ?? "";
                const bpVal = parseBoxValue(bpRaw);
                const cpVal = parseBoxValue(cpRaw);
                const bp = bpVal === undefined ? null : bpVal;
                const cp = cpVal === undefined ? null : cpVal;
                const margin = bp !== null && cp !== null ? marginFor(bp, cp) : null;
                const isLoss = margin !== null && margin.profit < 0;
                const suggested = bp !== null ? suggestOfficialPrice(bp, cat.name) : null;
                const rowBusy = !!busy[item.id];

                return (
                  <TableRow key={item.id} className={isLoss ? "bg-rose-500/10" : undefined}>
                    <TableCell className="text-xs font-medium">
                      {item.name}
                      {isLoss && (
                        <span className="ml-1.5 inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-rose-400">
                          <AlertTriangle className="h-2.5 w-2.5" /> Loses money
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.unit}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        disabled={rowBusy}
                        value={bpRaw}
                        onChange={(e) => onBpChange(item.id, e.target.value)}
                        onBlur={() => onBpBlur(item)}
                        placeholder="—"
                        className="ml-auto h-7 w-28 text-right font-mono text-xs"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          disabled={rowBusy}
                          value={cpRaw}
                          onChange={(e) => onCpChange(item.id, e.target.value)}
                          onBlur={() => onCpBlur(item)}
                          placeholder="—"
                          className="ml-auto h-7 w-28 text-right font-mono text-xs"
                        />
                        {cp === null && suggested !== null && (
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => onApplySuggested(item.id, suggested)}
                            className="text-[10px] text-muted-foreground underline decoration-dotted hover:text-primary disabled:opacity-40"
                          >
                            Suggested {formatNGN(suggested)} — use this
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {margin === null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className={margin.profit >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          <p className="font-mono text-xs font-semibold">{formatNGN(margin.profit)}</p>
                          <p className="text-[10px]">{formatPct(margin.percent)}</p>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
