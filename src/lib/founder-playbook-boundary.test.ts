import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// The playbook's text must only ever reach the founder, through the
// founder-only API. A client component that VALUE-imports it ships the whole
// text in the JavaScript bundle every signed-in user downloads — the page
// and the API can both be locked and an intern can still read it in
// devtools. That happened once. This test is what stops it happening again.

const SRC = join(import.meta.dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

/** Import statements naming founder-playbook that are NOT type-only. */
function valueImports(source: string): string[] {
  // Anchored to the start of a line and barred from crossing a `;`, so one
  // match is one statement — not a span from some earlier import, or from
  // the word "import" inside a comment, down to this one.
  const imports = source.match(/^\s*import\s[^;]*?from\s+["'][^"']*founder-playbook(\.ts)?["']/gm) ?? [];
  return imports.filter((stmt) => !/^\s*import\s+type\s/.test(stmt));
}

test("no client component value-imports the founder's playbook", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    if (file.endsWith(".test.ts")) continue;
    const source = readFileSync(file, "utf8");
    const isClient = /^\s*["']use client["']/.test(source);
    if (isClient && valueImports(source).length > 0) offenders.push(file.slice(SRC.length + 1));
  }
  assert.deepEqual(offenders, [], `these would ship the playbook to every user: ${offenders.join(", ")}`);
});

test("the only non-type importer is the founder-only API route", () => {
  const importers = walk(SRC)
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith("founder-playbook.ts"))
    .filter((f) => valueImports(readFileSync(f, "utf8")).length > 0)
    .map((f) => f.slice(SRC.length + 1));
  assert.deepEqual(importers, ["app/api/doz/playbook/route.ts"]);
});

test("the detector itself tells a type import from a value import", () => {
  // Guards the guard: if this regex rots, the tests above pass vacuously.
  assert.equal(valueImports(`import type { DayPlan } from "@/lib/founder-playbook";`).length, 0);
  assert.equal(valueImports(`import { WEEK } from "@/lib/founder-playbook";`).length, 1);
  assert.equal(valueImports(`import {\n  WEEK,\n  type DayPlan,\n} from "./founder-playbook.ts";`).length, 1);
  // The false positive that first tripped this test: prose mentioning
  // "import" above a legitimate type-only import.
  const commented = `// a value import here would bundle it.\nimport type { DayPlan } from "@/lib/founder-playbook";`;
  assert.equal(valueImports(commented).length, 0);
  // And an earlier unrelated import must not be swallowed into the match.
  const two = `import { x } from "./a";\nimport type { DayPlan } from "./founder-playbook";`;
  assert.equal(valueImports(two).length, 0);
});
