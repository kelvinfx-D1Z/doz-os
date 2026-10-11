import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseCell,
  parseCostingSheet,
  categoriseLines,
  describeSheet,
} from "./costing-sheet.ts";

// The founder's real sheet, pasted from Excel exactly as he sent it.
const SHEET = readFileSync(join(import.meta.dirname, "__fixtures__/costing-sheet-sep30.txt"), "utf8");

const CATEGORIES = [
  "Displays", "Cameras & Capture", "Sound", "Lighting", "Streaming & Broadcast",
  "Stage & Scenic Fabrication", "Branding & Print", "Furniture", "Personnel",
  "Logistics & Welfare", "Post-Production", "Exhibition Stands", "Drone", "Decoration",
];

// A slice of the live catalogue, with the real names and categories.
const CATALOGUE = [
  { name: "TV + stand", category: "Displays" },
  { name: "TV display", category: "Displays" },
  { name: "Wireless receiver", category: "Cameras & Capture" },
  { name: "B-roll camera package", category: "Cameras & Capture" },
  { name: "Videographer", category: "Personnel" },
  { name: "Side table", category: "Furniture" },
  { name: "Panel chair", category: "Furniture" },
  { name: "Stage", category: "Stage & Scenic Fabrication" },
  { name: "Workmanship / fabrication", category: "Branding & Print" },
  { name: "Branding materials", category: "Branding & Print" },
  { name: "Printing", category: "Branding & Print" },
  { name: "Local production transport", category: "Logistics & Welfare" },
];

// ---- cells ---------------------------------------------------------------

test("Excel's own formatting is read, spaces, commas and all", () => {
  assert.equal(parseCell("  30,000.00 "), 30_000);
  assert.equal(parseCell("250,000.00"), 250_000);
  assert.equal(parseCell("  35,000 "), 35_000);
  assert.equal(parseCell("0"), 0);
  assert.equal(parseCell("4,643,400.00"), 4_643_400);
});

test("A LONE DASH IS NIL, not minus", () => {
  // Accounting format writes an empty cell as "-". Reading it as a negative
  // would subtract from the sheet.
  assert.equal(parseCell("  -   "), null);
  assert.equal(parseCell("-"), null);
  assert.equal(parseCell("–"), null);
  assert.equal(parseCell(""), null);
  assert.equal(parseCell("   "), null);
  assert.equal(parseCell(undefined), null);
});

test("a bracketed figure is the negative accounting means", () => {
  assert.equal(parseCell("(5,000.00)"), -5_000);
});

test("words are not numbers", () => {
  assert.equal(parseCell("RECEIVED"), null);
  assert.equal(parseCell("1 DAY"), null);
  assert.equal(parseCell("N/A"), null);
});

// ---- the real sheet ------------------------------------------------------

test("THE REAL SHEET: every costed line is found", () => {
  const sheet = parseCostingSheet(SHEET);
  assert.equal(sheet.lines.length, 20);
  const names = sheet.lines.map((l) => l.name);
  assert.ok(names.includes("Camera"));
  assert.ok(names.includes("LED screen (6sqm)"));
  assert.ok(names.includes("FLAG BANNER"));
  assert.ok(names.includes("PRODUCER"));
});

test("IT RECONCILES TO HIS OWN TOTAL — ₦4,643,400", () => {
  // The whole point. If the parse and his sheet disagree, the import is
  // wrong and must say so instead of preferring its own arithmetic.
  const sheet = parseCostingSheet(SHEET);
  assert.equal(sheet.computedTotal, 4_643_400);
  assert.equal(sheet.statedTotal, 4_643_400);
  assert.equal(sheet.reconciles, true);
});

test("quantities multiply, and the line is recomputed rather than trusted", () => {
  const sheet = parseCostingSheet(SHEET);
  const led = sheet.lines.find((l) => l.name.startsWith("LED screen"))!;
  assert.equal(led.unitCost, 150_000);
  assert.equal(led.quantity, 9);
  assert.equal(led.amount, 1_350_000);

  const flags = sheet.lines.find((l) => l.name === "FLAG BANNER")!;
  assert.equal(flags.quantity, 10);
  assert.equal(flags.amount, 180_000);

  const tables = sheet.lines.find((l) => l.name === "SIDE TABLES")!;
  assert.equal(tables.quantity, 6);
  assert.equal(tables.amount, 30_000);
});

