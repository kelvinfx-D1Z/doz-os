// ============================================================
// FILING A SENTENCE INTO THE BOOKS
//
// The founder's ask: "I have paid 4 million for the PTDJ event already.
// This covers screens, sound, and lights. I need to be able to add it to the
// AI and it should automatically file it up for me."
//
// So: one line of plain English becomes a project, its cost lines, and a
// record of the money. This module is the part that must never be clever.
//
// IT PROPOSES; IT DOES NOT POST
// Every figure here ends up in the finance module, in a margin, in what the
// company believes it is owed. So nothing is written until the founder sees
// exactly what will be written and says yes. The AI's job is to save him the
// typing, not to move money on its own reading of a sentence.
//
// THREE THINGS IT REFUSES TO GUESS
// 1. WHICH PROJECT. "PTDJ" is one letter from "PTDF NOG BOOTH", a real
//    project with a real budget. Filing against the wrong job corrupts two
//    sets of books at once, so a near-miss is raised as a question, never
//    resolved silently.
// 2. HOW THE MONEY SPLITS. "4 million covers screens, sound and lights" does
//    not say how much each took. Dividing by three would invent three
//    figures that then drive every margin on the job. The lines are created
//    unpriced and the total is recorded as what it is: one payment.
// 3. WHICH DIRECTION THE MONEY WENT. Paid out to suppliers is a cost;
//    received from a client is revenue. They are opposite entries. The
//    sentence is read for it, and the reading is shown for confirmation.
//
// Pure and DB-free so the route and the tests share one answer.
// ============================================================

export type MoneyDirection = "PAID_OUT" | "RECEIVED";

/**
 * A number as a Nigerian founder writes it: "4 million", "₦4m", "4.5m",
 * "400k", "4,000,000".
 *
 * Returns null when there is no figure to read. Null is not zero — zero
 * would be a claim that nothing was paid.
 */
export function parseMoney(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? input : null;
  if (typeof input !== "string") return null;

  const text = input.toLowerCase().replace(/[₦,\s]/g, "");
  // Digits, optional decimal, optional magnitude suffix.
  const m = /^(?:ngn)?(\d+(?:\.\d+)?)(m|million|k|thousand|bn|b|billion)?$/.exec(text);
  if (!m) return null;

  const value = Number(m[1]);
  if (!Number.isFinite(value) || value < 0) return null;
  const suffix = m[2] ?? "";
  const multiplier =
    suffix === "m" || suffix === "million" ? 1_000_000
    : suffix === "k" || suffix === "thousand" ? 1_000
    : suffix === "bn" || suffix === "b" || suffix === "billion" ? 1_000_000_000
    : 1;
  const total = value * multiplier;
  // Rounded to the kobo, like every other money figure in this codebase.
  return Math.round(total * 100) / 100;
}

/**
 * The words a founder uses for a department, and the catalogue category each
 * one means.
 *
 * Checked against the real categories at build time, so a renamed category
 * shows up as an unmapped word rather than as a line filed under a heading
 * that no longer exists.
 */
const DEPARTMENT_WORDS: Record<string, string> = {
  screen: "Displays", screens: "Displays", led: "Displays", display: "Displays",
  displays: "Displays", tv: "Displays", projector: "Displays", projection: "Displays",
  sound: "Sound", audio: "Sound", pa: "Sound", speakers: "Sound", microphone: "Sound",
  microphones: "Sound", mic: "Sound", mics: "Sound",
  light: "Lighting", lights: "Lighting", lighting: "Lighting",
  camera: "Cameras & Capture", cameras: "Cameras & Capture", video: "Cameras & Capture",
  filming: "Cameras & Capture", photography: "Cameras & Capture",
  stream: "Streaming & Broadcast", streaming: "Streaming & Broadcast",
  livestream: "Streaming & Broadcast", broadcast: "Streaming & Broadcast",
  stage: "Stage & Scenic Fabrication", staging: "Stage & Scenic Fabrication",
  truss: "Stage & Scenic Fabrication", rigging: "Stage & Scenic Fabrication",
  branding: "Branding & Print", print: "Branding & Print", printing: "Branding & Print",
  furniture: "Furniture", chairs: "Furniture", tables: "Furniture",
  crew: "Personnel", personnel: "Personnel", staff: "Personnel", manpower: "Personnel",
  logistics: "Logistics & Welfare", transport: "Logistics & Welfare", catering: "Logistics & Welfare",
  drone: "Drone", decoration: "Decoration", decor: "Decoration",
  booth: "Exhibition Stands", stand: "Exhibition Stands", exhibition: "Exhibition Stands",
  edit: "Post-Production", editing: "Post-Production", post: "Post-Production",
};

