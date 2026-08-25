import {
  DocumentShell,
  TotalsCap,
  SignatureRule,
  Field,
  naira,
  formatDay,
  type CompanyInfo,
} from "./document-shell";

export type ReceiptDocData = {
  code: string;
  amount: number;
  method: string | null;
  reference: string | null;
  receivedAt: Date | string;
  balanceAfter: number;
};

export type ReceiptInvoiceRef = {
  code: string | null;
  title: string | null;
  account?: { name: string } | null;
} | null;

const METHOD_LABEL: Record<string, string> = {
  TRANSFER: "Bank transfer",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
  CHEQUE: "Cheque",
  CARD: "Card",
  POS: "POS",
};

function methodLabel(method: string | null): string | null {
  if (!method) return null;
  return METHOD_LABEL[method.toUpperCase()] ?? method;
}

/**
 * A D1Z receipt.
 *
 * Confirmatory, not transactional: no line table, because nothing here is
 * being priced — the money has already moved. One figure dominates the page,
 * and the reader's second question ("are we square?") is answered in the line
 * directly beneath it.
 */
export function ReceiptDoc({
  receipt,
  invoice,
  company,
}: {
  receipt: ReceiptDocData;
  invoice: ReceiptInvoiceRef;
  company: CompanyInfo;
}) {
  const settled = receipt.balanceAfter <= 0;
  const payer = invoice?.account?.name ?? null;

  return (
    <DocumentShell kind="receipt" company={company} docCode={receipt.code}>
      <div className="doc-grid">
        <div className="doc-panel doc-panel-accent">
          <div className="doc-eyebrow">Received from</div>
          <div className="doc-name">{payer ?? "—"}</div>
        </div>
        {invoice?.title && (
          <div className="doc-panel">
            <div className="doc-eyebrow">In respect of</div>
            <div className="doc-text" style={{ marginTop: "2mm" }}>{invoice.title}</div>
          </div>
        )}
      </div>

      <TotalsCap />
      <div className="doc-totals">
        <div className="doc-eyebrow doc-eyebrow-invert">Amount received</div>
        <div className="doc-hero doc-hero-lg">{naira(receipt.amount)}</div>
      </div>

      <dl className="doc-dl" style={{ marginTop: "7mm" }}>
        <Field label="Payment method" value={methodLabel(receipt.method)} />
        <Field label="Reference" value={receipt.reference} />
        <Field label="Date received" value={formatDay(receipt.receivedAt)} />
        {invoice?.code && <Field label="Settles" value={`Invoice ${invoice.code}`} />}
      </dl>

      <div className="doc-status" style={{ color: settled ? "#2f7d32" : "#c25510" }}>
        {settled
          ? "Paid in full. Thank you."
          : `Balance outstanding: ${naira(receipt.balanceAfter)}`}
      </div>

      <div className="doc-signs">
        <SignatureRule label="For D1Z Technologies" />
        <div className="doc-sign" />
      </div>
    </DocumentShell>
  );
}
