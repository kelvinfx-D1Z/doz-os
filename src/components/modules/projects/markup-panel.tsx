"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CircleDollarSign, Loader2, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatNGN, formatDate } from "@/lib/format";
import { lineTotal, marginFor, markupFor } from "@/lib/pricing";

// ============================================================
// Markup Panel — the one screen in the app that shows a job's cost (Base
// Price) and its client price (Official Price) side by side. FOUNDER ONLY:
// the server already refuses everyone else, but this component must never
// even attempt to render for a non-founder — see the role check below.
// ============================================================

interface PricingLine {
  id: string;
  serviceName: string;
  section: string | null;
  quantity: number;
  days: number;
  status: string;
  /** BP — what the job costs. */
  unitPrice: number;
  /** OP — what the client is charged. Null means not yet priced. */
  clientPrice: number | null;
  /** The starting point offered for OP, recomputed on every fetch. */
  suggested: number;
  /**
   * Where `suggested` came from: a published rate-card price ("RATE_CARD")
   * or the section-multiplier formula ("MARKUP") — the founder should never
   * have to wonder which one a number is.
   */
  suggestedSource: "RATE_CARD" | "MARKUP";
}

interface PricingPayload {
  stage: "BASE" | "OFFICIAL";
  convertedAt: string | null;
  lines: PricingLine[];
  baseTotal: number;
  officialTotal: number;
  margin: { profit: number; percent: number };
  unpriced: number;
}

// Text state per line, not numbers — so a founder clearing a field to
// deliberately zero it doesn't get silently coerced to a stale number, and
// so an empty field (not yet decided) stays distinguishable from a typed 0.
type PriceInputs = Record<string, string>;

/**
 * Parses one line's editable OP field.
 *
 * An empty or invalid entry is NOT the same as zero — it means "no decision
 * yet", so it returns null (unpriced) rather than 0. Only a value the founder
 * actually typed, including "0", parses to a number.
 */
