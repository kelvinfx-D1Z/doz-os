// ============================================================
// READING THE FOUNDER'S OWN COSTING SHEET
//
// "I have to find a way to transition from how I used to do business. I
// should be able to paste the excel file and it sorts it out."
//
// He has years of these: a production costing sheet per job, sections down
// the left, unit cost and quantity across, a total at the bottom. This reads
// one, exactly as Excel puts it on the clipboard, and turns it into cost
// lines.
//
// NO AI READS THIS
// A costing sheet is arithmetic, not prose. A language model asked to read
// one can round ₦368,400 to ₦368,000, drop a row it finds odd, or silently
// "fix" a total — and the founder would have no way to see it happened. So
// this is a parser: every figure is read from the cell it sits in, and the
// result is checked against the TOTAL he himself typed at the bottom. If the
// two disagree, the import says so rather than quietly preferring its own
// arithmetic.
//
// THE RULE THAT MAKES THE SHAPE READABLE
// A row with a unit cost is an item. A row without one is a heading. That is
// what separates the "LIGHT" that is a ₦400,000 line from the "STAGE" that
// is a section title, without a list of magic words — and it matches what
// the sheet means: a row with no price costs nothing.
// ============================================================

/** A number as Excel pastes it: "  30,000.00 ", "250,000.00", "-", "". */
export function parseCell(raw: string | undefined): number | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[ \s]/g, "").replace(/,/g, "");
  if (!text) return null;
  // A lone dash is Excel's nil, not a minus sign.
  if (/^[-–—]+$/.test(text)) return null;
  if (!/^[(-]?\d*\.?\d+\)?$/.test(text)) return null;
  // Accounting negatives come wrapped in brackets.
  const negative = text.startsWith("(") && text.endsWith(")");
  const n = Number(text.replace(/[()]/g, ""));
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export interface SheetLine {
  /** The founder's own wording, kept so he recognises his sheet. */
  name: string;
  /** The heading it sat under, or null at the top of the sheet. */
  section: string | null;
  unitCost: number;
  quantity: number;
  /** From a "2 DAYS" header, or the sheet's own days column. */
  days: number;
  /** quantity x days x unitCost — recomputed here, never taken from a cell. */
  amount: number;
  /** The line total his sheet showed, when it showed one. */
  statedAmount: number | null;
  /** Catalogue category, once resolved against the live catalogue. */
  category: string | null;
}

export interface CostingSheet {
  title: string | null;
  lines: SheetLine[];
  /** Sum of the lines read. */
  computedTotal: number;
  /** The TOTAL row from his sheet, when there is one. */
  statedTotal: number | null;
  /** Whether the two agree to the naira. */
  reconciles: boolean;
  /** Money his sheet records as already received. */
  received: number | null;
  /** Named rows carrying no price — listed, so nothing looks lost. */
  uncosted: string[];
  /** Rows whose own line total disagrees with quantity x unit cost. */
  disagreements: Array<{ name: string; stated: number; computed: number }>;
}

/**
 * Where the figures sit on THIS sheet.
 *
 * His September sheet is name / unit cost / quantity, but his other sheets
 * are not all laid out that way, and a sheet that lists only an amount is
 * common. So the column header row is read when there is one, and the
 * positional default is the fallback.
 */
export interface Columns {
  name: number;
  unitCost: number | null;
  quantity: number | null;
  amount: number | null;
  days: number | null;
}

const DEFAULT_COLUMNS: Columns = { name: 0, unitCost: 1, quantity: 2, amount: 3, days: null };

const COLUMN_WORDS: Array<[keyof Columns, RegExp]> = [
  ["unitCost", /unit\s*(cost|price|rate)|rate\/day|cost\/day|unit$|^rate$/i],
  ["quantity", /^q(ty|uantity)\b|^no\.?$|^number$|^units?$/i],
  ["amount", /^(amount|total|line\s*total|sub\s*total|value)\b/i],
  ["days", /^days?\b|^no\.?\s*of\s*days/i],
  ["name", /^(type|item|description|particulars|service)\b/i],
];

/** Read a header row, when the sheet has one. Null when it is not a header. */
export function readColumns(cells: string[]): Columns | null {
  const found: Partial<Columns> = {};
  let hits = 0;
  cells.forEach((cell, i) => {
    const text = cell.trim();
    if (!text || parseCell(text) !== null) return;
    for (const [key, pattern] of COLUMN_WORDS) {
      if (found[key] === undefined && pattern.test(text)) {
        found[key] = i;
        hits++;
        break;
      }
    }
  });
  // One stray word is not a header row; a cost or amount column plus one
  // other heading is.
  if (hits < 2 || (found.unitCost === undefined && found.amount === undefined)) return null;
  return {
    name: found.name ?? 0,
    unitCost: found.unitCost ?? null,
    quantity: found.quantity ?? null,
    amount: found.amount ?? null,
    days: found.days ?? null,
  };
}

