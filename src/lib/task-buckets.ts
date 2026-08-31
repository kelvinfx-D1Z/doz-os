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
