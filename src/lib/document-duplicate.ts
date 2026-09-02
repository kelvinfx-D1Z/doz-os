// ============================================================
// DUPLICATING A QUOTATION OR AN INVOICE
//
// The founder wanted to start from an existing document rather than a blank
// one — most D1Z jobs resemble the last one, and retyping eighteen lines to
// change three of them is how mistakes get in.
//
// WHY THIS IS AN ALLOWLIST AND NEVER A SPREAD
// A copy carries what describes the WORK and resets everything that describes
// this document's LIFE — its number, its status, what has been paid against
// it, what it was converted from. Spreading the source row would copy all of
// that too, and worse, would silently carry any column added later. The next
// person to add `amountPaid2` should not be able to create a fabricated
// payment record by accident. So every carried field is named here, and
// anything not named is deliberately dropped.
//
// THE THREE THAT WOULD DO REAL DAMAGE
//   code          Unique, and a skipped or reused document number is an audit
//                 problem. The caller mints a fresh one inside the same
//                 transaction; it is not in the carried set at all.
//   amountPaid /  Copying these onto a new invoice invents money that was
//   paidDate      never received, against a client who never paid it.
//   quotationId   Unique on Invoice. Copying it does not merely mislead — the
//                 insert fails, because a second invoice cannot claim the same
//                 quotation.
//
// A DATE THAT HAS ALREADY PASSED IS NOT CARRIED
// validUntil on a quotation and dueDate on an invoice are promises about time.
// Inheriting one from last month produces a document that is expired or
// overdue the moment it is created, which the founder would have to notice to
// fix. A still-future date is kept; a stale one is dropped so it must be set
// deliberately. Event dates are NOT treated this way — they describe the job
// being copied, and the founder is expected to change them.
// ============================================================

export interface DuplicableLine {
  section: string | null;
  description: string;
  subDescription: string | null;
  days: number;
  quantity: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
}

/** Keeps a deadline only while it is still ahead of us. */
export function futureOnly(
  date: Date | string | null | undefined,
  now: number = Date.now(),
): Date | null {
  if (!date) return null;
  const d = new Date(date);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  return t > now ? d : null;
}

export function duplicateLines<T extends DuplicableLine>(lines: T[]): DuplicableLine[] {
  return lines
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l, i) => ({
      section: l.section,
      description: l.description,
      subDescription: l.subDescription,
      days: l.days,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount: l.amount,
      // Renumbered from zero so a source with gaps produces a clean copy.
      sortOrder: i,
    }));
}

export interface QuotationSource {
  projectId: string | null;
  accountId: string | null;
  title: string | null;
  eventStart: Date | null;
  eventEnd: Date | null;
  detailLevel: string;
  subtotal: number;
  discount: number;
  vatRate: number;
  tax: number;
  total: number;
  whtRate: number;
  vatWithheldAtSource: boolean;
  grossUpRate: number;
  targetNet: number | null;
  paymentTerms: string | null;
  notes: string | null;
  validUntil: Date | null;
}

/**
 * Everything a duplicated quotation carries. `code` and `createdById` are the
 * caller's to supply; `status` is always DRAFT and `convertedInvoiceId` is
 * never carried, so a copy cannot claim to have become an invoice.
 */
export function duplicateQuotationData(src: QuotationSource, now: number = Date.now()) {
  return {
    projectId: src.projectId,
    accountId: src.accountId,
    title: src.title,
    eventStart: src.eventStart,
    eventEnd: src.eventEnd,
    detailLevel: src.detailLevel,
    subtotal: src.subtotal,
    discount: src.discount,
    vatRate: src.vatRate,
    tax: src.tax,
    total: src.total,
    whtRate: src.whtRate,
    vatWithheldAtSource: src.vatWithheldAtSource,
    grossUpRate: src.grossUpRate,
    targetNet: src.targetNet,
    paymentTerms: src.paymentTerms,
    notes: src.notes,
    validUntil: futureOnly(src.validUntil, now),
    status: "DRAFT" as const,
  };
}

export interface InvoiceSource {
  projectId: string | null;
  accountId: string | null;
  title: string | null;
  eventStart: Date | null;
  eventEnd: Date | null;
  detailLevel: string;
  subtotal: number;
  discount: number;
  vatRate: number;
  tax: number;
  amount: number;
  whtRate: number;
  whtAmount: number;
  expectedCash: number;
  vatWithheldAtSource: boolean;
  grossUpRate: number;
  targetNet: number | null;
  paymentTerms: string | null;
  dueDate: Date | null;
}

/**
 * Everything a duplicated invoice carries. Payment state is reset to zero, the
 * quotation link is dropped (it is unique, and this copy came from no
 * quotation), reminders start again, and isSynthetic is false because a copy
 * the founder made by hand is a real document however it was reconstructed.
 */
export function duplicateInvoiceData(src: InvoiceSource, now: number = Date.now()) {
  return {
    projectId: src.projectId,
    accountId: src.accountId,
    title: src.title,
    eventStart: src.eventStart,
    eventEnd: src.eventEnd,
    detailLevel: src.detailLevel,
    subtotal: src.subtotal,
    discount: src.discount,
    vatRate: src.vatRate,
    tax: src.tax,
    amount: src.amount,
    whtRate: src.whtRate,
    whtAmount: src.whtAmount,
    expectedCash: src.expectedCash,
    vatWithheldAtSource: src.vatWithheldAtSource,
    grossUpRate: src.grossUpRate,
    targetNet: src.targetNet,
    paymentTerms: src.paymentTerms,
    dueDate: futureOnly(src.dueDate, now),
    issuedDate: new Date(now),
    status: "DRAFT" as const,
    amountPaid: 0,
    paidDate: null,
    reminderCount: 0,
    lastReminderAt: null,
    isSynthetic: false,
  };
}

/**
 * Fields that must never appear on a duplicate. Exported so a test can assert
 * the shape rather than trusting the reader to spot an omission.
 */
export const NEVER_DUPLICATED = [
  "id",
  "code",
  "createdAt",
  "updatedAt",
  "amountPaid",
  "paidDate",
  "quotationId",
  "convertedInvoiceId",
  "reminderCount",
  "lastReminderAt",
  "isSynthetic",
  "receipts",
  "paymentConfirmations",
  "lines",
] as const;
