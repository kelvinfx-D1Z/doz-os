import React from "react";
import "./document.css";
import { groupBySection, lineAmount, type DocumentLineInput } from "@/lib/document-math";

export type DocumentKind = "quotation" | "invoice" | "receipt";

export type CompanyInfo = {
  legalName: string;
  tradingName: string | null;
  address: string;
  phone: string;
  email: string;
  website: string | null;
  rcNumber: string | null;
  tin: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankAccountName: string | null;
};

/** Naira, whole units. Client documents never show kobo. */
export const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Event dates are stored at UTC midnight. Formatting them in the server's
// local zone would shift a Lagos event onto the wrong day on a document that
// a client checks against their own diary, so every date here reads as UTC.
const UTC = "UTC" as const;

// en-GB abbreviates September as "Sept" — four letters where every other
// month gets three ("Jan", "Feb", … "Oct", "Nov", "Dec"). Left alone, that
// ragged one-off sits visibly uneven beside other dates in the tabular date
// panels. Correct as English; not uniform, so trimmed to three letters here.
function threeLetterMonths(formatted: string): string {
  return formatted.replace("Sept", "Sep");
}

/** `24 Aug 2026` */
export function formatDay(value: Date | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return threeLetterMonths(
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: UTC }),
  );
}

/** `23 September 2026` — for prose, where an abbreviation reads as clipped. */
export function formatLongDay(value: Date | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: UTC });
}

/**
 * An event's run of days, collapsed as far as it honestly can be:
 * `24–27 Aug 2026`, `28 Aug – 2 Sep 2026`, `30 Dec 2026 – 2 Jan 2027`.
 * Returns null when there are no dates, so the caller can omit the block
 * entirely rather than print an em dash where a date should be.
 */
export function formatRange(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): string | null {
  const s = toDate(start);
  const e = toDate(end);
  if (!s && !e) return null;
  if (!s) return formatDay(e);
  if (!e) return formatDay(s);

  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth();
  if (sameMonth && s.getUTCDate() === e.getUTCDate()) return formatDay(s);
  if (sameMonth) return `${s.getUTCDate()}–${formatDay(e)}`;
  if (sameYear) {
    const from = threeLetterMonths(
      s.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: UTC }),
    );
    return `${from} – ${formatDay(e)}`;
  }
  return `${formatDay(s)} – ${formatDay(e)}`;
}

/**
 * The line table, shared by quotations and invoices.
 *
 * Summary renders one row per section; Itemised renders every line with its
 * full arithmetic and a per-section subtotal. Both derive from the same array
 * through groupBySection, so the two views of one document cannot disagree
 * about what it costs — there is never a second set of numbers to drift.
 */
