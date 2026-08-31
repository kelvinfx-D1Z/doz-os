import test from "node:test";
import assert from "node:assert/strict";
import { bucketStaffTasks, isOnMyDay, dueRank, dueMs, isOpen } from "./task-buckets.ts";

const NOW = new Date("2026-08-31T09:00:00.000Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

const task = (over: Partial<{ id: string; status: string; dueDate: string | null; completedAt: string | null }> = {}) => ({
  id: "t",
  status: "TODO",
  dueDate: null as string | null,
  completedAt: null as string | null,
  ...over,
});

test("THE BUG: an open task with no due date lands in a bucket, not nowhere", () => {
  // Assigning a task without a deadline created it, said "task created", and
  // then showed nothing — because today/thisWeek/overdue all required a date.
  const undated = task({ id: "no-deadline" });
  const b = bucketStaffTasks([undated], NOW);
  assert.deepEqual(b.undated.map((t) => t.id), ["no-deadline"]);
  assert.equal(b.total, 1);

  const homes = [b.today, b.thisWeek, b.overdue, b.undated, b.completed]
    .filter((bucket) => bucket.some((t) => t.id === "no-deadline"));
  assert.equal(homes.length, 1, "it belongs to exactly one bucket");
});

test("the staff card's open list is no longer empty for an undated task", () => {
  // The card renders thisWeek + today + undated. Before the fix that was
  // thisWeek + today, so this list came out empty and it said "No tasks yet."
  const b = bucketStaffTasks([task({ id: "a" })], NOW);
  const shown = [...b.thisWeek, ...b.today, ...b.undated];
  assert.equal(shown.length, 1);
});

test("dated tasks still fall where they always did", () => {
  const overdue = task({ id: "overdue", dueDate: new Date(NOW - DAY).toISOString() });
  const today = task({ id: "today", dueDate: new Date(NOW + 2 * 60 * 60 * 1000).toISOString() });
  const week = task({ id: "week", dueDate: new Date(NOW + 4 * DAY).toISOString() });
  const later = task({ id: "later", dueDate: new Date(NOW + 30 * DAY).toISOString() });
  const b = bucketStaffTasks([overdue, today, week, later], NOW);

  assert.deepEqual(b.overdue.map((t) => t.id), ["overdue"]);
  assert.deepEqual(b.today.map((t) => t.id), ["overdue", "today"]);
  assert.deepEqual(b.thisWeek.map((t) => t.id), ["overdue", "today", "week"]);
  assert.deepEqual(b.undated, []);
  assert.equal(b.total, 4);
});

test("a completed task is completed, dated or not", () => {
  const doneUndated = task({ id: "d1", status: "DONE", completedAt: new Date(NOW).toISOString() });
  const doneDated = task({ id: "d2", status: "DONE", dueDate: new Date(NOW - DAY).toISOString() });
  const b = bucketStaffTasks([doneUndated, doneDated], NOW);
  assert.deepEqual(b.completed.map((t) => t.id), ["d1", "d2"]);
  assert.deepEqual(b.undated, [], "done work is not outstanding");
  assert.deepEqual(b.overdue, [], "a finished task is never overdue");
});

test("isOnMyDay shows overdue, due-today and undated — and holds back the merely scheduled", () => {
  const todayEnd = NOW + 15 * 60 * 60 * 1000;
  assert.equal(isOnMyDay(task({ dueDate: new Date(NOW - DAY).toISOString() }), todayEnd), true, "overdue");
  assert.equal(isOnMyDay(task({ dueDate: new Date(NOW + 60_000).toISOString() }), todayEnd), true, "due today");
  assert.equal(isOnMyDay(task({ dueDate: null }), todayEnd), true, "undated — the fix");
  assert.equal(isOnMyDay(task({ dueDate: new Date(NOW + 5 * DAY).toISOString() }), todayEnd), false, "next week can wait");
  assert.equal(isOnMyDay(task({ status: "DONE" }), todayEnd), false, "already done");
});

test("undated tasks sort after every dated one without being dropped", () => {
  const rows = [task({ id: "none" }), task({ id: "soon", dueDate: new Date(NOW + DAY).toISOString() })];
  const order = rows.slice().sort((a, b) => dueRank(a) - dueRank(b)).map((t) => t.id);
  assert.deepEqual(order, ["soon", "none"]);
  assert.equal(dueRank(rows[0]), Number.POSITIVE_INFINITY);
});

test("an unparseable due date is treated as no date, not as 1970", () => {
  // Coercing junk to 0 would make the task read as decades overdue and shove
  // it to the top of everyone's list.
  const junk = task({ id: "junk", dueDate: "not a date" });
  assert.equal(dueMs(junk), null);
  const b = bucketStaffTasks([junk], NOW);
  assert.deepEqual(b.undated.map((t) => t.id), ["junk"]);
  assert.deepEqual(b.overdue, []);
});

test("isOpen treats only DONE as closed", () => {
  assert.equal(isOpen(task({ status: "TODO" })), true);
  assert.equal(isOpen(task({ status: "IN_PROGRESS" })), true);
  assert.equal(isOpen(task({ status: "DONE" })), false);
});

test("no tasks is an empty set, not a crash", () => {
  const b = bucketStaffTasks([], NOW);
  assert.equal(b.total, 0);
  assert.deepEqual(b.undated, []);
  assert.deepEqual(b.completed, []);
});
