// ============================================================
// THE FOUNDER'S WEEKLY OPERATING SYSTEM
//
// Kelvin's own playbook, from "Kelvin OS 2026 — Weekly Guide": four
// priorities, one rule, seven days. It lived in a downloaded HTML file,
// which means it was read once and then competed with everything else for
// attention. Here it is the thing the OS opens on.
//
// WHY THE CONTENT IS CODE AND NOT A TABLE
// This is a constitution, not a to-do list. It changes when the founder
// decides his year has changed — deliberately, in a commit, with a diff —
// not incidentally because a row got edited at 1am. What IS data is what
// he actually did: which blocks he completed, and what he answered on
// Sunday. Those live in the database; this file is what they are measured
// against.
//
// PRIVACY
// It names his Master's, ResearchBrainie and Fiestivo — his own ventures,
// not D1Z's. The API and the nav entry are FOUNDER-only, and no other role
// can reach any of it. See the route for the enforcement.
//
// Pure and DB-free so the route, the UI and the tests share one answer to
// "what is today?".
// ============================================================

/** The four things that get his time this year. Nothing else does. */
export type Priority = "D1Z" | "RESEARCHBRAINIE" | "FIESTIVO" | "MASTERS" | "FLEX" | "RESET";

export interface PriorityMeta {
  id: Priority;
  label: string;
  /** What "done" means here — his own second column, not the obvious one. */
  goal: string;
}

export const PRIORITIES: PriorityMeta[] = [
  { id: "D1Z", label: "D1Z", goal: "Build the machine" },
  { id: "RESEARCHBRAINIE", label: "ResearchBrainie", goal: "Get users" },
  { id: "FIESTIVO", label: "Fiestivo", goal: "Finish and launch" },
  { id: "MASTERS", label: "Master's", goal: "Read, understand, write" },
];

export const THE_ONE_RULE = {
  headline: "No new major project. No FounderOS. No new SaaS. No major side venture.",
  body: "Your job right now is to compound what you've already built.",
};

/**
 * The question each venture is actually scored on.
 *
 * The first is the one that feels like work; the second is the one that is
 * work. Kept as a pair because the contrast is the whole point.
 */
export const REDEFINITIONS: Array<{ priority: Priority; instead: string; ask: string }> = [
  { priority: "D1Z", instead: "How many hours did I work?", ask: "What did I remove from Kelvin's workload?" },
  { priority: "RESEARCHBRAINIE", instead: "How many features did I build?", ask: "How many real people used it?" },
  { priority: "FIESTIVO", instead: "How much code did I write?", ask: "Can a real organiser run a real event through it?" },
  { priority: "MASTERS", instead: "How many pages did I read?", ask: "Can I explain and critique what I read?" },
];

export const MONTHLY_TARGETS: Array<{ priority: Priority; targets: string[] }> = [
  {
    priority: "D1Z",
    targets: [
      "1–2 operational systems improved per month",
      "3–5 meaningful business-development actions per week",
      "Increasing delegation every month",
    ],
  },
  {
    priority: "RESEARCHBRAINIE",
    targets: [
      "Month 1: 25–50 real users",
      "Then: 100 → active → paying users",
      "Real people using it — not just link clicks",
    ],
  },
  {
    priority: "FIESTIVO",
    targets: ["Immediate: LAUNCH", "Then: first real organiser", "Then: first real event", "Then: second and third events"],
  },
  {
    priority: "MASTERS",
    targets: [
      "Complete assigned readings",
      "Stay ahead of deadlines",
      "Build research notes steadily",
      "Develop critical-analysis ability",
    ],
  },
];

/** The parking zone. Ideas are welcome; they are just not welcome this year. */
export const NOT_NOW = {
  items: ["FounderOS", "New SaaS", "New agency", "New channel", "New platform"],
  note:
    "You're going to have ideas. Lots of them. Don't fight that — you're an ideas person. Just give them somewhere to go without giving them your time. For the next six months, your discipline is not finding the next opportunity. It's seeing what happens when you stay with these four.",
};