/** "1 DAY", "2 DAYS", "3 Days" anywhere on a row — the sheet's day count. */
export function readDays(cells: string[]): number | null {
  for (const cell of cells) {
    const m = /^(\d+)\s*days?$/i.exec(cell.trim());
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 60) return n;
    }
  }
  return null;
}

const TOTAL_WORDS = /^(grand\s+)?total\b/i;
const RECEIVED_WORDS = /^received\b/i;
const BALANCE_WORDS = /^balance\b/i;
/** Excel's own column headings, which are not data. */
const HEADER_WORDS = /^(type|item|description|unit\s*cost|qty|quantity|s\/?n|no\.?)\b/i;

/**
 * Read a costing sheet pasted from Excel.
 *
 * Tab-separated, as every spreadsheet puts it on the clipboard. Rows with no
 * name and only numbers are subtotals the sheet computed for itself and are
 * skipped: counting them would double every section.
 */
export function parseCostingSheet(text: string): CostingSheet {
  const lines: SheetLine[] = [];
  const uncosted: string[] = [];
  const disagreements: CostingSheet["disagreements"] = [];
  let title: string | null = null;
  let statedTotal: number | null = null;
  let received: number | null = null;
  let section: string | null = null;
  // Set from the sheet's own header row, if it has one; otherwise the
  // positional layout his September sheet uses.
  let columns: Columns = DEFAULT_COLUMNS;
  let days = 1;

  const rows = String(text ?? "").split(/\r?\n/);

  for (const row of rows) {
    const cells = row.split("\t").map((c) => c.trim());
    const name = (cells[0] ?? "").trim();
    const numbers = cells.slice(1).map(parseCell);
    const hasNumber = numbers.some((n) => n !== null);

    // A subtotal: no label, just figures the sheet worked out for itself.
    if (!name) {
      // The TOTAL and BALANCE labels sometimes sit in a middle column.
      const labelCell = cells.find((c) => TOTAL_WORDS.test(c) || BALANCE_WORDS.test(c) || RECEIVED_WORDS.test(c));
      if (labelCell && RECEIVED_WORDS.test(labelCell)) {
        received = received ?? 0;
      }
      continue;
    }

    // A header row tells us where the figures are. It is also where "1 DAY"
    // lives on his sheet, so the day count is read from the same place.
    const headerColumns = readColumns(cells);
    if (headerColumns) {
      columns = headerColumns;
      days = readDays(cells) ?? days;
      continue;
    }
    const rowDays = readDays(cells);
    if (rowDays && !parseCell(cells[columns.unitCost ?? 1])) {
      // A bare "2 DAYS" banner above a block.
      days = rowDays;
      continue;
    }
    if (HEADER_WORDS.test(name) && !parseCell(cells[1])) continue;

    if (TOTAL_WORDS.test(name)) {
      // The biggest figure on the row — his sheet repeats it across columns.
      const found = numbers.filter((n): n is number => n !== null);
      if (found.length > 0) statedTotal = Math.max(...found);
      continue;
    }
    if (RECEIVED_WORDS.test(name)) {
      const found = numbers.filter((n): n is number => n !== null);
      received = found.length > 0 ? Math.max(...found) : 0;
      continue;
    }
    if (BALANCE_WORDS.test(name)) continue;

    const quantityCell = columns.quantity === null ? null : parseCell(cells[columns.quantity]);
    const amountCell = columns.amount === null ? null : parseCell(cells[columns.amount]);
    let unitCost = columns.unitCost === null ? null : parseCell(cells[columns.unitCost]);
    // A sheet that lists only an amount is still a cost sheet: the amount
    // becomes the unit cost of a single unit, so the figure survives intact.
    if ((unitCost === null || unitCost <= 0) && amountCell !== null && amountCell > 0 && columns.unitCost === null) {
      unitCost = quantityCell && quantityCell > 0 ? amountCell / quantityCell : amountCell;
    }

    // THE RULE: a price makes it an item; no price makes it context.
    if (unitCost === null || unitCost <= 0) {
      const rest = cells.slice(1);
      const restIsEmpty = rest.every((c) => c === "");
      // Accounting dashes are an empty row dressed up, so a heading may carry
      // them: "STAGE", "PHOTOGRAPHY" and "BRANDING (FABRICATION + PRINTING)"
      // all do on this sheet, and the lines beneath them need that heading to
      // know which department they belong to.
      const restIsBlankish = rest.every((c) => c === "" || /^[-–—]+$/.test(c.replace(/\s/g, "")));
      // His headings are upper case. A quantity makes it a line he listed and
      // did not cost, however it is written.
      const isHeading = /[A-Z]/.test(name) && name === name.toUpperCase() && restIsBlankish;

      if (isHeading) section = name;
      // Anything that is not a bare structural heading is reported, so a row
      // he wrote never disappears without being accounted for.
      if (!isHeading || !restIsEmpty) uncosted.push(name);
      continue;
    }

    const quantity = Math.max(1, Math.trunc(quantityCell ?? 1));
    const lineDays = Math.max(1, Math.trunc((columns.days === null ? null : parseCell(cells[columns.days])) ?? days));
    const amount = Math.round(quantity * lineDays * unitCost * 100) / 100;

    // His sheet's own line total, where it has one, so a typo in either is
    // visible instead of being overwritten. Counted from the column AFTER
    // quantity — reading the quantity itself as the total made every line
    // with a quantity above one look like a mistake.
    const stated =
      amountCell !== null && amountCell > 0 && columns.amount !== columns.unitCost
        ? amountCell
        : numbers.slice(2).find((n): n is number => n !== null && n > 0) ?? null;
    if (stated !== null && Math.abs(stated - amount) > 1) {
      disagreements.push({ name, stated, computed: amount });
    }

    lines.push({ name, section, unitCost, quantity, days: lineDays, amount, statedAmount: stated, category: null });
  }

  // The first non-empty row is the sheet's own title, when it is not data.
  for (const row of rows) {
    const first = row.split("\t")[0]?.trim();
    if (first) {
      if (!lines.some((l) => l.name === first)) title = first;
      break;
    }
  }

  const computedTotal = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  return {
    title,
    lines,
    computedTotal,
    statedTotal,
    reconciles: statedTotal === null ? true : Math.abs(statedTotal - computedTotal) <= 1,
    received,
    uncosted,
    disagreements,
  };
}

