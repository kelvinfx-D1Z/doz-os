import test from "node:test";
import assert from "node:assert/strict";
import {
  VIEW_AS_INFO_COOKIE,
  serialiseViewAsInfo,
  parseViewAsInfo,
  readViewAsInfo,
} from "./view-as-cookie.ts";

const ESTHER = {
  id: "usr_esther",
  name: "Esther Joseph Ali",
  email: "estherjosephali@gmail.com",
  role: "INTERN",
  title: "Intern",
  permissions: null,
};

/** What the cookie layer does on the way out: percent-encode, exactly once. */
const asStoredByBrowser = (value: string) => encodeURIComponent(value);

test("a serialised value round-trips through the cookie layer", () => {
  const stored = asStoredByBrowser(serialiseViewAsInfo(ESTHER));
  assert.deepEqual(parseViewAsInfo(stored), ESTHER);
});

test("THE REGRESSION: a pre-encoded value is doubly encoded and must not parse", () => {
  // The original bug. The route did encodeURIComponent(JSON.stringify(x)) and
  // the cookie layer encoded that again, so the browser stored "%257B...".
  // One decode leaves "%7B..." and JSON.parse throws. Returning null here is
  // correct; what was wrong was that nothing ever noticed.
  const legacy = asStoredByBrowser(encodeURIComponent(JSON.stringify(ESTHER)));
  assert.ok(legacy.startsWith("%257B"), "precondition: the legacy value is doubly encoded");
  assert.equal(parseViewAsInfo(legacy), null);
});

test("serialiseViewAsInfo does not pre-encode", () => {
  // Guards the writer directly: the moment this starts with a percent escape,
  // the cookie layer will encode it twice again and the shell silently falls
  // back to the founder.
  assert.ok(serialiseViewAsInfo(ESTHER).startsWith("{"));
});

test("a name with a comma, semicolon or unicode survives the round trip", () => {
  const awkward = { ...ESTHER, name: "Ali; Esther, Joseph — Àlàbá" };
  const stored = asStoredByBrowser(serialiseViewAsInfo(awkward));
  assert.equal(readViewAsInfo(`${VIEW_AS_INFO_COOKIE}=${stored}`)?.name, awkward.name);
});

test("permissions survive as an array, and a missing one reads as null", () => {
  const withPerms = { ...ESTHER, permissions: ["projects", "documents"] };
  const stored = asStoredByBrowser(serialiseViewAsInfo(withPerms));
  assert.deepEqual(parseViewAsInfo(stored)?.permissions, ["projects", "documents"]);
  assert.equal(parseViewAsInfo(asStoredByBrowser(serialiseViewAsInfo(ESTHER)))?.permissions, null);
});

test("anything unvouchable reads as null, so the real session renders", () => {
  assert.equal(parseViewAsInfo(null), null);
  assert.equal(parseViewAsInfo(undefined), null);
  assert.equal(parseViewAsInfo(""), null);
  assert.equal(parseViewAsInfo("%E0%A4%A"), null); // malformed escapes
  assert.equal(parseViewAsInfo(asStoredByBrowser("not json")), null);
  assert.equal(parseViewAsInfo(asStoredByBrowser(JSON.stringify(null))), null);
  assert.equal(parseViewAsInfo(asStoredByBrowser(JSON.stringify("a string"))), null);
  assert.equal(parseViewAsInfo(asStoredByBrowser(JSON.stringify({ name: "no id or role" }))), null);
  assert.equal(parseViewAsInfo(asStoredByBrowser(JSON.stringify({ id: "x", role: "" }))), null);
});

test("readViewAsInfo finds the cookie among its neighbours", () => {
  const stored = asStoredByBrowser(serialiseViewAsInfo(ESTHER));
  const header = `next-auth.session-token=abc; ${VIEW_AS_INFO_COOKIE}=${stored}; theme=dark`;
  assert.equal(readViewAsInfo(header)?.role, "INTERN");
});

test("readViewAsInfo does not match a cookie whose name merely ends the same way", () => {
  const stored = asStoredByBrowser(serialiseViewAsInfo(ESTHER));
  assert.equal(readViewAsInfo(`not-${VIEW_AS_INFO_COOKIE}=${stored}`), null);
});

test("readViewAsInfo returns null when the cookie is absent", () => {
  assert.equal(readViewAsInfo(""), null);
  assert.equal(readViewAsInfo(null), null);
  assert.equal(readViewAsInfo("theme=dark; next-auth.session-token=abc"), null);
});