export interface DepartmentMatch {
  /** The founder's own word, kept so the proposal reads back in his language. */
  said: string;
  /** The catalogue category, or null when nothing in the catalogue matches. */
  category: string | null;
}

/**
 * Map the words a founder used to catalogue categories.
 *
 * `knownCategories` comes from the live catalogue: a word that maps to a
 * category which no longer exists is reported unmapped rather than filed
 * under a heading nothing else uses.
 */
export function mapDepartments(words: string[], knownCategories: string[]): DepartmentMatch[] {
  const known = new Set(knownCategories.map((c) => c.toLowerCase()));
  const out: DepartmentMatch[] = [];
  const seen = new Set<string>();

  for (const raw of words) {
    const said = String(raw ?? "").trim();
    if (!said) continue;
    const key = said.toLowerCase().replace(/[^a-z& ]/g, "").trim();

    // An exact category name wins over the synonym table.
    const direct = knownCategories.find((c) => c.toLowerCase() === key);
    const mapped = direct ?? DEPARTMENT_WORDS[key] ?? DEPARTMENT_WORDS[key.replace(/s$/, "")] ?? null;
    const category = mapped && known.has(mapped.toLowerCase()) ? mapped : null;

    const dedupe = (category ?? said).toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ said, category });
  }
  return out;
}