export function DocumentLines({
  lines,
  detailLevel,
}: {
  lines: DocumentLineInput[];
  detailLevel: string;
}) {
  const groups = groupBySection(lines);
  const itemised = detailLevel === "ITEMISED";
  const showSectionTotals = itemised && groups.length > 1;

  // A document whose lines carry no sections at all has nothing to summarise
  // by: groupBySection files every line under "Other", and a client-facing
  // row reading "Other — ₦1,500,000" tells the reader nothing. Legacy
  // invoices are all like this. Summarise by line description instead.
  const sectioned = lines.some((l) => (l.section ?? "").trim() !== "");
  const summaryRows = sectioned
    ? groups.map((g) => ({ label: g.section, total: g.total }))
    : lines.map((l) => ({ label: l.description, total: lineAmount(l) }));

  return (
    <table className="doc-table">
      <thead>
        <tr>
          <th>{itemised ? "Item" : "Description"}</th>
          {itemised && (
            <>
              <th className="mid" style={{ width: "16mm" }}>Qty</th>
              <th className="mid" style={{ width: "16mm" }}>Days</th>
              <th className="num" style={{ width: "28mm" }}>Rate</th>
            </>
          )}
          <th className="num" style={{ width: "32mm" }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {!itemised &&
          summaryRows.map((row, i) => (
            <tr key={i} className="doc-row doc-summary-row">
              <td>{row.label}</td>
              <td className="num">{naira(row.total)}</td>
            </tr>
          ))}
        {itemised &&
          groups.map((g) => (
            <React.Fragment key={g.section}>
              <tr className="doc-section-head">
                <td colSpan={5}>
                  <span className="doc-tick" />
                  {g.section}
                </td>
              </tr>
              {g.lines.map((l, i) => (
                <tr key={i} className="doc-row">
                  <td>
                    <div>{l.description}</div>
                    {l.subDescription && <div className="doc-line-sub">{l.subDescription}</div>}
                  </td>
                  <td className="mid">{l.quantity}</td>
                  <td className="mid">{l.days > 1 ? l.days : "—"}</td>
                  <td className="num rate">{naira(l.unitPrice)}</td>
                  <td className="num">{naira(lineAmount(l))}</td>
                </tr>
              ))}
              {showSectionTotals && (
                <tr className="doc-section-total">
                  <td colSpan={4}>{g.section} subtotal</td>
                  <td className="num">{naira(g.total)}</td>
                </tr>
              )}
            </React.Fragment>
          ))}
      </tbody>
    </table>
  );
}

/** The three-bar motif from the masthead, reused to cap a totals block. */
export function TotalsCap() {
  return (
    <div className="doc-totals-cap">
      <div className="b1" /><div className="b2" /><div className="b3" />
    </div>
  );
}

/** A signature rule. Documents that need agreement, not just information. */
export function SignatureRule({ label }: { label: string }) {
  return (
    <div className="doc-sign">
      <div className="doc-sign-rule" />
      <div className="doc-sign-label">{label}</div>
    </div>
  );
}

/** One row of a particulars list. Renders nothing when the value is absent. */
export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="doc-dl-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const LABEL: Record<DocumentKind, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  receipt: "Receipt",
};

// Blink (this Chrome's print engine) supports `@page` margin boxes and the
// `counter(page)`/`counter(pages)` functions inside them, but not CSS
// Paged Media's `string-set`/`string()` — there is no way for a shared,
// static stylesheet to pull the document code out of the page's own DOM
// into a margin box. So this one rule is generated per document, with the
// real code baked in as a literal string at render time, and scoped to the
// non-`:first` `@page` context — page 1 keeps margin: 0 (see document.css),
// so its margin box has no area to draw into regardless.
function escapeCssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, " ");
}

function RunningHeaderStyle({ docCode }: { docCode: string }) {
  const code = escapeCssString(docCode);
  return (
    <style>{`
      @page {
        @top-center {
          content: "${code} · " counter(page) " of " counter(pages);
          font-family: "Helvetica Neue", Arial, sans-serif;
          font-size: 8pt;
          color: #8c8c8c;
        }
      }
    `}</style>
  );
}

/**
 * The shared D1Z page furniture: orange bars, charcoal masthead, footer.
 *
 * Each document type supplies its own body, because a quotation, an invoice
 * and a receipt do different jobs and should not be forced into one layout.
 */
export function DocumentShell({
  kind,
  company,
  docCode,
  children,
}: {
  kind: DocumentKind;
  company: CompanyInfo;
  docCode: string;
  children: React.ReactNode;
}) {
  return (
    <div className="doc-page">
      <RunningHeaderStyle docCode={docCode} />
      <div className="doc-bars doc-bars-top">
        <div className="b1" /><div className="b2" /><div className="b3" />
      </div>

      <div className="doc-masthead">
        <div>
          <div style={{ fontSize: "20pt", fontWeight: 700, letterSpacing: "-1px", lineHeight: 1 }}>
            D1Z<span style={{ color: "#e8681c", fontWeight: 400 }}>tech</span>
          </div>
          <div style={{ fontSize: "8pt", color: "#9a9a9a", marginTop: "2mm" }}>
            {company.legalName}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "8pt", letterSpacing: "2px", textTransform: "uppercase", color: "#e8681c" }}>
            {LABEL[kind]}
          </div>
          <div style={{ fontSize: "14pt", marginTop: "1mm" }}>{docCode}</div>
        </div>
      </div>

      <div className="doc-body">{children}</div>

      <div className="doc-footer">
        <span>{company.phone}</span>
        {company.website && <span>{company.website}</span>}
        <span>{company.address}</span>
      </div>

      <div className="doc-bars doc-bars-bottom">
        <div className="b1" /><div className="b2" /><div className="b3" />
      </div>
    </div>
  );
}
