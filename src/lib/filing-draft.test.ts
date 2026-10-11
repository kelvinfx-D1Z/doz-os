import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMoney,
  mapDepartments,
  matchProject,
  editDistance,
  buildFilingPlan,
  isPostable,
  formatNaira,
  type ProjectRef,
} from "./filing-draft.ts";

const CATEGORIES = [
  "Displays", "Sound", "Lighting", "Cameras & Capture", "Streaming & Broadcast",
  "Stage & Scenic Fabrication", "Branding & Print", "Furniture", "Personnel",
  "Logistics & Welfare", "Post-Production", "Exhibition Stands", "Drone", "Decoration",
];

// The real projects in this database, including the two identically named ones.
const PROJECTS: ProjectRef[] = [
  { id: "p1", name: "PTDF NOG BOOTH", code: "EXH-2026-006" },
  { id: "p2", name: "PENGASSAN", code: "EVT-2026-007" },
  { id: "p3", name: "PENGASSAN", code: "EVT-2026-006" },
  { id: "p4", name: "TRIPLE HELIX CONFERNCE 2026", code: "EVT-2026-004" },
  { id: "p5", name: "MRS ISEKO @ 70", code: "VID-2026-005" },
];

const NOW = new Date("2026-10-11T09:00:00");
const ctx = { projects: PROJECTS, categories: CATEGORIES, now: NOW };

// ---- money ---------------------------------------------------------------

test("money is read the way a founder writes it", () => {
  assert.equal(parseMoney("4 million"), 4_000_000);
  assert.equal(parseMoney("₦4m"), 4_000_000);
  assert.equal(parseMoney("4.5m"), 4_500_000);
  assert.equal(parseMoney("400k"), 400_000);
  assert.equal(parseMoney("4,000,000"), 4_000_000);
  assert.equal(parseMoney("₦ 4,000,000"), 4_000_000);
  assert.equal(parseMoney(4_000_000), 4_000_000);
});

test("NO FIGURE IS NOT ZERO", () => {
  // Zero would be a claim that nothing was paid. Absent is a question.
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("some money"), null);
  assert.equal(parseMoney(null), null);
  assert.equal(parseMoney(undefined), null);
  assert.equal(parseMoney("-500"), null);
  assert.equal(parseMoney("4 million naira for screens"), null, "a whole sentence is not a figure");
});

test("a real zero is kept, because a complimentary job is a real thing", () => {
  assert.equal(parseMoney("0"), 0);
  assert.equal(parseMoney(0), 0);
});

// ---- departments ---------------------------------------------------------

test("the founder's own words map to catalogue departments", () => {
  const mapped = mapDepartments(["screens", "sound", "lights"], CATEGORIES);
  assert.deepEqual(mapped.map((m) => m.category), ["Displays", "Sound", "Lighting"]);
  assert.deepEqual(mapped.map((m) => m.said), ["screens", "sound", "lights"], "his wording is kept");
});

test("singular, plural and synonyms all land in the right place", () => {
  assert.equal(mapDepartments(["screen"], CATEGORIES)[0].category, "Displays");
  assert.equal(mapDepartments(["LED"], CATEGORIES)[0].category, "Displays");
  assert.equal(mapDepartments(["audio"], CATEGORIES)[0].category, "Sound");
  assert.equal(mapDepartments(["lighting"], CATEGORIES)[0].category, "Lighting");
  assert.equal(mapDepartments(["livestream"], CATEGORIES)[0].category, "Streaming & Broadcast");
});

test("an exact category name is taken as written", () => {
  assert.equal(mapDepartments(["Exhibition Stands"], CATEGORIES)[0].category, "Exhibition Stands");
});

test("a word with no department is reported, not filed under a guess", () => {
  const [m] = mapDepartments(["fireworks"], CATEGORIES);
  assert.equal(m.category, null);
  assert.equal(m.said, "fireworks");
});

test("a synonym for a department that no longer exists maps to nothing", () => {
  // The catalogue was pruned once already. A word pointing at a dead
  // category must not file a line under a heading nothing else uses.
  const [m] = mapDepartments(["screens"], ["Sound", "Lighting"]);
  assert.equal(m.category, null);
});

test("the same department said twice is one line", () => {
  const mapped = mapDepartments(["screens", "LED", "displays"], CATEGORIES);
  assert.equal(mapped.length, 1);
});

// ---- which project -------------------------------------------------------

test("THE PTDJ CASE: a one-letter miss is a question, never a silent pick", () => {
  // "PTDJ" against the real "PTDF NOG BOOTH". Filing ₦4m against the wrong
  // job corrupts two sets of books at once.
  const m = matchProject("PTDJ", PROJECTS);
  assert.equal(m.kind, "near");
  assert.equal(m.project, null, "nothing is chosen for him");
  assert.equal(m.alternatives[0].name, "PTDF NOG BOOTH");
});

test("an exact name is taken without fuss", () => {
  const m = matchProject("TRIPLE HELIX CONFERNCE 2026", PROJECTS);
  assert.equal(m.kind, "exact");
  assert.equal(m.project?.id, "p4");
});

test("a project code works as well as a name", () => {
  assert.equal(matchProject("EXH-2026-006", PROJECTS).project?.id, "p1");
});

