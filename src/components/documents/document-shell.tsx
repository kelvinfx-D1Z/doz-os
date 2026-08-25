import "./document.css";

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

const LABEL: Record<DocumentKind, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  receipt: "Receipt",
};

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
