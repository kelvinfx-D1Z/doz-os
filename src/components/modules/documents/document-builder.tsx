"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatNGN as naira } from "@/lib/format";
import { computeTax, lineAmount, sumLines, VAT_RATE } from "@/lib/document-math";
import { applyGrossUp } from "@/lib/document-request";
import { ClientSelect } from "@/components/modules/projects-events";
import { DescriptionCombobox, type ServiceCatalogueCategory } from "@/components/modules/documents/description-combobox";
import { SectionCombobox } from "@/components/modules/documents/section-combobox";
import { buildRateCardIndex, resolvePublishedRate } from "@/lib/pricing";

// The document builder — one dialog, two outcomes (quotation or invoice).
// Every number shown here comes from the same pure helpers the API uses
// (document-math.ts) so what the founder previews is exactly what gets
// stored: no second formula living in the client.

type DocType = "QUOTATION" | "INVOICE";

interface BuilderLine {
  key: string;
  section: string;
  description: string;
  subDescription: string;
  quantity: string;
  days: string;
  unitPrice: string;
}

function emptyLine(): BuilderLine {
  return {
    key: Math.random().toString(36).slice(2),
    section: "",
    description: "",
    subDescription: "",
    quantity: "1",
    days: "1",
    unitPrice: "",
  };
}

interface ProjectOption {
  id: string;
  name: string;
}

// The shape this builder actually reads from GET /api/doz/projects/pricing.
// Deliberately missing `unitPrice` (the cost/BP field the API also returns)
// — this component has no legitimate use for it, so it isn't even given a
// name to reach for. A budget's cost must never become a client's price, and
// the surest way to enforce that is to leave it unnamed here.
//
// The two prices it may read are both CLIENT-facing: `clientPrice`, set by the
// founder when a budget was converted, and `suggested` — the published rate
// card figure, or the section markup where there is none. That is what lets an
// unconverted budget be quoted at all.
interface ProjectPricingLine {
  serviceName: string;
  section: string | null;
  quantity: number;
  days: number;
  clientPrice: number | null;
  suggested: number;
}

interface ProjectPricingResponse {
  stage: "BASE" | "OFFICIAL";
  lines: ProjectPricingLine[];
}

const NO_PROJECT = "__none__";

/** ISO datetime (or plain date) string -> the "YYYY-MM-DD" a date input wants. */
function toDateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * The subset of a fetched Quotation the builder needs to reopen it for
 * editing. Deliberately a structural shape rather than an import of
 * documents.tsx's own `Quotation` — the two modules stay decoupled, and any
 * object with these fields (a real quotation row) satisfies it.
 */
export interface EditableQuotation {
  id: string;
  code: string;
  title: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  validUntil: string | null;
  detailLevel: string;
  discount: number;
  vatRate: number;
  // Deliberately no `whtRate` here. The only writer of a quotation's
  // whtRate anywhere in this codebase is this builder's own submit(),
  // which always sends `government ? 5 : 0` — WHT_RATE tied 1:1 to the
  // "client withholds tax at source" checkbox, never set independently.
  // Seeding `government` from `vatWithheldAtSource` below already
  // reconstructs the correct rate; adding an unread `whtRate` field would
  // look load-bearing without doing anything.
  vatWithheldAtSource: boolean;
  targetNet: number | null;
  account: { id: string } | null;
  project: { id: string } | null;
  lines: Array<{
    section: string | null;
    description: string;
    subDescription: string | null;
    quantity: number;
    days: number;
    unitPrice: number;
  }>;
}

function linesFromQuotation(q: EditableQuotation): BuilderLine[] {
  if (q.lines.length === 0) return [emptyLine()];
  return q.lines.map((l) => ({
    key: Math.random().toString(36).slice(2),
    section: l.section ?? "",
    description: l.description,
    subDescription: l.subDescription ?? "",
    quantity: String(l.quantity),
    days: String(l.days),
    // A real ₦0 unit price (a complimentary line) must survive the
    // round-trip exactly as typed — String(0) is "0", not "".
    unitPrice: String(l.unitPrice),
  }));
}

