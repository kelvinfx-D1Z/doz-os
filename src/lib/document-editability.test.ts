import { test } from "node:test";
import assert from "node:assert/strict";
import { isContentEditable, CONTENT_LOCKED_MESSAGE } from "./document-editability.ts";

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

test("the locked message points at revisions, not silent rewriting", () => {
  assert.match(CONTENT_LOCKED_MESSAGE, /revision/i);
});
