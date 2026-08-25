import { computeTax, sumLines, type DocumentLineInput } from "@/lib/document-math";
import {
  DocumentShell,
  DocumentLines,
  TotalsCap,
  SignatureRule,
  naira,
  formatDay,
  formatLongDay,
  formatRange,
  type CompanyInfo,
} from "./document-shell";

export type QuotationDocData = {
  code: string;
  title: string | null;
  detailLevel: string;
  createdAt: Date | string;
  validUntil: Date | string | null;
  eventStart: Date | string | null;
  eventEnd: Date | string | null;
  subtotal: number;
  discount: number;
  vatRate: number;
  tax: number;
  total: number;
  paymentTerms: string | null;
  notes: string | null;
  lines: DocumentLineInput[];
  account?: { name: string; billingAddress: string | null } | null;
};

const ACCEPTANCE = [
  "Accepted for and on behalf of the client",
  "For D1Z Technologies",
];

/**
 * A D1Z quotation.
 *
 * Reads as an offer rather than a demand: the total is labelled "Quoted
 * total", not "amount payable", because nothing is owed until the client
 * signs. Same three tax rows as the invoice, for the same reason — the
 * withholding a government client will make at source is their deduction to
 * declare, not a figure D1Z quotes against.
 */
export function QuotationDoc({
  quotation,
  company,
}: {
  quotation: QuotationDocData;
  company: CompanyInfo;
}) {
  const linesSubtotal = sumLines(quotation.lines);
  const discount = quotation.discount || 0;

  // Stored totals win when they agree with the lines; otherwise the lines do,
  // because the lines are what the client can add up for themselves.
  const stored = Math.abs(quotation.subtotal - linesSubtotal) < 1 && quotation.total > 0;
  const derived = computeTax({ subtotal: linesSubtotal, discount, vatRate: quotation.vatRate });
  const subtotal = stored ? quotation.subtotal : linesSubtotal;
  const vat = stored ? quotation.tax : derived.vat;
  const total = stored ? quotation.total : derived.total;

  const eventDates = formatRange(quotation.eventStart, quotation.eventEnd);
  const vatRate = Number((quotation.vatRate ?? 0).toFixed(2));

  return (
    <DocumentShell kind="quotation" company={company} docCode={quotation.code}>
      {(quotation.title || eventDates) && (
        <div className="doc-lede">
          <div>
            <div className="doc-eyebrow">Scope</div>
            {quotation.title && <h1>{quotation.title}</h1>}
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
          <div className="doc-eyebrow">Prepared for</div>
          <div className="doc-name">{quotation.account?.name ?? "—"}</div>
          {quotation.account?.billingAddress && (
            <div className="doc-text">{quotation.account.billingAddress}</div>
          )}
        </div>
        <div className="doc-panel doc-panel-narrow">
          <div className="doc-eyebrow">Date</div>
          <div className="doc-value">{formatDay(quotation.createdAt)}</div>
        </div>
        {quotation.validUntil && (
          <div className="doc-panel doc-panel-narrow">
            <div className="doc-eyebrow">Valid until</div>
            <div className="doc-value">{formatDay(quotation.validUntil)}</div>
          </div>
        )}
      </div>

      <DocumentLines lines={quotation.lines} detailLevel={quotation.detailLevel} />

      <div className="doc-close">
        <div className="doc-close-left">
          {quotation.validUntil && (
            <div className="doc-note doc-callout" style={{ marginTop: 0 }}>
              This quotation is valid until {formatLongDay(quotation.validUntil)}.
            </div>
          )}
          {quotation.paymentTerms && (
            <div className="doc-note" style={{ marginTop: quotation.validUntil ? "4mm" : 0 }}>
              {quotation.paymentTerms}
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
            <div className="doc-eyebrow doc-eyebrow-invert">Quoted total</div>
            <div className="doc-hero">{naira(total)}</div>
          </div>
        </div>
      </div>

      {quotation.notes && <div className="doc-note">{quotation.notes}</div>}

      <div className="doc-signs">
        {ACCEPTANCE.map((label) => (
          <SignatureRule key={label} label={label} />
        ))}
      </div>
    </DocumentShell>
  );
}
