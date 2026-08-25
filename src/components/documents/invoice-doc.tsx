import { computeTax, sumLines, type DocumentLineInput } from "@/lib/document-math";
import {
  DocumentShell,
  DocumentLines,
  TotalsCap,
  Field,
  naira,
  formatDay,
  formatRange,
  type CompanyInfo,
} from "./document-shell";

export type InvoiceDocData = {
  code: string;
  title: string | null;
  detailLevel: string;
  issuedDate: Date | string;
  dueDate: Date | string | null;
  eventStart: Date | string | null;
  eventEnd: Date | string | null;
  subtotal: number;
  discount: number;
  vatRate: number;
  tax: number;
  amount: number;
  paymentTerms: string | null;
  lines: DocumentLineInput[];
  account?: { name: string; billingAddress: string | null } | null;
};

type Figures = { subtotal: number; discount: number; vat: number; total: number };

/**
 * What the client is shown, reconciled against what is stored.
 *
 * Three cases, in order:
 *
 *  1. A legacy invoice — one raised by the projects route before this module
 *     existed. It has no lines and no tax breakdown, and `amount` is the
 *     figure the client was already given. Recomputing VAT on top of it would
 *     print a demand 7.5% larger than the one on record, so the amount is
 *     taken as the whole story and no VAT line is shown.
 *  2. Stored totals that agree with the lines — trust them, so the printed
 *     document matches the ledger to the naira.
 *  3. Lines edited since the totals were written — the lines are what the
 *     client can see and add up, so they win and the tax is recomputed.
 */
function invoiceFigures(invoice: InvoiceDocData, linesSubtotal: number): Figures {
  const discount = invoice.discount || 0;

  if (invoice.subtotal <= 0 && invoice.tax <= 0 && invoice.amount > 0) {
    return { subtotal: linesSubtotal, discount: 0, vat: 0, total: invoice.amount };
  }

  if (Math.abs(invoice.subtotal - linesSubtotal) < 1) {
    return { subtotal: invoice.subtotal, discount, vat: invoice.tax, total: invoice.amount };
  }

  const tax = computeTax({ subtotal: linesSubtotal, discount, vatRate: invoice.vatRate });
  return { subtotal: linesSubtotal, discount, vat: tax.vat, total: tax.total };
}

/**
 * A D1Z invoice.
 *
 * The tax block is deliberately exactly three possible rows: subtotal,
 * discount, VAT. Withholding is the payer's deduction to make and remit, not
 * a charge D1Z levies; putting it on the face of an invoice is irregular here
 * and invites a query from a government finance officer. It is stored for
 * internal reconciliation and never printed.
 */
export function InvoiceDoc({
  invoice,
  company,
}: {
  invoice: InvoiceDocData;
  company: CompanyInfo;
}) {
  const linesSubtotal = sumLines(invoice.lines);
  const { subtotal, discount, vat, total } = invoiceFigures(invoice, linesSubtotal);
  const eventDates = formatRange(invoice.eventStart, invoice.eventEnd);
  const vatRate = Number((invoice.vatRate ?? 0).toFixed(2));
  const hasBank = Boolean(company.bankName || company.bankAccount || company.bankAccountName);
  const hasRegistration = Boolean(company.rcNumber || company.tin);

  return (
    <DocumentShell kind="invoice" company={company} docCode={invoice.code}>
      {(invoice.title || eventDates) && (
        <div className="doc-lede">
          <div>
            <div className="doc-eyebrow">Project</div>
            {invoice.title && <h1>{invoice.title}</h1>}
          </div>
          {eventDates && (
            <div className="doc-lede-meta">
              <div className="doc-eyebrow">Event dates</div>
              <div className="doc-value">{eventDates}</div>
            </div>
          )}
        </div>
      )}

      <div className="doc-grid">
        <div className="doc-panel doc-panel-accent">
          <div className="doc-eyebrow">Billed to</div>
          <div className="doc-name">{invoice.account?.name ?? "—"}</div>
          {invoice.account?.billingAddress && (
            <div className="doc-text">{invoice.account.billingAddress}</div>
          )}
        </div>
        <div className="doc-panel doc-panel-narrow">
          <div className="doc-eyebrow">Invoice date</div>
          <div className="doc-value">{formatDay(invoice.issuedDate)}</div>
        </div>
        <div className="doc-panel doc-panel-narrow">
          <div className="doc-eyebrow">Payment due</div>
          <div className="doc-value">{invoice.dueDate ? formatDay(invoice.dueDate) : "On receipt"}</div>
        </div>
      </div>

      <DocumentLines lines={invoice.lines} detailLevel={invoice.detailLevel} />

      <div className="doc-close">
        <div className="doc-close-left">
          {hasBank && (
            <>
              <div className="doc-eyebrow">Payment details</div>
              <dl className="doc-dl" style={{ marginTop: "2mm" }}>
                <Field label="Bank" value={company.bankName} />
                <Field label="Account name" value={company.bankAccountName} />
                <Field label="Account number" value={company.bankAccount} />
              </dl>
            </>
          )}
          {hasRegistration && (
            <div className="doc-reg">
              {[
                company.rcNumber && `RC ${company.rcNumber}`,
                company.tin && `TIN ${company.tin}`,
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </div>
          )}
        </div>

        <div className="doc-close-right">
          <div className="doc-sum">
            <span className="doc-sum-label">Subtotal</span>
            <span>{naira(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="doc-sum">
              <span className="doc-sum-label">Discount</span>
              <span>−{naira(discount)}</span>
            </div>
          )}
          {vat > 0 && (
            <div className="doc-sum">
              <span className="doc-sum-label">VAT {vatRate}%</span>
              <span>{naira(vat)}</span>
            </div>
          )}

          <TotalsCap />
          <div className="doc-totals">
            <div className="doc-eyebrow doc-eyebrow-invert">Total due</div>
            <div className="doc-hero">{naira(total)}</div>
          </div>
        </div>
      </div>

      {invoice.paymentTerms && (
        <div className="doc-note doc-callout">{invoice.paymentTerms}</div>
      )}
    </DocumentShell>
  );
}