export interface CatalogueEntry {
  name: string;
  category: string;
}

/** Lowercase, no punctuation — for comparing a sheet row to a catalogue name. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

/** The heading words a founder uses, and the catalogue category each means. */
const SECTION_CATEGORIES: Array<[RegExp, string]> = [
  [/equipment|rental|cable|connector|accessor/i, "Cameras & Capture"],
  [/photograph/i, "Cameras & Capture"],
  [/livestream|streaming|broadcast/i, "Streaming & Broadcast"],
  // A job title is a person, whatever heading it sits under: "PRODUCER" sat
  // beneath "Editing" on this sheet and imported as Post-Production.
  [/personnel|crew|manpower|producer|director|videograph|photograph|engineer|operator|technician/i, "Personnel"],
  [/transport|logistic|lunch|welfare/i, "Logistics & Welfare"],
  [/drone/i, "Drone"],
  [/stage|scenic|fabrication/i, "Stage & Scenic Fabrication"],
  [/branding|printing|print|banner/i, "Branding & Print"],
  [/registration|id card|lanyard/i, "Branding & Print"],
  [/post\s*production|editing|edit/i, "Post-Production"],
  [/light/i, "Lighting"],
  [/sound|audio/i, "Sound"],
  [/screen|led|display|tv|projection/i, "Displays"],
  [/furniture|chair|table/i, "Furniture"],
  [/decor/i, "Decoration"],
  [/booth|exhibition|stand/i, "Exhibition Stands"],
];

/**
 * Give every line a catalogue category.
 *
 * The catalogue is asked first, because it is the company's own vocabulary:
 * "Wireless receiver" is already filed under Cameras & Capture there, and no
 * list of keywords would work that out. Only when the catalogue has nothing
 * does it fall back to the row's own words, then to the heading it sat
 * under. A line that resolves to nothing is left null and shown as
 * uncategorised, rather than being filed under a guess.
 */
export function categoriseLines(
  lines: SheetLine[],
  catalogue: CatalogueEntry[],
  knownCategories: string[],
): SheetLine[] {
  const known = new Set(knownCategories.map((c) => c.toLowerCase()));
  const byName = new Map<string, string>();
  for (const entry of catalogue) {
    const key = normalise(entry.name);
    if (key && !byName.has(key)) byName.set(key, entry.category);
  }

  const fromWords = (text: string): string | null => {
    for (const [pattern, category] of SECTION_CATEGORIES) {
      if (pattern.test(text) && known.has(category.toLowerCase())) return category;
    }
    return null;
  };

  return lines.map((line) => {
    const key = normalise(line.name);
    let category = byName.get(key) ?? null;

    // A catalogue name contained in the row, or the other way about:
    // "TV + Stand" against the catalogue's "TV + stand". Spaces are dropped
    // for a second pass so his "Broll Camera" reaches the catalogue's
    // "B-roll camera package".
    if (!category && key) {
      const tight = key.replace(/ /g, "");
      for (const [catKey, cat] of byName) {
        const catTight = catKey.replace(/ /g, "");
        if (catKey.length < 4) continue;
        if (key.includes(catKey) || catKey.includes(key) || tight.includes(catTight) || catTight.includes(tight)) {
          category = cat;
          break;
        }
      }
    }
    if (!category) category = fromWords(line.name);
    if (!category && line.section) category = fromWords(line.section);
    if (category && !known.has(category.toLowerCase())) category = null;
    return { ...line, category };
  });
}