export function DocumentBuilder({
  open,
  onOpenChange,
  onSaved,
  initialProjectId,
  initialQuotation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /**
   * Hands the builder a project already chosen — how Budgets' "Create
   * quotation" action closes the founder's gap: he lands here with the
   * project preselected and, once its pricing loads, its priced lines
   * already in the grid rather than empty rows waiting to be typed. Every
   * other caller (the plain "New document" button) omits this and the
   * builder behaves exactly as before.
   */
  initialProjectId?: string;
  /**
   * Reopens the builder on an existing DRAFT quotation instead of a blank
   * one: every field seeded from it, and saving PATCHes that same
   * quotation rather than POSTing a new one. The caller (documents.tsx)
   * forces a fresh mount per quotation via a `key`, exactly like
   * `initialProjectId` above — seeded once at construction, never synced
   * in later via an effect.
   */
  initialQuotation?: EditableQuotation | null;
}) {
  const isEditing = !!initialQuotation;
  const [docType, setDocType] = useState<DocType>("QUOTATION");
  const [accountId, setAccountId] = useState(initialQuotation?.account?.id ?? "");
  // Seeded from `initialProjectId` (new document) or the edited quotation's
  // own project (edit) at construction time only. The caller forces a
  // fresh mount for a new preselection/quotation by keying this component,
  // so there is no later prop-to-state sync to do here — no effect calling
  // setProjectId, just an initializer.
  const [projectId, setProjectId] = useState(initialQuotation?.project?.id ?? initialProjectId ?? "");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [title, setTitle] = useState(initialQuotation?.title ?? "");
  const [eventStart, setEventStart] = useState(toDateInputValue(initialQuotation?.eventStart));
  const [eventEnd, setEventEnd] = useState(toDateInputValue(initialQuotation?.eventEnd));
  const [dueDate, setDueDate] = useState("");
  const [validUntil, setValidUntil] = useState(toDateInputValue(initialQuotation?.validUntil));
  const [lines, setLines] = useState<BuilderLine[]>(
    initialQuotation ? linesFromQuotation(initialQuotation) : [emptyLine()],
  );
  const [serviceCatalogue, setServiceCatalogue] = useState<ServiceCatalogueCategory[] | null>(null);

  // A quotation is priced at CP — what the client pays — so picking a service
  // here fills in the rate card's client rate, exactly as picking one on a
  // budget line fills in its cost. Same index and same matching rule the
  // pricing route uses (name + department, case- and whitespace-insensitive,
  // ambiguous duplicates deliberately unresolved), so a figure suggested here
  // and one suggested there can never disagree.
  const rateIndex = useMemo(
    () =>
      buildRateCardIndex(
        (serviceCatalogue ?? []).flatMap((c) =>
          c.items.map((i) => ({
            name: i.name,
            category: c.name,
            standardClientRate: i.standardClientRate,
          })),
        ),
      ),
    [serviceCatalogue],
  );

  const [detailLevel, setDetailLevel] = useState<"SUMMARY" | "ITEMISED">(
    initialQuotation?.detailLevel === "ITEMISED" ? "ITEMISED" : "SUMMARY",
  );
  const [government, setGovernment] = useState(initialQuotation?.vatWithheldAtSource ?? false);
  const [grossUpTarget, setGrossUpTarget] = useState(
    initialQuotation?.targetNet != null ? String(initialQuotation.targetNet) : "",
  );
  // discount/vatRate are read with `??`, not `||` — a real 0% VAT or ₦0
  // discount on the edited quotation must not fall back to the create
  // defaults.
  const [discount, setDiscount] = useState(
    initialQuotation ? String(initialQuotation.discount ?? 0) : "",
  );
  const [vatRate, setVatRate] = useState(
    initialQuotation ? String(initialQuotation.vatRate ?? VAT_RATE) : String(VAT_RATE),
  );
  const [saving, setSaving] = useState(false);
  // Keyed by the projectId it was fetched for, so a project change never
  // needs a synchronous "clear the old value" setState inside the effect
  // body — stale data is simply ignored by the `projectId` check below
  // wherever this is read.
  const [projectPricing, setProjectPricing] = useState<{
    projectId: string;
    data: ProjectPricingResponse | null;
  } | null>(null);

  // Loaded once on mount, like ClientSelect's own account fetch — this
  // component stays mounted (only <DialogContent> hides), so a plain effect
  // with setState in its .then() continuation is safe and lint-clean.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/doz/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setProjects(
          (d.projects ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
        );
      })
      .catch(() => {
        /* non-fatal — the picker just stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Same one-shot pattern: fetched once while the builder is mounted, not
  // per line. A failed or empty fetch leaves this null/[] and every line's
  // DescriptionCombobox degrades to a plain free-text input on its own —
  // the founder is never blocked from creating a document.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/doz/services")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setServiceCatalogue(d?.categories ?? []);
      })
      .catch(() => {
        if (!cancelled) setServiceCatalogue([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Refetches whenever the chosen project changes — this is how the builder
  // knows the project's pricing stage (to show the button vs. the plain
  // sentence) and, if OFFICIAL, holds the priced lines the button will load.
  // No project selected means nothing to fetch, so the effect returns with
  // no setState at all; every setState call below happens inside a
  // .then()/.catch() continuation, never synchronously in the effect body.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/doz/projects/pricing?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ProjectPricingResponse | null) => {
        if (cancelled) return;
        setProjectPricing({ projectId, data: d });
      })
      .catch(() => {
        if (!cancelled) setProjectPricing({ projectId, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Ignore any pricing payload that was fetched for a different project —
  // this is what makes clearing the picker or switching projects safe
  // without an extra setState to "reset" anything.
  const currentPricing =
    projectPricing && projectPricing.projectId === projectId ? projectPricing.data : null;
  const pricingLoading = projectId !== "" && (!projectPricing || projectPricing.projectId !== projectId);

  function loadFromProject() {
    if (!currentPricing) return;

    // A budget that has not been converted is still quotable. `suggested` is
    // the published client rate where the rate card has one, and the section
    // markup otherwise — precisely what converting would have written. Waiting
    // for OFFICIAL bought nothing and blocked the founder: he approved a budget
    // through the cost sheet, came here to quote it, and found the row
    // disabled. A quotation is a draft he edits anyway.
    //
    // clientPrice still wins where it exists — a figure he set by hand is not
    // replaced by a suggestion.
    const nextLines: BuilderLine[] = currentPricing.lines.map((l) => ({
      key: Math.random().toString(36).slice(2),
      section: l.section ?? "",
      description: l.serviceName,
      subDescription: "",
      quantity: String(l.quantity),
      days: String(l.days),
      // Only ever a CLIENT-facing figure. The project's cost (unitPrice/BP) is
      // never read here — a budget's cost must not become a client's price.
      unitPrice: String(l.clientPrice ?? l.suggested),
    }));
    const suggestedCount = currentPricing.lines.filter((l) => l.clientPrice === null).length;

    const apply = () => {
      setLines(nextLines.length > 0 ? nextLines : [emptyLine()]);
      toast.success(
        `Loaded ${nextLines.length} line(s) from the budget`,
        suggestedCount > 0
          ? {
              description:
                `${suggestedCount} priced from the rate card or the section markup — ` +
                `check them before sending.`,
              duration: 9000,
            }
          : undefined,
      );
    };

    const hasTypedWork = lines.some(
      (l) =>
        l.description.trim() !== "" ||
        l.subDescription.trim() !== "" ||
        l.section.trim() !== "" ||
        l.unitPrice.trim() !== "",
    );
    if (hasTypedWork) {
      const ok = window.confirm(
        "This replaces the current line items with the project's priced lines. Continue?",
      );
      if (!ok) return;
    }
    apply();
  }

  // Drives `initialProjectId`: once the handed-over project's pricing has
  // loaded and confirms it is OFFICIAL, loads its priced lines — exactly
  // once per project, tracked by id rather than a plain boolean so a second
  // "Create quotation" click for a *different* project (a fresh mount, see
  // the `key` on this component in documents.tsx) auto-loads again. The
  // project itself is never set here: it is seeded once at construction via
  // `useState(initialProjectId ?? "")` above, so there is nothing to
  // synchronise into state from this effect.
  const autoLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      autoLoadedRef.current = null;
      return;
    }
    // Never applies while editing an existing quotation — its lines came
    // from the quotation itself, not from a project hand-off, and must not
    // be silently replaced by the project's current pricing.
    if (isEditing) return;
    if (!initialProjectId || projectId !== initialProjectId) return;
    if (autoLoadedRef.current === initialProjectId) return;
    if (currentPricing) {
      autoLoadedRef.current = initialProjectId;
      loadFromProject();
    }
  }, [open, initialProjectId, projectId, currentPricing]);

  function updateLine(key: string, patch: Partial<BuilderLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function toggleGovernment(checked: boolean) {
    setGovernment(checked);
    if (!checked) setGrossUpTarget("");
  }

  const numericLines = lines.map((l) => ({
    section: l.section.trim() || null,
    description: l.description,
    subDescription: l.subDescription.trim() || null,
    quantity: Number(l.quantity) || 0,
    days: Number(l.days) || 0,
    unitPrice: Number(l.unitPrice) || 0,
  }));

  const discountNum = Number(discount) || 0;
  const vatRateNum = vatRate === "" ? VAT_RATE : Number(vatRate) || 0;
  const whtRateNum = government ? 5 : 0;
  const currentSubtotal = sumLines(numericLines);
  const currentTax = computeTax({
    subtotal: currentSubtotal,
    discount: discountNum,
    vatRate: vatRateNum,
    whtRate: whtRateNum,
    vatWithheldAtSource: government,
  });

  const targetNetNum = Number(grossUpTarget) || 0;
  // Preview the figure that will ACTUALLY BE STORED, not the un-rounded ideal.
  // The server runs applyGrossUp, which scales every unit price and then rounds
  // each one to the nearest 100 naira, so the stored total differs from the
  // theoretical gross-up by a few hundred naira on a job of this size.
  // Previewing grossUpSubtotal() directly showed the founder a number the
  // server would never produce. Running the same two pure functions the server
  // runs — applyGrossUp then sumLines — means the panel and the database
  // cannot disagree. The design spec is explicit: show the actual figure next
  // to the target rather than hiding the difference.
  const preview =
    government && targetNetNum > 0
      ? (() => {
          const grossedUp = applyGrossUp(
            numericLines,
            targetNetNum,
            whtRateNum,
            discountNum,
          ).lines;
          return computeTax({
            subtotal: sumLines(grossedUp),
            discount: discountNum,
            vatRate: vatRateNum,
            whtRate: whtRateNum,
            vatWithheldAtSource: true,
          });
        })()
      : null;

  function reset() {
    setDocType("QUOTATION");
    setAccountId("");
    setProjectId("");
    setTitle("");
    setEventStart("");
    setEventEnd("");
    setDueDate("");
    setValidUntil("");
    setLines([emptyLine()]);
    setDetailLevel("SUMMARY");
    setGovernment(false);
    setGrossUpTarget("");
    setDiscount("");
    setVatRate(String(VAT_RATE));
  }

  async function submit() {
    if (saving) return;
    const validLines = numericLines.filter((l) => l.description.trim().length > 0);
    if (validLines.length === 0) {
      toast.error("Add at least one line with a description");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        lines: validLines,
        projectId: projectId || undefined,
        accountId: accountId || undefined,
        title: title.trim() || undefined,
        eventStart: eventStart || undefined,
        eventEnd: eventEnd || undefined,
        detailLevel,
        discount: discountNum,
        vatRate: vatRateNum,
        whtRate: whtRateNum,
        vatWithheldAtSource: government,
        targetNet: government && targetNetNum > 0 ? targetNetNum : undefined,
      };

      let r: Response;
      if (isEditing && initialQuotation) {
        // Editing always means a quotation, in DRAFT, PATCHed back onto
        // itself — same code, same id, no new document minted. The server
        // mirrors POST's own validation and tax computation for this body;
        // it refuses the write if the quotation is no longer DRAFT.
        body.quotationId = initialQuotation.id;
        body.validUntil = validUntil || undefined;
        r = await fetch("/api/doz/documents/quotations", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        if (docType === "QUOTATION") {
          body.validUntil = validUntil || undefined;
        } else {
          body.dueDate = dueDate || undefined;
        }
        const endpoint =
          docType === "QUOTATION" ? "/api/doz/documents/quotations" : "/api/doz/documents/invoices";
        r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);

      // The server always returns the authoritative expectedCash it stored;
      // the builder used to discard it on create. Echoing it back closes
      // the loop — the founder sees the real cash-landing figure from the
      // server, not just the client-side preview of it. Internal only: WHT
      // and cash landing never appear on a rendered client document.
      const landed = typeof j.expectedCash === "number" ? j.expectedCash : null;
      if (isEditing && initialQuotation) {
        toast.success(
          `${initialQuotation.code} updated`,
          government && landed !== null
            ? { description: `Cash landing ${naira(landed)} (internal — not printed)` }
            : undefined,
        );
      } else {
        const code = docType === "QUOTATION" ? j.quotation?.code : j.invoice?.code;
        const label = docType === "QUOTATION" ? "Quotation" : "Invoice";
        toast.success(
          `${label} ${code ?? ""} created`.trim(),
          government && landed !== null
            ? { description: `Cash landing ${naira(landed)} (internal — not printed)` }
            : undefined,
        );
      }
      reset();
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save document", { duration: 8000 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit ${initialQuotation?.code}` : "New document"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Still a DRAFT — change anything below and save. The code stays the same."
              : "Build a quotation or invoice — the numbers here are exactly what gets stored."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="doc-type">Document type</Label>
              <Select value={docType} onValueChange={(v) => setDocType(v as DocType)} disabled={isEditing}>
                <SelectTrigger id="doc-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="QUOTATION">Quotation</SelectItem>
                  <SelectItem value="INVOICE">Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-client">Client</Label>
              <ClientSelect id="doc-client" value={accountId} onChange={setAccountId} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="doc-project">Project (optional)</Label>
              <Select
                value={projectId || NO_PROJECT}
                onValueChange={(v) => setProjectId(v === NO_PROJECT ? "" : v)}
              >
                <SelectTrigger id="doc-project"><SelectValue placeholder="No project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT}>No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Title</Label>
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          {projectId && !pricingLoading && currentPricing?.stage === "OFFICIAL" && (
            <Button type="button" size="sm" variant="outline" onClick={loadFromProject}>
              Load priced lines from this project
            </Button>
          )}
          {projectId && !pricingLoading && currentPricing?.stage === "BASE" && (
            <p className="text-xs text-muted-foreground">
              This project hasn&apos;t been priced yet. Price it from the project&apos;s markup panel first.
            </p>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="doc-event-start">Event start</Label>
              <Input id="doc-event-start" type="date" value={eventStart} onChange={(e) => setEventStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-event-end">Event end</Label>
              <Input id="doc-event-end" type="date" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-due">{docType === "QUOTATION" ? "Valid until" : "Due date"}</Label>
              <Input
                id="doc-due"
                type="date"
                value={docType === "QUOTATION" ? validUntil : dueDate}
                onChange={(e) =>
                  docType === "QUOTATION" ? setValidUntil(e.target.value) : setDueDate(e.target.value)
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1" onClick={addLine}>
                <Plus className="h-3.5 w-3.5" /> Add row
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Section</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-16">Qty</TableHead>
                    <TableHead className="w-16">Days</TableHead>
                    <TableHead className="w-28">Unit price</TableHead>
                    <TableHead className="w-28 text-right">Amount</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.key}>
                      <TableCell>
                        <SectionCombobox
                          value={l.section}
                          onChange={(section) => updateLine(l.key, { section })}
                          categories={serviceCatalogue}
                          placeholder="Section"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <DescriptionCombobox
                            value={l.description}
                            onChange={(description) => updateLine(l.key, { description })}
                            onPick={(description, section) => {
                              const dept = l.section.trim() || section;
                              const cp = resolvePublishedRate(rateIndex, description, dept);
                              updateLine(l.key, {
                                description,
                                // Back-fill only when Section is still empty —
                                // once the founder has set it, picking a
                                // description must not overwrite their choice.
                                ...(l.section.trim() ? {} : { section }),
                                // The published client rate, when there is one.
                                // undefined means unpriced, not allowed, or two
                                // catalogue rows disagreeing — in every one of
                                // those the founder's own figure stands rather
                                // than being replaced by a guess. A published 0
                                // IS filled: a complimentary line is a decision.
                                ...(cp !== undefined ? { unitPrice: String(cp) } : {}),
                              });
                            }}
                            categories={serviceCatalogue}
                            section={l.section}
                            placeholder="Description"
                          />
                          <Input
                            value={l.subDescription}
                            onChange={(e) => updateLine(l.key, { subDescription: e.target.value })}
                            placeholder="Sub-description (optional)"
                            className="h-7 text-xs"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.quantity}
                          onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                          inputMode="numeric"
                          className="h-8 w-16"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.days}
                          onChange={(e) => updateLine(l.key, { days: e.target.value })}
                          inputMode="numeric"
                          className="h-8 w-16"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.unitPrice}
                          onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                          inputMode="decimal"
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {naira(
                          lineAmount({
                            quantity: Number(l.quantity) || 0,
                            days: Number(l.days) || 0,
                            unitPrice: Number(l.unitPrice) || 0,
                          }),
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeLine(l.key)}
                          disabled={lines.length <= 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Detail level</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={detailLevel === "SUMMARY" ? "default" : "outline"}
                onClick={() => setDetailLevel("SUMMARY")}
              >
                Summary
              </Button>
              <Button
                type="button"
                size="sm"
                variant={detailLevel === "ITEMISED" ? "default" : "outline"}
                onClick={() => setDetailLevel("ITEMISED")}
              >
                Itemised
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Summary groups lines by section. Itemised shows every line — use it for clients who ask for the full breakdown.
            </p>
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <Checkbox id="doc-gov" checked={government} onCheckedChange={(v) => toggleGovernment(v === true)} />
              <Label htmlFor="doc-gov" className="cursor-pointer text-sm font-normal">
                Client withholds tax at source (government/MDA)
              </Label>
            </div>
            {government && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="doc-grossup">Amount this job must bring in</Label>
                <Input
                  id="doc-grossup"
                  inputMode="decimal"
                  value={grossUpTarget}
                  onChange={(e) => setGrossUpTarget(e.target.value)}
                  placeholder="e.g. 15000000"
                />
                {preview && (
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <p>
                      Invoice total {naira(preview.total)} · cash landing{" "}
                      {naira(preview.expectedCash)}
                    </p>
                    {/* The difference is shown, never hidden: rounding each unit
                        price to the nearest ₦100 means the cash landing lands
                        near the target rather than exactly on it. */}
                    <p>
                      Target {naira(targetNetNum)} ·{" "}
                      {preview.expectedCash >= targetNetNum ? "over" : "under"} by{" "}
                      {naira(Math.abs(preview.expectedCash - targetNetNum))} after rounding
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="doc-discount">Discount (NGN)</Label>
              <Input id="doc-discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-vat">VAT rate (%)</Label>
              <Input id="doc-vat" inputMode="decimal" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{naira(currentSubtotal)}</span>
            </div>
            {discountNum > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{naira(discountNum)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">VAT ({vatRateNum}%)</span>
              <span>{naira(currentTax.vat)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <span>Total</span>
              <span>{naira(currentTax.total)}</span>
            </div>
            {government && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Cash landing (internal only — never printed)</span>
                <span>{naira(currentTax.expectedCash)}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {isEditing ? "Save changes" : docType === "QUOTATION" ? "Create quotation" : "Create invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