export interface Block {
  /** Stable across edits to the copy — it is what a completion is stored against. */
  id: string;
  /** Morning / Main block / Evening — when in the day this sits. */
  slot: string;
  title: string;
  priority: Priority;
  /** "60–90 min". Absent where the founder deliberately left it open. */
  duration?: string;
  /** One line of intent, in his own words where he wrote one. */
  intent?: string;
  points: string[];
  /** The line he wrote to keep himself honest inside this block. */
  note?: string;
  /** A worked example, where he gave one. */
  example?: string;
}

export interface DayPlan {
  /** 0 = Sunday, matching Date.getDay(). */
  weekday: number;
  name: string;
  /** "CEO + Academic", "Fiestivo Build Day" — the day's character. */
  theme: string;
  priority: Priority;
  blocks: Block[];
  /** The single question that day is answered by. */
  question?: string;
  /** The day's total time budget, where the founder set one. */
  budget?: string;
  /** Anything that is not a block — Saturday's "Stop.", Sunday's rest. */
  closing?: { title: string; body: string };
}

const MASTERS_MORNING = (id: string, title: string, intent: string): Block => ({
  id,
  slot: "Morning",
  title,
  priority: "MASTERS",
  duration: "60–90 min",
  intent,
  points: [],
});

export const WEEK: DayPlan[] = [
  {
    weekday: 1,
    name: "Monday",
    theme: "CEO + Academic",
    priority: "D1Z",
    question: "What does D1Z need from me this week?",
    blocks: [
      {
        id: "mon-masters",
        slot: "Morning",
        title: "Master's — Deep Reading",
        priority: "MASTERS",
        duration: "60–90 min",
        intent: "Start the week academically. One paper. One focus.",
        points: [
          "Assigned reading or one difficult paper",
          "Use ResearchBrainie to break it down",
          "Structured notes: argument, theory, method, findings, strengths, weaknesses, contribution",
        ],
        note: "One paper deeply understood is better than five papers skimmed.",
      },
      {
        id: "mon-d1z",
        slot: "Late morning / Afternoon",
        title: "D1Z — CEO Block",
        priority: "D1Z",
        duration: "2–3 hrs",
        intent: "This is your CEO block. Review the business.",
        points: [
          "Current jobs, leads, proposals, outstanding payments",
          "Upcoming productions, cash position, team",
          "Production issues, client relationships, opportunities",
        ],
        note: "Then choose the three most important D1Z outcomes for the week.",
        example: "Send 3 proposals / Close outstanding payment / Implement production budget system",
      },
      {
        id: "mon-masters-pm",
        slot: "Evening",
        title: "Master's — Light Review",
        priority: "MASTERS",
        duration: "30–45 min",
        intent: "Review your notes or read something lighter. Consolidate, don't cram.",
        points: [],
      },
    ],
  },
  {
    weekday: 2,
    name: "Tuesday",
    theme: "Fiestivo Build Day",
    priority: "FIESTIVO",
    blocks: [
      MASTERS_MORNING("tue-masters", "Master's — Academic Reading", "Continue your reading. Keep the academic thread going."),
      {
        id: "tue-fiestivo",
        slot: "Main block",
        title: "Fiestivo — Finish It",
        priority: "FIESTIVO",
        duration: "2–3 hrs",
        intent: "Only work on things that prevent launch. Use three categories:",
        points: ["P0 — Must work before launch", "P1 — Important but can launch without", "V2 — Later"],
        note:
          "If it doesn't prevent someone from creating an event and running that event, it probably isn't P0.",
      },
      {
        id: "tue-fiestivo-pm",
        slot: "Evening",
        title: "Fiestivo — Use It as a User",
        priority: "FIESTIVO",
        duration: "30–45 min",
        intent: "Don't code. Walk the full flow:",
        points: [
          "Organiser → Create event → Publish",
          "Attendee → Register → Payment → Ticket → QR → Scan",
          "Dashboard — does everything make sense?",
        ],
        note: "Document anything that breaks.",
      },
    ],
  },
  {
    weekday: 3,
    name: "Wednesday",
    theme: "D1Z Systems Day",
    priority: "D1Z",
    question: "What is currently dependent on Kelvin that shouldn't be?",
    blocks: [
      MASTERS_MORNING("wed-masters", "Master's — Serious Reading", "Make this your most focused academic session of the week. Go deep."),
      {
        id: "wed-d1z",
        slot: "Main block",
        title: "D1Z — Build the Systems",
        priority: "D1Z",
        duration: "2–3 hrs",
        intent: "Every Wednesday, ask one question. Then build or delegate the answer.",
        points: [
          "Production budgeting",
          "Vendor management",
          "Client onboarding",
          "Equipment checklists",
          "Production manager reporting",
          "Payment approvals / proposal preparation",
          "Post-production workflow",
        ],
      },
      {
        id: "wed-masters-pm",
        slot: "Evening",
        title: "Master's — Synthesis",
        priority: "MASTERS",
        duration: "30 min",
        intent: "Write a short summary of what you learned today. Consolidate the week's reading so far.",
        points: [],
      },
    ],
  },
  {
    weekday: 4,
    name: "Thursday",
    theme: "ResearchBrainie Growth Day",
    priority: "RESEARCHBRAINIE",
    // Four half-hours, not one open-ended afternoon. The budget is the
    // point of the day's structure, so it is stated rather than implied
    // by four blocks that happen to say 30 min each.
    budget: "2 hrs total — 4 × 30 min",
    question: "Did I put ResearchBrainie in front of a real person today?",
    blocks: [
      MASTERS_MORNING(
        "thu-masters",
        "Master's — Use ResearchBrainie",
        "Use ResearchBrainie naturally as part of your study today. You are the user.",
      ),
      {
        id: "thu-rb-outreach",
        slot: "Main block · 30 min",
        title: "ResearchBrainie — Outreach",
        priority: "RESEARCHBRAINIE",
        duration: "30 min",
        points: [
          "Master's students, PhD students, researchers, postgraduate communities",
          "Academic WhatsApp groups, LinkedIn contacts",
          "Target: 5–10 genuine conversations per week. Not spam.",
        ],
      },
      {
        id: "thu-rb-content",
        slot: "Main block · 30 min",
        title: "ResearchBrainie — Content",
        priority: "RESEARCHBRAINIE",
        duration: "30 min",
        points: [
          "One piece demonstrating the product — a real paper breakdown, a study tip, an honest take on AI in academia",
        ],
      },
      {
        id: "thu-rb-product",
        slot: "Main block · 30 min",
        title: "ResearchBrainie — Product / Onboarding",
        priority: "RESEARCHBRAINIE",
        duration: "30 min",
        intent: "Fix only what affects:",
        points: ["Signup", "First use", "Uploading a paper", "Getting useful results", "Returning"],
      },
      {
        id: "thu-rb-metrics",
        slot: "Main block · 30 min",
        title: "ResearchBrainie — Metrics",
        priority: "RESEARCHBRAINIE",
        duration: "30 min",
        points: [
          "Visitors, signups, papers uploaded, active users, returning users, feedback, paid conversions",
        ],
        note: "Then stop. Do not redesign the entire website.",
      },
    ],
  },
  {
    weekday: 5,
    name: "Friday",
    theme: "Fiestivo → Launch Prep",
    priority: "FIESTIVO",
    question: "What exactly is preventing me from putting Fiestivo in front of a real organiser?",
    blocks: [
      MASTERS_MORNING("fri-masters", "Master's — Reading or Writing", "Academic work. Keep the thread going into the weekend."),
      {
        id: "fri-fiestivo",
        slot: "Main block",
        title: "Fiestivo — Development → Testing",
        priority: "FIESTIVO",
        duration: "2–3 hrs",
        intent: "Continue the P0 list. But shift from building toward launch readiness:",
        points: [
          "Test payment, emails, QR codes",
          "Test organiser workflow end-to-end",
          "Test attendee workflow end-to-end",
          "Test mobile experience, permissions, edge cases",
        ],
        note: "If the answer to today's question is unclear, you've allowed the scope to expand.",
      },
    ],
  },
  {
    weekday: 6,
    name: "Saturday",
    theme: "Strategic / Catch-up",
    priority: "FLEX",
    blocks: [
      {
        id: "sat-a",
        slot: "Option A",
        title: "D1Z — Strategic",
        priority: "D1Z",
        duration: "2–3 hrs",
        intent: "Use when D1Z has something genuinely important:",
        points: [
          "Major proposal or client pitch",
          "Business strategy or equipment planning",
          "Team training, financial review",
          "Major production preparation",
        ],
      },
      {
        id: "sat-b",
        slot: "Option B",
        title: "Fiestivo — if approaching launch",
        priority: "FIESTIVO",
        intent: "If you're close, use Saturday to finish something critical on the P0 list.",
        points: [],
      },
      {
        id: "sat-c",
        slot: "Option C",
        title: "Master's — if a deadline is approaching",
        priority: "MASTERS",
        intent: "Saturday becomes your longer academic writing session when assignments are due.",
        points: [],
      },
    ],
    closing: {
      title: "Then stop.",
      body:
        "You're trying to build businesses and complete a Master's. You cannot make every day a productivity contest. You need space.",
    },
  },
  {
    weekday: 0,
    name: "Sunday",
    theme: "Reset, not grind",
    priority: "RESET",
    blocks: [],
    closing: {
      title: "Protect Sunday",
      body:
        "This is the one day you are not building. Rest, recover, reset. The compounding only works if you aren't running on empty.",
    },
  },
];

