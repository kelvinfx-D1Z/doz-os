import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";
import { groupBySection, computeTax, lineAmount, type DocumentLineInput } from "@/lib/document-math";
import { DocumentShell, type DocumentKind } from "@/components/documents/document-shell";
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

/**
 * A5, print-ready client document — quotation, invoice or receipt.
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

  let docCode: string;
  let title: string | null = null;
  let lines: DocumentLineInput[];

  if (type === "quotation") {
    const quotation = await db.quotation.findUnique({
      where: { id },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!quotation) notFound();
    docCode = quotation.code;
    title = quotation.title;
    lines = quotation.lines;
  } else if (type === "invoice") {
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!invoice) notFound();
    docCode = invoice.code ?? invoice.id;
    title = invoice.title;
    // Invoices created as a side effect of the projects route predate the
    // documents module: they have no InvoiceLine rows, no title, no
    // detailLevel. Zero lines there is normal data, not an error — fall back
    // to a single line derived from the stored total rather than rendering
    // an empty document.
    lines =
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
  } else {
    const receipt = await db.receipt.findUnique({
      where: { id },
      include: { invoice: { select: { code: true, title: true } } },
    });
    if (!receipt) notFound();
    docCode = receipt.code;
    title = receipt.invoice?.title ?? null;
    lines = [
      {
        section: null,
        description: `Payment received against ${receipt.invoice?.code ?? "invoice"}`,
        subDescription: receipt.reference ? `Ref: ${receipt.reference}` : null,
        days: 1,
        quantity: 1,
        unitPrice: receipt.amount,
      },
    ];
  }

  const company = await loadCompany();
  const sections = groupBySection(lines);
  const subtotal = sections.reduce((sum, sec) => sum + sec.total, 0);
  const tax = computeTax({ subtotal });

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "center", padding: 16, background: "#f4f4f4" }}>
        <PrintButton />
      </div>

      {/* Placeholder body — the real quotation/invoice/receipt layouts land in Task 10. */}
      <DocumentShell kind={type} company={company} docCode={docCode}>
        {title && <h2 style={{ marginTop: 0 }}>{title}</h2>}

        {sections.map((sec) => (
          <div key={sec.section} style={{ marginBottom: "8mm" }}>
            <h3 style={{ fontSize: "10pt", textTransform: "uppercase", letterSpacing: "1px", color: "#6e6e6e" }}>
              {sec.section}
            </h3>
            <ul style={{ margin: 0, paddingLeft: "5mm" }}>
              {sec.lines.map((line, i) => (
                <li key={i} style={{ fontSize: "10.5pt", marginBottom: "1mm" }}>
                  {line.description}
                  {line.subDescription ? ` — ${line.subDescription}` : ""}
                  {" — ₦"}
                  {lineAmount(line).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="doc-totals">
          <div>Subtotal: {"₦"}{subtotal.toLocaleString()}</div>
          <div>VAT ({company.vatRegistered ? "7.5%" : "0%"}): {"₦"}{tax.vat.toLocaleString()}</div>
          <div style={{ fontWeight: 700 }}>Total: {"₦"}{tax.total.toLocaleString()}</div>
        </div>
      </DocumentShell>
    </div>
  );
}