/** Levenshtein distance, for telling a typo from a different project. */
export function editDistance(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 0;
  const rows = s.length + 1;
  const cols = t.length + 1;
  let prev = Array.from({ length: cols }, (_, i) => i);
  for (let i = 1; i < rows; i++) {
    const curr = [i];
    for (let j = 1; j < cols; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[cols - 1];
}

export interface ProjectRef {
  id: string;
  name: string;
  code?: string | null;
}

export interface ProjectMatch {
  /** "exact" is safe to use; "near" must be confirmed; "none" means new. */
  kind: "exact" | "near" | "none";
  project: ProjectRef | null;
  /** Other candidates worth offering, best first. */
  alternatives: ProjectRef[];
}

/**
 * Find the project a sentence is about.
 *
 * NEAR IS NOT EXACT. "PTDJ" against a real "PTDF NOG BOOTH" is one
 * character out — almost certainly the same job, and "almost certainly" is
 * not good enough to post money against. A near match is returned as a
 * question for the founder, never silently taken.
 */
export function matchProject(spoken: string, projects: ProjectRef[]): ProjectMatch {
  const said = String(spoken ?? "").trim();
  if (!said) return { kind: "none", project: null, alternatives: [] };

  const key = said.toLowerCase();
  const scored: Array<{ p: ProjectRef; score: number; exact: boolean }> = [];

  for (const p of projects) {
    const name = p.name.toLowerCase();
    const code = (p.code ?? "").toLowerCase();
    if (name === key || code === key) {
      scored.push({ p, score: 0, exact: true });
      continue;
    }
    // A whole-word hit inside a longer project name ("PENGASSAN" inside
    // "PENGASSAN CONFERENCE") is as good as exact.
    const words = name.split(/[^a-z0-9]+/).filter(Boolean);
    if (words.includes(key)) {
      scored.push({ p, score: 0, exact: true });
      continue;
    }
    // Otherwise the best distance between the spoken word and any one word
    // of the name — so "PTDJ" is compared against "PTDF", not the whole
    // "PTDF NOG BOOTH".
    const best = Math.min(...words.map((w) => editDistance(key, w)), editDistance(key, name));
    scored.push({ p, score: best, exact: false });
  }

  scored.sort((a, b) => a.score - b.score);
  const exact = scored.filter((s) => s.exact);
  if (exact.length === 1) {
    return { kind: "exact", project: exact[0].p, alternatives: [] };
  }
  if (exact.length > 1) {
    // Two projects of the same name — PENGASSAN appears twice in this very
    // database. Choosing between them is the founder's call.
    return { kind: "near", project: null, alternatives: exact.map((s) => s.p) };
  }

  // A typo is one or two characters out on a word of reasonable length.
  const tolerance = key.length <= 4 ? 1 : 2;
  const close = scored.filter((s) => s.score <= tolerance);
  if (close.length > 0) {
    return { kind: "near", project: null, alternatives: close.slice(0, 4).map((s) => s.p) };
  }
  return { kind: "none", project: null, alternatives: [] };
}

export interface DraftLine {
  serviceName: string;
  category: string | null;
  quantity: number;
  days: number;
  /** Null means "not yet costed" — never 0, which would claim it was free. */
  unitPrice: number | null;
}

export interface FilingPlan {
  /** What the founder typed, kept verbatim on the record. */
  note: string;
  projectName: string;
  projectMatch: ProjectMatch;
  lines: DraftLine[];
  amount: number | null;
  direction: MoneyDirection;
  /** The day the money moved, if the sentence said. */
  occurredOn: Date | null;
  /** Things the founder must decide before this can be filed. */
  questions: string[];
  /** Things worth knowing but not blocking. */
  notes: string[];
}

export interface ParsedSentence {
  projectName?: string;
  amount?: string | number;
  direction?: string;
  departments?: string[];
  occurredOn?: string;
}

export interface PlanContext {
  projects: ProjectRef[];
  categories: string[];
  now?: Date;
}

/**
 * Turn what the model read out of the sentence into a plan the founder can
 * check line by line.
 *
 * Everything uncertain becomes a question rather than a default. A plan with
 * questions is still returned — he may be able to answer them in one click —
 * but the route refuses to post one until they are gone.
 */
export function buildFilingPlan(
  note: string,
  parsed: ParsedSentence,
  context: PlanContext,
): FilingPlan {
  const questions: string[] = [];
  const notes: string[] = [];

  const projectName = String(parsed.projectName ?? "").trim();
  const projectMatch = projectName
    ? matchProject(projectName, context.projects)
    : { kind: "none" as const, project: null, alternatives: [] };

  if (!projectName) {
    questions.push("Which project is this for?");
  } else if (projectMatch.kind === "near") {
    const names = projectMatch.alternatives.map((p) => p.name).join(", ");
    questions.push(
      `Is "${projectName}" the same job as ${names}? Pick one, or say it is a new project.`,
    );
  }

  const amount = parseMoney(parsed.amount ?? null);
  if (amount === null) {
    questions.push("How much was it?");
  } else if (amount === 0) {
    notes.push("Recorded as zero — nothing was paid.");
  }

  const direction: MoneyDirection = parsed.direction === "RECEIVED" ? "RECEIVED" : "PAID_OUT";

  const departments = mapDepartments(parsed.departments ?? [], context.categories);
  const lines: DraftLine[] = departments.map((d) => ({
    serviceName: d.said,
    category: d.category,
    quantity: 1,
    days: 1,
    // Never a share of the total. See the note at the top of this file.
    unitPrice: null,
  }));

  const unmapped = departments.filter((d) => !d.category).map((d) => d.said);
  if (unmapped.length > 0) {
    notes.push(
      `No catalogue department matches ${unmapped.join(", ")} — ${unmapped.length === 1 ? "that line goes" : "those lines go"} in uncategorised.`,
    );
  }

  if (amount !== null && amount > 0 && lines.length > 1) {
    notes.push(
      `The ${formatNaira(amount)} is recorded as one payment. It does not say how much of it each of the ${lines.length} covers, so the cost lines are left unpriced — fill them in when you know the split.`,
    );
  }

  const occurredOn = parseDay(parsed.occurredOn, context.now ?? new Date());

  return { note, projectName, projectMatch, lines, amount, direction, occurredOn, questions, notes };
}

/** Whether a plan is complete enough to post. */
export function isPostable(plan: FilingPlan): boolean {
  return plan.questions.length === 0 && plan.amount !== null;
}

/** "₦4,000,000" — whole naira, as every client-facing figure here is. */
export function formatNaira(n: number): string {
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

/** A date the sentence actually named, or null — never today as a guess. */
function parseDay(raw: unknown, now: Date): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const text = raw.trim().toLowerCase();
  if (text === "today") return startOfDay(now);
  if (text === "yesterday") {
    const d = startOfDay(now);
    d.setDate(d.getDate() - 1);
    return d;
  }
  const d = new Date(raw.trim());
  if (!Number.isFinite(d.getTime())) return null;
  // A payment cannot have been made next month.
  if (d.getTime() > now.getTime() + 86_400_000) return null;
  return d;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