test("TWO PROJECTS OF THE SAME NAME: he chooses, not the machine", () => {
  // PENGASSAN appears twice in this database, with different budgets.
  const m = matchProject("PENGASSAN", PROJECTS);
  assert.equal(m.kind, "near");
  assert.equal(m.project, null);
  assert.equal(m.alternatives.length, 2);
});

test("a genuinely new event is not forced onto an existing project", () => {
  const m = matchProject("SHELL TOWN HALL", PROJECTS);
  assert.equal(m.kind, "none");
  assert.deepEqual(m.alternatives, []);
});

test("editDistance measures what it should", () => {
  assert.equal(editDistance("PTDJ", "PTDF"), 1);
  assert.equal(editDistance("same", "same"), 0);
  assert.equal(editDistance("", "abc"), 3);
  assert.equal(editDistance("kitten", "sitting"), 3);
});

// ---- the whole plan ------------------------------------------------------

const SENTENCE = "I have paid 4 million for the PTDJ event already. This covers screens, sound, and lights.";

test("THE FOUNDER'S OWN SENTENCE, end to end", () => {
  const plan = buildFilingPlan(SENTENCE, {
    projectName: "PTDJ",
    amount: "4 million",
    direction: "PAID_OUT",
    departments: ["screens", "sound", "lights"],
  }, ctx);

  assert.equal(plan.amount, 4_000_000);
  assert.equal(plan.direction, "PAID_OUT", "'I have paid' is money going out");
  assert.deepEqual(plan.lines.map((l) => l.category), ["Displays", "Sound", "Lighting"]);
  assert.equal(plan.note, SENTENCE, "what he typed is kept verbatim");

  // The two things it will not decide for him.
  assert.equal(plan.questions.length, 1);
  assert.match(plan.questions[0], /PTDF NOG BOOTH/);
  assert.equal(isPostable(plan), false, "it cannot be filed until he answers");
});

test("THE SPLIT IS NEVER INVENTED", () => {
  // Three lines, one total. Dividing by three would create three figures
  // nobody stated, and every margin on the job would inherit them.
  const plan = buildFilingPlan(SENTENCE, {
    projectName: "PTDF NOG BOOTH",
    amount: "4 million",
    departments: ["screens", "sound", "lights"],
  }, ctx);
  assert.deepEqual(plan.lines.map((l) => l.unitPrice), [null, null, null]);
  assert.ok(plan.notes.some((n) => /does not say how much/.test(n)));
  assert.ok(plan.notes.some((n) => n.includes("₦4,000,000")));
});

test("a plan with a real project and a real figure is postable", () => {
  const plan = buildFilingPlan("Paid 2m to the stage people for Triple Helix", {
    projectName: "TRIPLE HELIX CONFERNCE 2026",
    amount: "2m",
    departments: ["stage"],
  }, ctx);
  assert.equal(isPostable(plan), true);
  assert.equal(plan.projectMatch.kind, "exact");
  assert.equal(plan.lines[0].category, "Stage & Scenic Fabrication");
});

test("no amount and no project each raise their own question", () => {
  const plan = buildFilingPlan("something happened", {}, ctx);
  assert.equal(isPostable(plan), false);
  assert.ok(plan.questions.some((q) => /which project/i.test(q)));
  assert.ok(plan.questions.some((q) => /how much/i.test(q)));
});

test("DIRECTION: money in and money out are opposite entries", () => {
  const out = buildFilingPlan("x", { projectName: "PENGASSAN", amount: "1m", direction: "PAID_OUT" }, ctx);
  const inbound = buildFilingPlan("x", { projectName: "PENGASSAN", amount: "1m", direction: "RECEIVED" }, ctx);
  assert.equal(out.direction, "PAID_OUT");
  assert.equal(inbound.direction, "RECEIVED");
});

test("an unreadable direction defaults to money out, which is the safer read", () => {
  // Booking a cost the company did not incur is visible on the next margin
  // check; inventing revenue flatters the books instead.
  const plan = buildFilingPlan("x", { projectName: "PENGASSAN", amount: "1m", direction: "sideways" }, ctx);
  assert.equal(plan.direction, "PAID_OUT");
});

test("a date is only taken when the sentence gave one", () => {
  assert.equal(buildFilingPlan("x", { amount: "1m" }, ctx).occurredOn, null);
  const today = buildFilingPlan("x", { amount: "1m", occurredOn: "today" }, ctx).occurredOn;
  assert.equal(today?.toDateString(), NOW.toDateString());
  const named = buildFilingPlan("x", { amount: "1m", occurredOn: "2026-09-30" }, ctx).occurredOn;
  assert.equal(named?.toISOString().slice(0, 10), "2026-09-30");
});

test("a payment cannot have been made next month", () => {
  const plan = buildFilingPlan("x", { amount: "1m", occurredOn: "2026-12-25" }, ctx);
  assert.equal(plan.occurredOn, null);
});

test("an unmapped department is called out in the notes", () => {
  const plan = buildFilingPlan("x", {
    projectName: "PENGASSAN", amount: "1m", departments: ["screens", "fireworks"],
  }, ctx);
  assert.ok(plan.notes.some((n) => /fireworks/.test(n)));
});

test("formatNaira writes whole naira, as every figure here does", () => {
  assert.equal(formatNaira(4_000_000), "₦4,000,000");
  assert.equal(formatNaira(0), "₦0");
});