function parsePrice(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function inputsFromLines(lines: PricingLine[]): PriceInputs {
  const next: PriceInputs = {};
  for (const l of lines) {
    next[l.id] = String(l.clientPrice !== null ? l.clientPrice : l.suggested);
  }
  return next;
}

export function MarkupPanel({
  projectId,
  onChanged,
  variant = "full",
}: {
  projectId: string;
  onChanged?: () => void;
  /**
   * "budget" strips this back to what a budget actually is: cost.
   *
   * A budget is internal — what the job costs D1Z — and pricing it is a
   * separate act. Showing the client rate, the markup that produced it and the
   * margin alongside the cost sheet invites the founder to read a budget as a
   * quotation. So the budget view keeps Service, Section, Qty, Days and Cost,
   * and the Convert button; the client rate, the markup caption, the official
   * total and both margin figures belong to the pricing view only.
   *
   * Converting from here still prices every line — the server falls back to
   * the published rate, then the markup, for any line without an explicit
   * figure (see resolveConvertPrice).
   */
  variant?: "full" | "budget";
}) {
  const budgetView = variant === "budget";
  const { user } = useCurrentUser();
  const [data, setData] = useState<PricingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState<PriceInputs>({});
  const [converting, setConverting] = useState(false);
  const [reopening, setReopening] = useState(false);

  const load = useCallback(() => {
    // No synchronous setLoading(true) here — the initial state is already
    // true for the first load, and a refetch after convert/reopen has `data`
    // already populated so the skeleton guard below never re-triggers.
    fetch(`/api/doz/projects/pricing?projectId=${projectId}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((d: PricingPayload) => {
        setData(d);
        setPrices(inputsFromLines(d.lines));
      })
      .catch(() => toast.error("Couldn't load pricing"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // Founder-only, without exception — the server refuses everyone else, but
  // the UI must not even attempt to show cost-vs-client-price to anyone but
  // the founder.
  if (user?.role !== "FOUNDER") return null;

  if (loading && !data) return <Skeleton className="mt-4 h-48 w-full" />;
  if (!data) return null;

  const { lines, stage, baseTotal } = data;
  const editable = stage === "BASE";

  // While editable, a line's price is whatever is currently typed (including
  // the suggested prefill, since that is exactly what gets submitted if left
  // untouched). Once locked at OFFICIAL, Convert is no longer reachable, so
  // the input's suggested prefill on a still-null line will never actually
  // be charged — the total must reflect the server's committed clientPrice,
  // not the editable-but-unsendable text sitting in a disabled input.
  function effectivePrice(l: PricingLine): number | null {
    return editable ? parsePrice(prices[l.id]) : l.clientPrice;
  }

  const officialTotalLocal = lines.reduce((sum, l) => {
    const cp = effectivePrice(l);
    if (cp === null) return sum;
    return sum + lineTotal({ quantity: l.quantity, days: l.days, price: cp });
  }, 0);
  const margin = marginFor(baseTotal, officialTotalLocal);
  const unpricedCount = lines.filter((l) => effectivePrice(l) === null).length;

  function setPrice(id: string, value: string) {
    setPrices((prev) => ({ ...prev, [id]: value }));
  }

  function handleConvert() {
    if (!data || lines.length === 0) return;
    const ok = window.confirm(
      "Convert to Official Price?\n\n" +
        "This closes the cost sheet to the production manager — they will " +
        "not be able to add or edit services until you reopen it. The " +
        "prices shown now become what the client is charged.\n\n" +
        "You can undo this later with Reopen for edits.",
    );
    if (!ok) return;

    // Only lines the founder actually priced (including a deliberate 0) are
    // sent — a line left blank is omitted so the server falls back to its
    // own suggested markup instead of receiving a phantom 0.
    const priceMap: Record<string, number> = {};
    for (const l of lines) {
      const cp = parsePrice(prices[l.id]);
      if (cp !== null) priceMap[l.id] = cp;
    }

    setConverting(true);
    fetch("/api/doz/projects/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "convert", projectId, prices: priceMap }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          // These messages are written for the founder to read verbatim —
          // do not replace them with a generic failure message.
          toast.error(body?.error || "Couldn't convert to Official Price", { duration: 8000 });
          return;
        }
        toast.success("Converted — the cost sheet is now closed to the production manager");
        load();
        onChanged?.();
      })
      .catch(() => toast.error("Couldn't convert to Official Price", { duration: 8000 }))
      .finally(() => setConverting(false));
  }

  function handleReopen() {
    const ok = window.confirm(
      "Reopen for edits?\n\n" +
        "This lets the production manager add or edit services again. " +
        "Prices you've already set are kept — nothing is cleared.",
    );
    if (!ok) return;

    setReopening(true);
    fetch("/api/doz/projects/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reopen", projectId }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(body?.error || "Couldn't reopen the cost sheet", { duration: 8000 });
          return;
        }
        toast.success("Reopened — the production manager can edit the cost sheet again");
        load();
        onChanged?.();
      })
      .catch(() => toast.error("Couldn't reopen the cost sheet", { duration: 8000 }))
      .finally(() => setReopening(false));
  }

  return (
    <div className="mt-4 rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CircleDollarSign className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Pricing — Base to Official</h4>
          <Badge variant="outline" className="text-[9px]">{stage}</Badge>
        </div>
        {stage === "OFFICIAL" && data.convertedAt && (
          <span className="text-[10px] text-muted-foreground">
            Converted {formatDate(data.convertedAt)}
          </span>
        )}
      </div>

      {!editable && (
        <p className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <LockOpen className="h-3 w-3" />
          Prices are locked in at Official Price. Reopen the cost sheet to change them.
        </p>
      )}

      {lines.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          No cost lines yet — build the Services List first.
        </p>
      ) : (
        <div className="scroll-thin max-h-72 overflow-y-auto rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Section</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">{budgetView ? "Cost" : "BP (cost)"}</TableHead>
                {!budgetView && <TableHead className="text-right">CP (client rate)</TableHead>}
                {!budgetView && <TableHead className="text-right">CP Total</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => {
                const cp = effectivePrice(l);
                const flagUnpriced = stage === "OFFICIAL" && l.clientPrice === null;
                return (
                  <TableRow key={l.id} className={flagUnpriced ? "bg-amber-500/10" : undefined}>
                    <TableCell className="text-xs font-medium">
                      {l.serviceName}
                      {flagUnpriced && (
                        <Badge className="ml-1.5 bg-amber-500/15 text-[9px] text-amber-400">Unpriced</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[9px]">{l.section ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">{l.quantity}</TableCell>
                    <TableCell className="text-right text-xs">{l.days}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatNGN(l.unitPrice)}</TableCell>
                    {!budgetView && (
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        disabled={!editable}
                        value={prices[l.id] ?? ""}
                        onChange={(e) => setPrice(l.id, e.target.value)}
                        className="ml-auto h-7 w-28 text-right font-mono text-xs"
                      />
                      {/* Always names AND shows the figure it describes
                          (l.suggested, not the field above — which holds
                          clientPrice once the founder has overridden the
                          suggestion, so the two can differ). Captioning the
                          field's own value with a provenance it doesn't
                          have is exactly the bug this replaces: a founder
                          who negotiated a price away from the rate card
                          must never see their own number relabelled
                          "Rate card". */}
                      <p className="mt-0.5 text-right text-[9px] text-muted-foreground">
                        {l.suggestedSource === "RATE_CARD"
                          ? `Rate card ${formatNGN(l.suggested)}`
                          : `×${markupFor(l.section).toFixed(2)} markup ${formatNGN(l.suggested)}`}
                      </p>
                    </TableCell>
                    )}
                    {!budgetView && (
                    <TableCell className="text-right font-mono text-xs font-semibold">
                      {cp === null ? "—" : formatNGN(lineTotal({ quantity: l.quantity, days: l.days, price: cp }))}
                    </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className={`mt-3 grid gap-2 text-center ${budgetView ? "grid-cols-1" : "grid-cols-4"}`}>
        <div className="rounded-lg bg-muted/30 p-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
            {budgetView ? "Total Cost" : "Base Total"}
          </p>
          <p className="text-sm font-bold">{formatNGN(baseTotal)}</p>
        </div>
        {!budgetView && (
        <>
        <div className="rounded-lg bg-muted/30 p-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Official Total</p>
          <p className="text-sm font-bold text-primary">{formatNGN(officialTotalLocal)}</p>
        </div>
        <div className="rounded-lg bg-muted/30 p-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Margin</p>
          <p className={`text-sm font-bold ${margin.profit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {formatNGN(margin.profit)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/30 p-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Margin %</p>
          <p className={`text-sm font-bold ${margin.profit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {margin.percent.toFixed(1)}%
          </p>
        </div>
        </>
        )}
      </div>

      {!budgetView && unpricedCount > 0 && (
        <p className="mt-2 text-center text-[10px] text-amber-400">
          {unpricedCount} line{unpricedCount === 1 ? "" : "s"} not yet priced —{" "}
          {editable
            ? "will use the suggested markup if you convert now."
            : "excluded from the Official Total until priced."}
        </p>
      )}

      <div className="mt-3 flex justify-end gap-2">
        {stage === "BASE" ? (
          <Button size="sm" onClick={handleConvert} disabled={converting || lines.length === 0}>
            {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Convert to Official Price"}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={handleReopen} disabled={reopening}>
            {reopening ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reopen for edits"}
          </Button>
        )}
      </div>
    </div>
  );
}