test("a missing quantity counts as one", () => {
  const sheet = parseCostingSheet(SHEET);
  const workmanship = sheet.lines.find((l) => l.name === "WORKMANSHIP")!;
  assert.equal(workmanship.quantity, 1);
  assert.equal(workmanship.amount, 250_000);
});

test("THE SUBTOTAL IS NOT COUNTED TWICE", () => {
  // The equipment block ends with a bare "225,000.00" row. Counting it would
  // add the section to itself.
  const sheet = parseCostingSheet(SHEET);
  assert.equal(sheet.lines.some((l) => l.amount === 225_000 && !l.name), false);
  const equipment = sheet.lines
    .filter((l) => ["Camera", "Wireless Receiver", "TV", "TV + Stand", "Cables and Connectors"].includes(l.name))
    .reduce((s, l) => s + l.amount, 0);
  assert.equal(equipment, 225_000, "the five equipment lines come to the subtotal he wrote");
});

test("A PRICE MAKES AN ITEM; NO PRICE MAKES A HEADING", () => {
  // "LIGHT" and "SOUND" are section names in his sheet AND priced lines.
  // "STAGE" and "PHOTOGRAPHY" are headings only.
  const sheet = parseCostingSheet(SHEET);
  const light = sheet.lines.find((l) => l.name === "LIGHT")!;
  assert.equal(light.amount, 400_000);
  const sound = sheet.lines.find((l) => l.name === "SOUND")!;
  assert.equal(sound.amount, 350_000);
  assert.equal(sheet.lines.some((l) => l.name === "STAGE"), false);
  assert.equal(sheet.lines.some((l) => l.name === "PHOTOGRAPHY"), false);
});

test("rows he listed but never costed are reported, not silently dropped", () => {
  const sheet = parseCostingSheet(SHEET);
  assert.ok(sheet.uncosted.includes("Blackmagic Recorder"));
  assert.ok(sheet.uncosted.includes("PANEL CHAIRS"));
  assert.ok(sheet.uncosted.includes("BLACK FABRIC FOR SIDES (Roll)"));
  // "TV" appears twice on his sheet: once priced, once not. The unpriced one
  // is reported without disturbing the priced one.
  assert.ok(sheet.uncosted.includes("TV"));
  assert.equal(sheet.lines.filter((l) => l.name === "TV").length, 1);
  // Nothing uncosted added anything to the money.
  assert.equal(sheet.computedTotal, 4_643_400);
});

test("the same name twice stays twice — two transport runs are two costs", () => {
  const sheet = parseCostingSheet(SHEET);
  const transport = sheet.lines.filter((l) => l.name === "TRANSPORTATION");
  assert.equal(transport.length, 2);
  assert.equal(transport[0].amount + transport[1].amount, 120_000);
});

test("the column header row is not an item", () => {
  const sheet = parseCostingSheet(SHEET);
  assert.equal(sheet.lines.some((l) => /^type$/i.test(l.name)), false);
});

test("the sheet's own title is picked up", () => {
  assert.equal(parseCostingSheet(SHEET).title, "PRODUCTION COSTING SHEET -SEP 30");
});

test("nothing received is read as nothing, not as missing", () => {
  const sheet = parseCostingSheet(SHEET);
  assert.equal(sheet.received, 0);
});

test("no line total on his sheet disagrees with the arithmetic", () => {
  assert.deepEqual(parseCostingSheet(SHEET).disagreements, []);
});

// ---- when a sheet is wrong ----------------------------------------------

test("A TOTAL THAT DOES NOT ADD UP IS REPORTED, NOT CORRECTED", () => {
  const broken = ["Camera\t30,000.00\t2\t60,000.00", "TOTAL\t\t\t900,000.00"].join("\n");
  const sheet = parseCostingSheet(broken);
  assert.equal(sheet.computedTotal, 60_000);
  assert.equal(sheet.statedTotal, 900_000);
  assert.equal(sheet.reconciles, false);
  assert.match(describeSheet(sheet), /but your sheet says ₦900,000/);
});

