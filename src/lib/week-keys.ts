// ============================================================
// WEEK AND DAY KEYS — pure date helpers, no content
//
// Split out of founder-playbook.ts so client components can key a week
// without importing the playbook itself. See that file's SERVER-ONLY note.
// ============================================================

/**
 * Monday of the week containing `date`, at local midnight — the key a
 * weekly review is stored under.
 *
 * Monday, not Sunday, because his week runs Monday to Sunday: the review
 * he writes on Sunday belongs to the week that has just happened, not to
 * the one starting that evening.
 */
export function weekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  const backToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - backToMonday);
  return d;
}

/** "2026-09-20" in local time — how a day's completions are keyed. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