/** What the import will say it did, in one line. */
export function describeSheet(sheet: CostingSheet): string {
  const n = sheet.lines.length;
  if (n === 0) return "No costed lines found in that sheet.";
  const money = `₦${Math.round(sheet.computedTotal).toLocaleString("en-NG")}`;
  if (sheet.statedTotal === null) return `${n} lines, ${money}.`;
  if (sheet.reconciles) return `${n} lines, ${money} — matches the total on your sheet.`;
  const stated = `₦${Math.round(sheet.statedTotal).toLocaleString("en-NG")}`;
  return `${n} lines come to ${money}, but your sheet says ${stated}. Check before importing.`;
}

// ============================================================
// IMPORTING ONTO A PROJECT THAT ALREADY HAS A COST SHEET
//
// The second paste is the dangerous one. A founder who corrects a figure in
// Excel and pastes the sheet again means "this is the cost sheet now" — but
// the obvious implementation appends, and the job quietly costs twice what
// it costs. So the import asks, and shows what each answer does.
//
// Replacing is not free either: a line may already carry a client price set
// during markup, or a vendor it was assigned to. Those are not on the Excel
// sheet and cannot come back, so they are counted and named before anything
// is deleted.
// ============================================================

export type ImportMode = "replace" | "add";

export interface ExistingLine {
  serviceName: string;
  totalPrice: number;
  clientPrice?: number | null;
  vendorId?: string | null;
}

export interface ImportEffect {
  mode: ImportMode;
  /** Lines on the project before this import. */
  existingCount: number;
  existingTotal: number;
  /** Lines after it. */
  resultingCount: number;
  resultingTotal: number;
  /** Lines that would be deleted, and what they carry that Excel does not. */
  removedCount: number;
  losesClientPrices: number;
  losesVendors: number;
  /** Said plainly, for the screen. */
  warnings: string[];
}

/**
 * What each answer would do to the project, in figures.
 *
 * Both modes are offered because both are real: a corrected sheet replaces,
 * and a second day's costs are added. Neither is assumed.
 */
export function describeImport(
  mode: ImportMode,
  existing: ExistingLine[],
  incomingTotal: number,
  incomingCount: number,
): ImportEffect {
  const existingTotal = Math.round(existing.reduce((s, l) => s + (l.totalPrice ?? 0), 0) * 100) / 100;
  const losesClientPrices = mode === "replace" ? existing.filter((l) => l.clientPrice != null).length : 0;
  const losesVendors = mode === "replace" ? existing.filter((l) => l.vendorId).length : 0;
  const removedCount = mode === "replace" ? existing.length : 0;

  const warnings: string[] = [];
  if (mode === "replace" && existing.length > 0) {
    warnings.push(
      `Replaces the ${existing.length} cost line${existing.length === 1 ? "" : "s"} already on this project (${naira(existingTotal)}).`,
    );
    if (losesClientPrices > 0) {
      warnings.push(
        `${losesClientPrices} of them carr${losesClientPrices === 1 ? "ies a client price" : "y client prices"} set during markup. That is not on your Excel sheet and cannot be put back.`,
      );
    }
    if (losesVendors > 0) {
      warnings.push(`${losesVendors} are assigned to a vendor; that assignment goes too.`);
    }
  }
  if (mode === "add" && existing.length > 0) {
    warnings.push(
      `Adds to the ${existing.length} line${existing.length === 1 ? "" : "s"} already there — the project would cost ${naira(existingTotal + incomingTotal)}. If this sheet is a correction rather than extra work, choose Replace.`,
    );
  }

  return {
    mode,
    existingCount: existing.length,
    existingTotal,
    resultingCount: mode === "replace" ? incomingCount : existing.length + incomingCount,
    resultingTotal:
      Math.round((mode === "replace" ? incomingTotal : existingTotal + incomingTotal) * 100) / 100,
    removedCount,
    losesClientPrices,
    losesVendors,
    warnings,
  };
}

function naira(n: number): string {
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}
