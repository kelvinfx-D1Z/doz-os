import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isContentEditable,
  canTransitionStatus,
  CONTENT_LOCKED_MESSAGE,
  BACKWARD_TO_DRAFT_MESSAGE,
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
