import type { Prisma } from "@prisma/client";

export type DocumentType = "QUO" | "INV" | "REC";

/** PREFIX-YYYY-NNN, e.g. INV-2026-014. */
export function formatDocumentCode(
  type: DocumentType,
  year: number,
  seq: number,
): string {
  return `${type}-${year}-${String(seq).padStart(3, "0")}`;
}

type Tx = Prisma.TransactionClient;

/**
 * Reserves the next number in the series for `type` and the current year.
 *
 * MUST be called inside the same transaction that creates the document, so a
 * rolled-back document does not burn a number and two documents created in
 * the same second cannot collide. `count() + 1` is not safe here: a duplicated
 * or skipped invoice number is an audit problem.
 */
export async function nextDocumentCode(
  tx: Tx,
  type: DocumentType,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getFullYear();
  const row = await tx.documentSequence.upsert({
    where: { type_year: { type, year } },
    update: { next: { increment: 1 } },
    create: { type, year, next: 2 },
    select: { next: true },
  });
  // upsert returns the value AFTER incrementing, so the number just reserved
  // is one behind. On create we set next=2 and reserve 1.
  return formatDocumentCode(type, year, row.next - 1);
}