/**
 * Sunday's four questions — the weekly review.
 *
 * `key` is what the answer is stored under and must not change; the text
 * may be reworded.
 */
export const REVIEW_QUESTIONS: Array<{ key: string; priority: Priority; question: string }> = [
  { key: "d1z", priority: "D1Z", question: "Did I make the company less dependent on me?" },
  { key: "researchbrainie", priority: "RESEARCHBRAINIE", question: "Did I put it in front of real people?" },
  { key: "fiestivo", priority: "FIESTIVO", question: "Did I move it closer to a real launch or event?" },
  { key: "masters", priority: "MASTERS", question: "Did I genuinely understand something this week?" },
];

export const SUNDAY_GUARD =
  "No coding. No major development. No new strategy rabbit holes. Then plan the following week.";

/** The plan for a given weekday (0 = Sunday). */
export function planForWeekday(weekday: number): DayPlan {
  const found = WEEK.find((d) => d.weekday === weekday);
  if (!found) throw new Error(`No plan for weekday ${weekday}`);
  return found;
}

/** The plan for a given date, in the reader's own timezone. */
export function planForDate(date: Date): DayPlan {
  return planForWeekday(date.getDay());
}

/** Every block id in the week. The set a completion may name. */
export function allBlockIds(): string[] {
  return WEEK.flatMap((d) => d.blocks.map((b) => b.id));
}

/** Whether `id` is a block this playbook actually contains. */
export function isBlockId(id: unknown): id is string {
  return typeof id === "string" && allBlockIds().includes(id);
}

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

/** The week in reading order, Monday first, Sunday last. */
export function weekInOrder(): DayPlan[] {
  return [...WEEK].sort((a, b) => (a.weekday === 0 ? 7 : a.weekday) - (b.weekday === 0 ? 7 : b.weekday));
}
