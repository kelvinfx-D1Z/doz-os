"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { SectionHeader, EmptyState, StatusBadge } from "@/components/doz/ui-primitives";
import { formatNGN, formatDate } from "@/lib/format";
import { collectableAmount, MONEY_EPSILON } from "@/lib/received-allocation";
import { FileText, Plus, Loader2, ExternalLink, ArrowRightLeft, Banknote, Trash2, Receipt as ReceiptIcon } from "lucide-react";
import { toast } from "sonner";
import { DocumentBuilder } from "@/components/modules/documents/document-builder";

// Documents — quotations, invoices and receipts for clients. Reads/writes the
// same Invoice rows Finance and the client portal already use; this is not a
// second store or a second status vocabulary, just a founder-facing front end
// for issuing the paperwork.
//
// Money-only surface: gated FOUNDER-or-explicitly-granted at the app-shell
// nav level, matching canIssueDocuments() on the server.

interface AccountRef { id: string; name: string }
interface ProjectRef { id: string; name: string }
interface DocLine {
  id: string;
  section: string | null;
  description: string;
  subDescription: string | null;
  days: number;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Quotation {
  id: string;
  code: string;
  status: string;
  title: string | null;
  total: number;
  subtotal: number;
  discount: number;
  vatRate: number;
  tax: number;
  whtRate: number;
  vatWithheldAtSource: boolean;
  detailLevel: string;
  validUntil: string | null;
  convertedInvoiceId: string | null;
  createdAt: string;
  account: AccountRef | null;
  project: ProjectRef | null;
  lines: DocLine[];
}

export interface Invoice {
  id: string;
  code: string | null;
  status: string;
  title: string | null;
  amount: number;
  expectedCash: number;
  amountPaid: number;
  whtRate: number;
  vatWithheldAtSource: boolean;
  detailLevel: string;
  dueDate: string | null;
  quotationId: string | null;
  createdAt: string;
  account: AccountRef | null;
  project: ProjectRef | null;
  lines: DocLine[];
}

interface ReceiptRow {
  id: string;
  code: string;
  amount: number;
  method: string | null;
  reference: string | null;
  receivedAt: string;
  balanceAfter: number;
  invoice: { id: string; code: string | null; amount: number; account: { name: string } | null } | null;
}

/** Opens the print route in a new tab — never in-app, so a client link never
 * carries the founder's own navigation chrome around it. */
function openDocument(type: "quotation" | "invoice" | "receipt", id: string) {
  window.open(`/documents/${type}/${id}/print`, "_blank", "noopener,noreferrer");
}

export function DocumentsModule() {
  const [quotations, setQuotations] = useState<Quotation[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [receipts, setReceipts] = useState<ReceiptRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAll = useCallback(() => {
    return Promise.all([
      fetch("/api/doz/documents/quotations").then((r) => r.json().then((j) => ({ ok: r.ok, status: r.status, j }))),
      fetch("/api/doz/documents/invoices").then((r) => r.json().then((j) => ({ ok: r.ok, status: r.status, j }))),
      fetch("/api/doz/documents/receipts").then((r) => r.json().then((j) => ({ ok: r.ok, status: r.status, j }))),
    ]).then(([q, i, r]) => {
      if (!q.ok) throw new Error(q.j?.error || `Failed to load quotations (${q.status})`);
      if (!i.ok) throw new Error(i.j?.error || `Failed to load invoices (${i.status})`);
      if (!r.ok) throw new Error(r.j?.error || `Failed to load receipts (${r.status})`);
      setQuotations(q.j.quotations ?? []);
      setInvoices(i.j.invoices ?? []);
      setReceipts(r.j.receipts ?? []);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAll().catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load documents");
    });
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  async function convertToInvoice(q: Quotation) {
    setBusyId(q.id);
    try {
      const r = await fetch("/api/doz/documents/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotationId: q.id }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      toast.success(`Converted to invoice ${j.invoice?.code ?? ""}`.trim());
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't convert", { duration: 8000 });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteQuotation(q: Quotation) {
    if (!confirm(`Delete quotation ${q.code}? This cannot be undone.`)) return;
    setBusyId(q.id);
    try {
      const r = await fetch("/api/doz/documents/quotations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotationId: q.id }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      toast.success(`${q.code} deleted`);
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete", { duration: 8000 });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteInvoice(inv: Invoice) {
    if (!confirm(`Delete invoice ${inv.code ?? inv.id}? This cannot be undone.`)) return;
    setBusyId(inv.id);
    try {
      const r = await fetch("/api/doz/documents/invoices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: inv.id }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      toast.success(`${inv.code ?? "Invoice"} deleted`);
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete", { duration: 8000 });
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <Card className="p-6"><p className="text-sm text-destructive">{error}</p></Card>;
  if (!quotations || !invoices || !receipts) {
    return <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>;
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={<FileText className="h-4 w-4" />}
        title="Documents"
        description="Quotations, invoices and receipts — issued from the same numbers Finance already tracks"
        action={
          <Button className="gap-1.5" onClick={() => setBuilderOpen(true)}>
            <Plus className="h-4 w-4" /> New document
          </Button>
        }
      />

      <Tabs defaultValue="quotations">
        <TabsList>
          <TabsTrigger value="quotations">Quotations</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
        </TabsList>

        <TabsContent value="quotations">
          <div className="space-y-3">
            {quotations.length === 0 ? (
              <EmptyState icon={<FileText className="h-8 w-8" />} title="No quotations yet" hint="Create one to send a client a priced proposal." />
            ) : (
              quotations.map((q) => (
                <QuotationRow
                  key={q.id}
                  q={q}
                  busy={busyId === q.id}
                  onConvert={() => convertToInvoice(q)}
                  onDelete={() => deleteQuotation(q)}
                />
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="invoices">
          <div className="space-y-3">
            {invoices.length === 0 ? (
              <EmptyState icon={<Banknote className="h-8 w-8" />} title="No invoices yet" hint="Convert a quotation, or create an invoice directly." />
            ) : (
              invoices.map((inv) => (
                <InvoiceRow
                  key={inv.id}
                  inv={inv}
                  busy={busyId === inv.id}
                  onDelete={() => deleteInvoice(inv)}
                  onRecordPayment={() => setPaymentTarget(inv)}
                />
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="receipts">
          <div className="space-y-3">
            {receipts.length === 0 ? (
              <EmptyState icon={<ReceiptIcon className="h-8 w-8" />} title="No receipts yet" hint="Receipts appear here once a payment is recorded against an invoice." />
            ) : (
              receipts.map((r) => <ReceiptRowCard key={r.id} r={r} />)
            )}
          </div>
        </TabsContent>
      </Tabs>

      <DocumentBuilder open={builderOpen} onOpenChange={setBuilderOpen} onSaved={() => loadAll().catch(() => {})} />
      <RecordPaymentDialog
        invoice={paymentTarget}
        onOpenChange={(open) => { if (!open) setPaymentTarget(null); }}
        onSaved={() => loadAll().catch(() => {})}
      />
    </div>
  );
}

function QuotationRow({
  q, busy, onConvert, onDelete,
}: { q: Quotation; busy: boolean; onConvert: () => void; onDelete: () => void }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-primary">{q.code}</span>
            <StatusBadge status={q.status} />
            {q.convertedInvoiceId && (
              <span className="text-[10px] text-muted-foreground">→ converted to invoice</span>
            )}
          </div>
          <p className="mt-1.5 text-sm font-semibold">{q.title || q.account?.name || "Untitled quotation"}</p>
          <p className="text-xs text-muted-foreground">
            {q.account?.name ?? "No client"} · {formatDate(q.createdAt)}
            {q.lines.length > 0 && ` · ${q.lines.length} line item${q.lines.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tracking-tight">{formatNGN(q.total)}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => openDocument("quotation", q.id)}>
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </Button>
        {!q.convertedInvoiceId && (
          <Button size="sm" variant="outline" className="h-7 gap-1.5" disabled={busy} onClick={onConvert}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />} Convert to invoice
          </Button>
        )}
        {!q.convertedInvoiceId && (
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-destructive hover:text-destructive" disabled={busy} onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        )}
      </div>
    </Card>
  );
}

function InvoiceRow({
  inv, busy, onDelete, onRecordPayment,
}: { inv: Invoice; busy: boolean; onDelete: () => void; onRecordPayment: () => void }) {
  const collectable = collectableAmount(inv);
  const balance = Math.max(0, collectable - inv.amountPaid);
  const canRecordPayment = inv.status !== "PAID" && balance > MONEY_EPSILON;
  const canDelete = inv.amountPaid <= 0;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-primary">{inv.code ?? inv.id.slice(0, 8)}</span>
            <StatusBadge status={inv.status} />
          </div>
          <p className="mt-1.5 text-sm font-semibold">{inv.title || inv.account?.name || "Untitled invoice"}</p>
          <p className="text-xs text-muted-foreground">
            {inv.account?.name ?? "No client"} · {formatDate(inv.createdAt)}
            {inv.lines.length > 0 && ` · ${inv.lines.length} line item${inv.lines.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tracking-tight">{formatNGN(inv.amount)}</p>
          {inv.amountPaid > 0 && (
            <p className="text-[10px] text-muted-foreground">{formatNGN(inv.amountPaid)} paid</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => openDocument("invoice", inv.id)}>
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </Button>
        {canRecordPayment && (
          <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={onRecordPayment}>
            <Banknote className="h-3.5 w-3.5" /> Record payment
          </Button>
        )}
        {canDelete && (
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-destructive hover:text-destructive" disabled={busy} onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        )}
      </div>
    </Card>
  );
}

function ReceiptRowCard({ r }: { r: ReceiptRow }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-primary">{r.code}</span>
            {r.method && <Badge variant="outline" className="text-[10px]">{r.method}</Badge>}
          </div>
          <p className="mt-1.5 text-sm font-semibold">{r.invoice?.account?.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">
            {r.invoice?.code ?? "—"} · {formatDate(r.receivedAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tracking-tight">{formatNGN(r.amount)}</p>
          <p className="text-[10px] text-muted-foreground">balance {formatNGN(r.balanceAfter)}</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end border-t border-border pt-3">
        <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => openDocument("receipt", r.id)}>
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </Button>
      </div>
    </Card>
  );
}

function RecordPaymentDialog({
  invoice, onOpenChange, onSaved,
}: { invoice: Invoice | null; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [saving, setSaving] = useState(false);

  const open = invoice !== null;
  const balance = invoice ? Math.max(0, collectableAmount(invoice) - invoice.amountPaid) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || saving) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter the amount received as a positive number");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/doz/documents/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          amount: amt,
          method: method.trim() || undefined,
          reference: reference.trim() || undefined,
          receivedAt: receivedAt || undefined,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      toast.success(`Receipt ${j.receipt?.code ?? ""} recorded`.trim());
      setAmount("");
      setMethod("");
      setReference("");
      setReceivedAt("");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record payment", { duration: 8000 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {invoice ? `${invoice.code ?? "Invoice"} · balance ${formatNGN(balance)}` : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rp-amount">Amount received (NGN) *</Label>
            <Input id="rp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rp-method">Method</Label>
              <Input id="rp-method" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Bank transfer" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-ref">Reference</Label>
              <Input id="rp-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-date">Received on</Label>
            <Input id="rp-date" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
