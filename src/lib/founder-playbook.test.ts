import test from "node:test";
import assert from "node:assert/strict";
import {
  WEEK,
  weekInOrder,
  planForWeekday,
  planForDate,
  allBlockIds,
  isBlockId,
  weekStart,
  dayKey,
  REVIEW_QUESTIONS,
  PRIORITIES,
  NOT_NOW,
} from "./founder-playbook.ts";

test("every weekday has exactly one plan", () => {
  const days = WEEK.map((d) => d.weekday).sort();
  assert.deepEqual(days, [0, 1, 2, 3, 4, 5, 6]);
});

test("the week reads Monday first and Sunday last", () => {
  // Sunday is getDay() 0, so a naive sort would open the week on the one
  // day the playbook says not to work.
  const names = weekInOrder().map((d) => d.name);
  assert.deepEqual(names, [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  ]);
});

test("planForDate reads the day in the reader's own timezone", () => {
  // 20 September 2026 is a Sunday.
  assert.equal(planForDate(new Date(2026, 8, 20)).name, "Sunday");
  assert.equal(planForDate(new Date(2026, 8, 21)).name, "Monday");
  assert.equal(planForDate(new Date(2026, 8, 25)).name, "Friday");
});

test("SUNDAY IS PROTECTED — it carries no work blocks", () => {
  // "This is the one day you are not building." A block here would be the
  // playbook contradicting itself.
  const sunday = planForWeekday(0);
  assert.equal(sunday.blocks.length, 0);
  assert.ok(sunday.closing, "but it does carry the reason why");
});

test("block ids are unique — a completion can only mean one thing", () => {
  const ids = allBlockIds();
  assert.equal(new Set(ids).size, ids.length);
});

test("isBlockId accepts only real blocks, so junk cannot be stored", () => {
  assert.equal(isBlockId("mon-d1z"), true);
  assert.equal(isBlockId("not-a-block"), false);
  assert.equal(isBlockId(""), false);
  assert.equal(isBlockId(null), false);
  assert.equal(isBlockId(42), false);
});

test("THE WEEK RUNS MONDAY TO SUNDAY: Sunday's review belongs to the week just ended", () => {
  // The review is written on Sunday evening. Keying it to the Sunday that
  // starts a new week would file every review against the wrong seven days.
  const sunday = new Date(2026, 8, 20); // Sun 20 Sept 2026
  assert.equal(dayKey(weekStart(sunday)), "2026-09-14", "the Monday six days earlier");

  const monday = new Date(2026, 8, 14);
  assert.equal(dayKey(weekStart(monday)), "2026-09-14", "a Monday is its own week start");

  const thursday = new Date(2026, 8, 17);
  assert.equal(dayKey(weekStart(thursday)), "2026-09-14");
});

test("weekStart lands on local midnight and does not mutate its argument", () => {
  const afternoon = new Date(2026, 8, 17, 15, 42, 9, 500);
  const start = weekStart(afternoon);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(start.getSeconds(), 0);
  assert.equal(start.getMilliseconds(), 0);
  assert.equal(afternoon.getDate(), 17, "the caller's date is untouched");
});

test("weekStart crosses a month and a year boundary correctly", () => {
  assert.equal(dayKey(weekStart(new Date(2026, 0, 3))), "2025-12-29", "Sat 3 Jan 2026");
  assert.equal(dayKey(weekStart(new Date(2026, 2, 1))), "2026-02-23", "Sun 1 Mar 2026");
});

test("dayKey pads months and days, so keys sort as text", () => {
  assert.equal(dayKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(dayKey(new Date(2026, 11, 31)), "2026-12-31");
});

test("the four review questions match the four priorities", () => {
  const reviewed = REVIEW_QUESTIONS.map((q) => q.priority).sort();
  const priorities = PRIORITIES.map((p) => p.id).sort();
  assert.deepEqual(reviewed, priorities);
});

test("review keys are unique and stable-looking", () => {
  const keys = REVIEW_QUESTIONS.map((q) => q.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.match(k, /^[a-z0-9]+$/, "a stored key with no punctuation to churn");
});

test("every block names a priority the board recognises", () => {
  const known = new Set([...PRIORITIES.map((p) => p.id), "FLEX", "RESET"]);
  for (const day of WEEK) {
    for (const b of day.blocks) {
      assert.ok(known.has(b.priority), `${b.id} claims unknown priority ${b.priority}`);
    }
  }
});

test("the parking zone names what is refused, not just that something is", () => {
  assert.ok(NOT_NOW.items.includes("FounderOS"));
  assert.equal(NOT_NOW.items.length, 5);
});
