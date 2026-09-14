// ============================================================
// TASK BUCKETS — where an open task belongs on a screen
//
// A task with NO due date is still a task. That sounds obvious; it was not
// what the code did. Staff Hub sorted open tasks into today / thisWeek /
// overdue, every one of which required a dueDate, and the card rendered
// `thisWeek + today`. The founder's dashboard did the same thing in its own
// words: `if (!t.dueDate) return false`.
//
// So assigning someone a task without a deadline created it, returned 201,
// showed "task created" — and then it was invisible to the founder AND to the
// person it was assigned to. The only trace was a count: Staff Hub's `total`
// and the dashboard's "13 active" both included tasks that no list would show.
//
// The rule this module encodes: an open task always has a home. Undated ones
// sort last, because a deadline is information and its absence should not
// outrank one — but "last" is not "nowhere".
// ============================================================

export interface BucketableTask {
  status: string;
  dueDate?: Date | string | null;
  completedAt?: Date | string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isOpen(task: BucketableTask): boolean {
  return task.status !== "DONE";
}

/** Milliseconds, or null when the task carries no deadline. */
export function dueMs(task: BucketableTask): number | null {
  if (!task.dueDate) return null;
  const t = new Date(task.dueDate).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Sort key for "what should this person look at next": undated tasks sort
 * after every dated one, without being dropped.
 */
export function dueRank(task: BucketableTask): number {
  return dueMs(task) ?? Number.POSITIVE_INFINITY;
}

export interface StaffTaskBuckets<T> {
  today: T[];
  thisWeek: T[];
  overdue: T[];
  /** Open, assigned, and carrying no deadline. Previously homeless. */
  undated: T[];
  completed: T[];
  total: number;
}

export function bucketStaffTasks<T extends BucketableTask>(
  tasks: T[],
  now: number = Date.now(),
): StaffTaskBuckets<T> {
  const open = tasks.filter(isOpen);
  const dated = (within: number) =>
    open.filter((t) => {
      const d = dueMs(t);
      return d !== null && d <= now + within;
    });
  return {
    today: dated(DAY_MS),
    thisWeek: dated(7 * DAY_MS),
    overdue: open.filter((t) => {
      const d = dueMs(t);
      return d !== null && d < now;
    }),
    undated: open.filter((t) => dueMs(t) === null),
    completed: tasks.filter((t) => t.status === "DONE"),
    total: tasks.length,
  };
}

/**
 * Everything the assignee should see on their dashboard now: overdue, due
 * today, and anything open without a deadline. Excludes work that is genuinely
 * scheduled for later, which is the one thing that should wait.
 */
export function isOnMyDay(task: BucketableTask, todayEnd: number): boolean {
  if (!isOpen(task)) return false;
  const d = dueMs(task);
  return d === null || d <= todayEnd;
}

/**
 * Open work scheduled after today — the part `isOnMyDay` deliberately
 * leaves out.
 *
 * Leaving it out of "today" is right. Leaving it out of the dashboard
 * altogether was not: the founder assigned both interns a montage due in two
 * days, the dashboard only listed today's and overdue work, and the interns
 * saw "No tasks due today" with nothing to tell them work was waiting. A task
 * someone has been given must be visible to them from the day it is given.
 */
export function isUpcoming(task: BucketableTask, todayEnd: number): boolean {
  if (!isOpen(task)) return false;
  const d = dueMs(task);
  return d !== null && d > todayEnd;
}

export interface MyTaskGroups<T> {
  overdue: T[];
  today: T[];
  upcoming: T[];
  undated: T[];
  done: T[];
}

/**
 * Every task a person holds, each in exactly one group — the Tasks page.
 *
 * Unlike `bucketStaffTasks`, whose buckets overlap (today is inside thisWeek),
 * these partition: nothing is shown twice and nothing is dropped. The day is
 * passed in as [todayStart, todayEnd] so the caller decides whose "today" it
 * is — the browser's, for the person looking at the page.
 */
export function groupMyTasks<T extends BucketableTask>(
  tasks: T[],
  todayStart: number,
  todayEnd: number,
): MyTaskGroups<T> {
  const groups: MyTaskGroups<T> = { overdue: [], today: [], upcoming: [], undated: [], done: [] };
  for (const t of tasks) {
    if (!isOpen(t)) { groups.done.push(t); continue; }
    const d = dueMs(t);
    if (d === null) groups.undated.push(t);
    else if (d < todayStart) groups.overdue.push(t);
    else if (d <= todayEnd) groups.today.push(t);
    else groups.upcoming.push(t);
  }
  const byDue = (a: T, b: T) => dueRank(a) - dueRank(b);
  groups.overdue.sort(byDue);
  groups.today.sort(byDue);
  groups.upcoming.sort(byDue);
  // Most recently finished first; the rest is history.
  groups.done.sort((a, b) =>
    (b.completedAt ? new Date(b.completedAt).getTime() : 0) -
    (a.completedAt ? new Date(a.completedAt).getTime() : 0));
  return groups;
}
