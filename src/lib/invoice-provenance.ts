// ============================================================
// INVOICE PROVENANCE — real (Documents-issued) vs synthetic
// ============================================================
//
// Two code paths write to the one Invoice table:
//
//  - The Documents module (/api/doz/documents/invoices) creates REAL client
//    invoices. parseDocumentBody refuses to create one with zero lines, so
//    a real invoice always has at least one InvoiceLine.
//
//  - reconcileReceived() in /api/doz/projects mints a SYNTHETIC placeholder
//    invoice purely to give a "received" figure somewhere to land, for a
//    project that has no real invoice yet. It never creates InvoiceLine
//    rows.
//
// Finance must not double-count a project that has both: once a project's
// real invoice goes live, the synthetic row is superseded and must not add
// its money on top. reconcileReceived must also stop minting a new
// synthetic invoice the moment a real one exists — see final-fix-report.md.
//
// isSynthetic is set explicitly at creation time going forward, but four
// invoices already existed in production before that column did. Rather
// than requiring a data-migration backfill, this checks BOTH signals: a
// missing/false isSynthetic flag with zero lines is still synthetic. A real
// invoice can never have zero lines, so this cannot misclassify one.

/** The minimal shape this needs from an invoice row. */
export type InvoiceProvenance = {
  isSynthetic?: boolean | null;
  /** Count of this invoice's InvoiceLine rows (e.g. Prisma's `_count.lines`). */
  linesCount: number;
};

/**
 * True for a synthetic reconcileReceived() placeholder; false for a real,
 * Documents-issued invoice.
 */
export function isSyntheticInvoice(inv: InvoiceProvenance): boolean {
  return Boolean(inv.isSynthetic) || inv.linesCount === 0;
}

/**
 * The set of project ids that have a LIVE real invoice — real (per
 * isSyntheticInvoice) and not DRAFT. A real invoice still being drafted has
 * not superseded anything yet, so a project's synthetic row should keep
 * counting until the real one is actually issued.
 */
export function projectsWithLiveRealInvoice(
  invoices: (InvoiceProvenance & { projectId?: string | null; status: string })[],
): Set<string> {
  const ids = new Set<string>();
  for (const inv of invoices) {
    if (inv.projectId && inv.status !== "DRAFT" && !isSyntheticInvoice(inv)) {
      ids.add(inv.projectId);
    }
  }
  return ids;
}

/**
 * Drops synthetic invoices that a project's live real invoice has
 * superseded, so a caller summing money doesn't double-count. Real invoices
 * and synthetic invoices on projects with no live real invoice pass
 * through unchanged.
 */
export function dedupeSyntheticInvoices<
  T extends InvoiceProvenance & { projectId?: string | null; status: string },
>(invoices: T[]): T[] {
  const live = projectsWithLiveRealInvoice(invoices);
  return invoices.filter(
    (inv) => !(inv.projectId && live.has(inv.projectId) && isSyntheticInvoice(inv)),
  );
}
