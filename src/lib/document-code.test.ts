import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDocumentCode } from "./document-code.ts";

test("formats a code with a three-digit zero-padded sequence", () => {
  assert.equal(formatDocumentCode("INV", 2026, 14), "INV-2026-014");
});

test("pads single digits", () => {
  assert.equal(formatDocumentCode("QUO", 2026, 1), "QUO-2026-001");
});

test("does not truncate a sequence past three digits", () => {
  assert.equal(formatDocumentCode("REC", 2026, 1234), "REC-2026-1234");
});

test("each type has its own series", () => {
  assert.equal(formatDocumentCode("QUO", 2026, 7), "QUO-2026-007");
  assert.equal(formatDocumentCode("INV", 2026, 7), "INV-2026-007");
  assert.equal(formatDocumentCode("REC", 2026, 7), "REC-2026-007");
});