test("a line whose own total is mistyped is flagged", () => {
  // quantity x unit is 60,000; the sheet says 70,000. Neither is silently
  // preferred — he is told.
  const sheet = parseCostingSheet("Camera\t30,000.00\t2\t70,000.00");
  assert.equal(sheet.lines[0].amount, 60_000);
  assert.deepEqual(sheet.disagreements, [{ name: "Camera", stated: 70_000, computed: 60_000 }]);
});

test("an empty or junk paste yields nothing rather than throwing", () => {
  assert.equal(parseCostingSheet("").lines.length, 0);
  assert.equal(parseCostingSheet("just some words\nand more").lines.length, 0);
  assert.equal(parseCostingSheet(null as never).lines.length, 0);
  assert.match(describeSheet(parseCostingSheet("")), /No costed lines/);
});

// ---- categories ----------------------------------------------------------

test("the catalogue names the department, because it is the company's vocabulary", () => {
  const sheet = parseCostingSheet(SHEET);
  const lines = categoriseLines(sheet.lines, CATALOGUE, CATEGORIES);
  const by = (name: string) => lines.find((l) => l.name === name)?.category;

  assert.equal(by("Wireless Receiver"), "Cameras & Capture", "no keyword list would know this");
  assert.equal(by("TV + Stand"), "Displays");
  assert.equal(by("SIDE TABLES"), "Furniture");
  assert.equal(by("Videographers"), "Personnel");
  assert.equal(by("WORKMANSHIP"), "Branding & Print");
});

test("rows the catalogue does not know fall back to their own words", () => {
  const sheet = parseCostingSheet(SHEET);
  const lines = categoriseLines(sheet.lines, CATALOGUE, CATEGORIES);
  const by = (name: string) => lines.find((l) => l.name === name)?.category;

  assert.equal(by("LED screen (6sqm)"), "Displays");
  assert.equal(by("LIGHT"), "Lighting");
  assert.equal(by("SOUND"), "Sound");
  assert.equal(by("BANNERS"), "Branding & Print");
  assert.equal(by("TRANSPORTATION"), "Logistics & Welfare");
});

test("every costed line on the real sheet lands in a department", () => {
  const sheet = parseCostingSheet(SHEET);
  const lines = categoriseLines(sheet.lines, CATALOGUE, CATEGORIES);
  const homeless = lines.filter((l) => !l.category).map((l) => l.name);
  assert.deepEqual(homeless, [], `these would import uncategorised: ${homeless.join(", ")}`);
});

test("a category that no longer exists is refused rather than invented", () => {
  const sheet = parseCostingSheet("LIGHT\t400,000.00\t1");
  const lines = categoriseLines(sheet.lines, [], ["Sound"]);
  assert.equal(lines[0].category, null, "Lighting is not in this catalogue");
});

test("describeSheet says plainly that it matches", () => {
  assert.match(describeSheet(parseCostingSheet(SHEET)), /20 lines, ₦4,643,400 — matches the total/);
});

test("A JOB TITLE IS A PERSON, whatever heading it sits under", () => {
  // "PRODUCER" sits under "Editing" on his sheet and imported as
  // Post-Production — the heading outranked the only word that mattered.
  const sheet = parseCostingSheet(SHEET);
  const lines = categoriseLines(sheet.lines, CATALOGUE, CATEGORIES);
  assert.equal(lines.find((l) => l.name === "PRODUCER")?.category, "Personnel");
});

test("the real sheet imports with every line in a department", () => {
  const sheet = parseCostingSheet(SHEET);
  const lines = categoriseLines(sheet.lines, CATALOGUE, CATEGORIES);
  assert.equal(lines.filter((l) => !l.category).length, 0);
  // And the departments are the ones a production manager would expect.
  const spend: Record<string, number> = {};
  for (const l of lines) spend[l.category!] = (spend[l.category!] ?? 0) + l.amount;
  assert.equal(spend["Displays"], 1_455_000, "two TVs, a TV+stand and nine LED panels");
  assert.equal(spend["Branding & Print"], 1_398_400);
  assert.equal(spend["Logistics & Welfare"], 120_000, "two transport runs");
  assert.equal(Object.values(spend).reduce((a, b) => a + b, 0), 4_643_400);
});
