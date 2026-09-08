import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isContentEditable,
  canTransitionStatus,
  CONTENT_LOCKED_MESSAGE,
  BACKWARD_TO_DRAFT_MESSAGE,
  isInvoiceContentEditable,
  isReissue,
  INVOICE_STATUSES,
} from "./document-editability.ts";

// ---- isContentEditable ---------------------------------------------------

test("a DRAFT quotation's content is editable", () => {
  assert.equal(isContentEditable("DRAFT"), true);
});

test("a SENT quotation's content is locked", () => {
  assert.equal(isContentEditable("SENT"), false);
});

test("ACCEPTED, DECLINED and EXPIRED are all locked", () => {
  assert.equal(isContentEditable("ACCEPTED"), false);
  assert.equal(isContentEditable("DECLINED"), false);
  assert.equal(isContentEditable("EXPIRED"), false);
});

test("an unrecognised status is locked, not editable by default", () => {
  assert.equal(isContentEditable("SOMETHING_ELSE"), false);
});

test("the locked message points at a new quotation, not a revision (revisions don't exist yet)", () => {
  assert.match(CONTENT_LOCKED_MESSAGE, /new quotation/i);
  assert.doesNotMatch(CONTENT_LOCKED_MESSAGE, /revision/i);
});

// ---- canTransitionStatus --------------------------------------------------

test("DRAFT can move forward to SENT", () => {
  assert.equal(canTransitionStatus("DRAFT", "SENT"), true);
});

test("DRAFT can stay DRAFT (a no-op move)", () => {
  assert.equal(canTransitionStatus("DRAFT", "DRAFT"), true);
});

test("a SENT quotation cannot be walked back to DRAFT", () => {
  assert.equal(canTransitionStatus("SENT", "DRAFT"), false);
});

test("ACCEPTED, DECLINED and EXPIRED can none of them be walked back to DRAFT", () => {
  assert.equal(canTransitionStatus("ACCEPTED", "DRAFT"), false);
  assert.equal(canTransitionStatus("DECLINED", "DRAFT"), false);
  assert.equal(canTransitionStatus("EXPIRED", "DRAFT"), false);
});

test("a SENT quotation can still move forward to ACCEPTED, DECLINED or EXPIRED", () => {
  assert.equal(canTransitionStatus("SENT", "ACCEPTED"), true);
  assert.equal(canTransitionStatus("SENT", "DECLINED"), true);
  assert.equal(canTransitionStatus("SENT", "EXPIRED"), true);
});

test("the backward-to-DRAFT message names the actual rule", () => {
  assert.match(BACKWARD_TO_DRAFT_MESSAGE, /back to draft/i);
});

// ---- isInvoiceContentEditable --------------------------------------------

test("a DRAFT invoice with nothing paid is freely editable", () => {
  assert.equal(isInvoiceContentEditable("DRAFT", 0), true);
});

test("A SENT INVOICE IS STILL EDITABLE — scope moves in the last week", () => {
  // Unlike a quotation. The founder emails every document himself; an
  // invoice sent Monday with a screen added Tuesday is re-sent, not
  // replaced by a second invoice number for one job.
  assert.equal(isInvoiceContentEditable("SENT", 0), true);
  assert.equal(isInvoiceContentEditable("OVERDUE", 0), true);
});

test("THE LOCK IS MONEY: any recorded payment freezes the content", () => {
  // A Receipt row already names these figures. Rewriting the lines would
  // leave the receipt describing an invoice that no longer says what it
  // said — the client holds one document, the system another.
  assert.equal(isInvoiceContentEditable("SENT", 1), false);
  assert.equal(isInvoiceContentEditable("DRAFT", 500_000), false);
  assert.equal(isInvoiceContentEditable("OVERDUE", 0.5), false);
});

test("PARTIAL and PAID are refused even at a zero recorded amount", () => {
  // Marking an invoice paid claims the account is settled. Changing what
  // was owed after that is the one edit nobody could defend.
  assert.equal(isInvoiceContentEditable("PAID", 0), false);
  assert.equal(isInvoiceContentEditable("PARTIAL", 0), false);
});

test("a negative amountPaid does not unlock an invoice", () => {
  // Only > 0 locks; a nonsense negative must not read as 'nothing paid' on
  // a PAID invoice and reopen it.
  assert.equal(isInvoiceContentEditable("PAID", -100), false);
  assert.equal(isInvoiceContentEditable("SENT", -100), true);
});

test("an unrecognised status is not editable", () => {
  assert.equal(isInvoiceContentEditable("SOMETHING_ELSE", 0), false);
  assert.equal(isInvoiceContentEditable("", 0), false);
});

test("every invoice status is covered by the rule, none silently absent", () => {
  for (const s of INVOICE_STATUSES) {
    assert.equal(typeof isInvoiceContentEditable(s, 0), "boolean");
  }
});

test("editing anything past DRAFT is a re-issue, and says so", () => {
  assert.equal(isReissue("DRAFT"), false);
  assert.equal(isReissue("SENT"), true);
  assert.equal(isReissue("OVERDUE"), true);
});
