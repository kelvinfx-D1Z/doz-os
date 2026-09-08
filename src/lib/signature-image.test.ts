import test from "node:test";
import assert from "node:assert/strict";
import { validateSignature, approxBytes, MAX_SIGNATURE_CHARS } from "./signature-image.ts";

/** A data URL of `bytes` decoded length, with correct base64 padding. */
function png(bytes: number, mime = "image/png"): string {
  const chars = Math.ceil(bytes / 3) * 4;
  return `data:${mime};base64,${"A".repeat(chars - 1)}=`;
}

const ok = (r: ReturnType<typeof validateSignature>) => {
  assert.ok("value" in r, "error" in r ? r.error : "expected acceptance");
  return r.value;
};

test("a small PNG data URL is accepted verbatim", () => {
  const url = png(20_000);
  assert.equal(ok(validateSignature(url)), url);
});

test("JPEG and WebP are accepted too", () => {
  assert.ok(ok(validateSignature(png(5_000, "image/jpeg"))));
  assert.ok(ok(validateSignature(png(5_000, "image/webp"))));
});

test("SVG IS REFUSED — it is a document, not a bitmap", () => {
  // It would be stored verbatim and served back into every rendered
  // quotation and invoice. A signature has no need of it.
  const r = validateSignature(png(500, "image/svg+xml"));
  assert.ok("error" in r);
  assert.match(r.error, /not accepted/);
});

test("an executable or PDF disguised as a data URL is refused", () => {
  assert.ok("error" in validateSignature(png(500, "application/pdf")));
  assert.ok("error" in validateSignature(png(500, "text/html")));
});

test("CLEARING: empty string and null remove the signature", () => {
  // Distinct from the field being absent from a request body, which means
  // the form did not touch the signature at all. That call is the route's.
  assert.equal(ok(validateSignature("")), null);
  assert.equal(ok(validateSignature("   ")), null);
  assert.equal(ok(validateSignature(null)), null);
});

test("a remote URL is refused rather than silently stored", () => {
  // Storing a link would put a third-party host in the render path of every
  // document, and print an empty box the day that host goes away.
  const r = validateSignature("https://example.com/signature.png");
  assert.ok("error" in r);
  assert.match(r.error, /not a link/);
});

test("a non-string is refused", () => {
  assert.ok("error" in validateSignature(42));
  assert.ok("error" in validateSignature({ url: "x" }));
  assert.ok("error" in validateSignature(undefined));
});

test("malformed base64 is refused rather than stored as a broken image", () => {
  assert.ok("error" in validateSignature("data:image/png;base64,"));
  assert.ok("error" in validateSignature("data:image/png;base64,!!!!"));
  assert.ok("error" in validateSignature("data:image/png,notbase64"));
});

test("truncated base64 is caught before it becomes a broken box on a document", () => {
  const r = validateSignature("data:image/png;base64,AAAAA");
  assert.ok("error" in r);
  assert.match(r.error, /incomplete/);
});

test("an oversized image is refused with the size named", () => {
  const huge = "data:image/png;base64," + "A".repeat(MAX_SIGNATURE_CHARS);
  const r = validateSignature(huge);
  assert.ok("error" in r);
  assert.match(r.error, /KB/);
});

test("a signature right at the cap is still accepted", () => {
  const prefix = "data:image/png;base64,";
  const body = MAX_SIGNATURE_CHARS - prefix.length;
  const url = prefix + "A".repeat(body - (body % 4));
  assert.ok(url.length <= MAX_SIGNATURE_CHARS);
  assert.ok(ok(validateSignature(url)));
});

test("approxBytes recovers the decoded size, padding included", () => {
  assert.equal(approxBytes("data:image/png;base64,AAAA"), 3);
  assert.equal(approxBytes("data:image/png;base64,AAA="), 2);
  assert.equal(approxBytes("data:image/png;base64,AA=="), 1);
  assert.equal(approxBytes("no comma here"), 0);
});

test("the mime match is case-insensitive, as browsers are not consistent", () => {
  assert.ok(ok(validateSignature(png(1_000, "IMAGE/PNG"))));
});
