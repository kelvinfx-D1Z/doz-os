import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";
import { type DocumentLineInput } from "@/lib/document-math";
import { type DocumentKind } from "@/components/documents/document-shell";
import { QuotationDoc } from "@/components/documents/quotation-doc";
import { InvoiceDoc } from "@/components/documents/invoice-doc";
import { ReceiptDoc } from "@/components/documents/receipt-doc";
import { PrintButton } from "@/components/documents/print-button";

const SINGLETON = "singleton";

/** The one company record every document reads from. Created on first access. */
async function loadCompany() {
  return db.companySettings.upsert({
    where: { id: SINGLETON },
    update: {},
    create: { id: SINGLETON },
  });
}

function isDocumentKind(value: string): value is DocumentKind {
  return value === "quotation" || value === "invoice" || value === "receipt";
}

/** The screen-only toolbar above the paper. `.no-print` drops it when printing. */
function PrintFrame({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "center", padding: 16, background: "#f4f4f4" }}>
        <PrintButton />
      </div>
      {children}
    </div>
  );
}

/**
 * A4, print-ready client document — quotation, invoice or receipt.
 *
 * This is a real route outside the Zustand shell so printing produces a
 * clean A4 page: no sidebar, no nav, just the document. It is also a URL
 * that could be visited directly, and it carries client pricing and company
 * bank details, so the auth check below is the whole point of this file —
 * an unauthorised viewer must see NOTHING, not a hidden-with-CSS document.
 */
export default async function DocumentPrintPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;

  const user = await getSessionUser();
  if (!user || !canIssueDocuments(user)) {
    return (
      <div style={{ padding: "48px", fontFamily: "system-ui, sans-serif", color: "#2b2b2b" }}>
        <h1 style={{ fontSize: 20 }}>Not authorised</h1>
        <p>You do not have permission to view this document.</p>
      </div>
    );
  }

  if (!isDocumentKind(type)) {
    notFound();
  }

  if (type === "quotation") {
    const quotation = await db.quotation.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        account: { select: { name: true, billingAddress: true } },
      },
    });
    if (!quotation) notFound();

    const company = await loadCompany();
    return (
      <PrintFrame>
        <QuotationDoc quotation={quotation} company={company} />
      </PrintFrame>
    );
  }

  if (type === "invoice") {
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        account: { select: { name: true, billingAddress: true } },
      },
    });
    if (!invoice) notFound();

    // Invoices created as a side effect of the projects route predate the
    // documents module: they have no InvoiceLine rows, no title, no
    // detailLevel. Zero lines there is normal data, not an error — fall back
    // to a single line derived from the stored total rather than rendering
    // an empty document.
    const lines: DocumentLineInput[] =
      invoice.lines.length > 0
        ? invoice.lines
        : [
            {
              section: null,
              description: invoice.title || "Services rendered",
              subDescription: null,
              days: 1,
              quantity: 1,
              unitPrice: invoice.subtotal > 0 ? invoice.subtotal : invoice.amount,
            },
          ];

    const company = await loadCompany();
    return (
      <PrintFrame>
        <InvoiceDoc
          invoice={{ ...invoice, code: invoice.code ?? invoice.id, lines }}
          company={company}
        />
      </PrintFrame>
    );
  }

  const receipt = await db.receipt.findUnique({
    where: { id },
    include: {
      invoice: {
        select: { code: true, title: true, account: { select: { name: true } } },
      },
    },
  });
  if (!receipt) notFound();

  const company = await loadCompany();
  return (
    <PrintFrame>
      <ReceiptDoc receipt={receipt} invoice={receipt.invoice} company={company} />
    </PrintFrame>
  );
}
