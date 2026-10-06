// ============================================================
// NIGERIAN ENERGY SECTOR NEWS — PARSING AND FILTERING
//
// D1Z's clients are energy companies and the MDAs around them. Knowing what
// happened in the sector this morning is the difference between walking into
// a pitch informed and walking in blind, so this is on everyone's dashboard,
// not just the founder's.
//
// WHERE THE NEWS COMES FROM
// Real feeds from named Nigerian outlets, stored with their source and a
// link back. Nothing here is written by an AI, and nothing is summarised
// into something the outlet did not say: a headline is carried verbatim and
// a standfirst is the feed's own description with its markup stripped.
// Invented news would be worse than no news at all — it would be acted on.
//
// FEED CONTENT IS UNTRUSTED
// It is third-party text that arrives over the network. Treated strictly as
// data: HTML is stripped rather than rendered, lengths are capped, and only
// http(s) links survive. Nothing in a feed is ever an instruction to this
// system or to anyone reading it.
//
// Pure and DB-free, so the route and the tests share one parser.
// ============================================================

export interface FeedSource {
  /** Shown to the reader, so they know who reported it. */
  name: string;
  url: string;
  /**
   * True when the feed is already an energy desk — every item counts.
   * False for a general business feed, where items must mention the sector
   * to be carried. Without this, a paper's politics and sport would arrive
   * on everyone's dashboard as "industry news".
   */
  energyOnly: boolean;
}

/**
 * The feeds, each checked to return items before being added here.
 *
 * Three energy desks and four general business papers. The general ones earn
 * their place because Nigerian energy policy is often broken by a business
 * desk rather than an energy one — but every item from them is filtered.
 */
export const FEEDS: FeedSource[] = [
  { name: "Nairametrics", url: "https://nairametrics.com/category/energy/feed/", energyOnly: true },
  // NOT an energy desk, despite the URL: punchng.com/topics/energy/feed/
  // serves the paper's whole front page — pensions, air crashes, politics.
  // Checked against the live feed, whose channel title is plainly
  // "Punch Newspapers - Latest News". It is filtered like the other papers.
  { name: "Punch", url: "https://punchng.com/topics/energy/feed/", energyOnly: false },
  { name: "Vanguard", url: "https://www.vanguardngr.com/category/energy/feed/", energyOnly: true },
  { name: "BusinessDay", url: "https://businessday.ng/feed/", energyOnly: false },
  { name: "ThisDay", url: "https://www.thisdaylive.com/index.php/category/business/feed/", energyOnly: false },
  { name: "Premium Times", url: "https://www.premiumtimesng.com/category/business/feed/", energyOnly: false },
  { name: "Daily Trust", url: "https://dailytrust.com/feed/", energyOnly: false },
];

/**
 * Words that make an item energy-sector news.
 *
 * Deliberately specific. "Power" alone would catch every political story in
 * the country, and "gas" alone catches tear gas; the pairs and the
 * institution names below are what actually separate the sector from the
 * rest of the paper.
 */
const ENERGY_TERMS = [
  "oil", "lng", "lpg", "petrol", "diesel", "kerosene", "crude", "refinery",
  "refineries", "upstream", "downstream", "midstream", "pipeline", "oml", "opl",
  "electricity", "power sector", "megawatt", "grid", "discos", "disco", "gencos",
  // "renewable" alone matched "a four-year non-renewable tenure" and put an
  // ECOWAS judicial appointment on every dashboard as energy news.
  "genco", "transmission", "tariff", "solar", "renewable energy", "renewables",
  "energy", "nnpc",
  "nnpcl", "nuprc", "nmdpra", "nerc", "tcn", "nbet", "dangote refinery",
  "petroleum", "opec", "subsidy", "fuel", "offshore", "rig", "flaring",
  "seplat", "oando", "shell", "chevron", "totalenergies", "exxon", "aiteo",
  "petan", "nog energy", "electrification", "mini-grid", "off-grid",
];

/**
 * Terms that are energy news except in a few well-known phrases where they
 * are not.
 *
 * These must NEVER also appear in ENERGY_TERMS. "gas" did, once, and the
 * plain list matched it before this rule could veto it — so "Police fire
 * tear gas at protesters" arrived on every intern's dashboard as industry
 * news. `AMBIGUOUS_TERMS` is the only place either word is matched, and a
 * test below asserts the two lists never overlap again.
 */
const AMBIGUOUS_TERMS: Array<{ term: string; notWhen: string[]; newsOnly?: boolean }> = [
  { term: "gas", notWhen: ["tear gas"] },
  // Political "power": power tussle, balance of power, power of incumbency.
  // Never counted for an EVENT — see isEnergyRelevant.
  { term: "power", newsOnly: true, notWhen: ["power tussle", "power play", "power of incumbency", "balance of power", "power grab"] },
];

/**
 * Phrases removed from the text before any term is matched.
 *
 * "non-oil" contains "oil", and a hyphen counts as a word boundary, so
 * "NPA to end non-oil export bottlenecks" read as an oil story and reached
 * every dashboard. Removing the phrase first is exact: a story about "the
 * oil and non-oil sectors" still matches on its remaining "oil".
 */
const DECOY_PHRASES = ["non-oil", "non oil", "non-renewable"];

/** Exported only so a test can assert the two lists stay disjoint. */
export const TERM_LISTS = { ENERGY_TERMS, AMBIGUOUS_TERMS };

/** Strip tags and decode the handful of entities feeds actually emit. */
export function stripHtml(input: string): string {
  const noTags = input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;|&rsquo;/gi, "’")
    .replace(/&#8216;|&lsquo;/gi, "‘")
    .replace(/&#8220;|&ldquo;/gi, "“")
    .replace(/&#8221;|&rdquo;/gi, "”")
    .replace(/&#8211;|&ndash;/gi, "–")
    .replace(/&#8212;|&mdash;/gi, "—")
    .replace(/&amp;/g, "&"); // last, so &amp;lt; does not become <
}

/**
 * Whether a headline and standfirst are about the energy sector.
 *
 * Matched on word boundaries: "oil" must not fire on "toil", and "rig" must
 * not fire on "rigging" — which, in Nigerian political coverage, it would do
 * constantly.
 */
export function isEnergyRelevant(text: string, mode: "news" | "event" = "news"): boolean {
  let haystack = ` ${text.toLowerCase()} `;
  for (const phrase of DECOY_PHRASES) haystack = haystack.split(phrase).join(" ");
  for (const { term, notWhen, newsOnly } of AMBIGUOUS_TERMS) {
    // "power" earns its place in a newspaper — "power sector debt", "20 hours
    // of power daily". In an event title it is overwhelmingly religious or
    // motivational: a live search returned "Night Of Power 2026 (The Mighty
    // Hand of God)" and "The girl I am: The power I possess". So an event
    // has to say energy, oil, gas or grid, not merely "power".
    if (newsOnly && mode === "event") continue;
    if (!wordIn(haystack, term)) continue;
    if (!notWhen.some((phrase) => haystack.includes(phrase))) return true;
  }
  return ENERGY_TERMS.some((term) => wordIn(haystack, term));
}

/** Whether `term` appears in `text` as a whole word. Exported for events. */
export function containsTerm(text: string, term: string): boolean {
  return wordIn(` ${text.toLowerCase()} `, term);
}

function wordIn(haystackLowerPadded: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(haystackLowerPadded);
}

export interface ParsedItem {
  title: string;
  url: string;
  summary: string | null;
  publishedAt: Date | null;
}

/** One `<tag>…</tag>` from a fragment, CDATA unwrapped. Null when absent. */
function tagText(fragment: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(fragment);
  if (!m) return null;
  const raw = m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  return raw;
}

/**
 * Only http(s) URLs survive, and only as absolute links.
 *
 * A feed is third-party text: a `javascript:` or `data:` href in it would
 * become a link rendered to every member of staff.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = stripHtml(raw).trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString().slice(0, 600);
  } catch {
    return null;
  }
}

/** A date a feed actually published, or null — never today as a guess. */
function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const t = new Date(stripHtml(raw)).getTime();
  if (!Number.isFinite(t)) return null;
  // A feed with a clock far in the future would otherwise pin itself to the
  // top of the list forever.
  if (t > Date.now() + 2 * 86_400_000) return null;
  return new Date(t);
}

export const MAX_TITLE = 300;
export const MAX_SUMMARY = 500;

/**
 * Parse an RSS 2.0 or Atom document into items.
 *
 * Deliberately a regex reader rather than an XML library: the input is a
 * handful of known feeds, the fields wanted are four, and a parser
 * dependency pulled in for this would be a larger surface than the problem.
 * Anything it cannot read is skipped, never guessed at.
 */
export function parseFeed(xml: string): ParsedItem[] {
  if (typeof xml !== "string" || !xml.trim()) return [];
  const blocks = [
    ...(xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) ?? []),
  ];

  const items: ParsedItem[] = [];
  for (const block of blocks) {
    const title = stripHtml(tagText(block, "title") ?? "").slice(0, MAX_TITLE);
    // Atom puts the link in an attribute; RSS in the element's text.
    const atomHref = /<link[^>]*\shref=["']([^"']+)["']/i.exec(block)?.[1] ?? null;
    const url = safeHttpUrl(tagText(block, "link") ?? atomHref);
    if (!title || !url) continue; // a story with no headline or no link is not one

    const rawSummary = tagText(block, "description") ?? tagText(block, "summary") ?? "";
    const summary = stripHtml(rawSummary)
      // WordPress feeds append "The post … appeared first on …" to every item.
      .replace(/The post .* appeared first on .*$/i, "")
      // Punch appends "Read More: <url>" to every standfirst.
      .replace(/\s*Read More:\s*https?:\/\/\S+\s*$/i, "")
      .trim()
      .slice(0, MAX_SUMMARY);

    items.push({
      title,
      url,
      summary: summary || null,
      publishedAt: parseDate(tagText(block, "pubDate") ?? tagText(block, "published") ?? tagText(block, "updated")),
    });
  }
  return items;
}

/**
 * The key two stories are the same story under.
 *
 * Papers re-publish the same URL with tracking parameters and with or
 * without a trailing slash; without this the same headline arrives twice.
 */
export function dedupeKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    u.protocol = "https:";
    const host = u.host.replace(/^www\./i, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${path}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export interface SourcedItem extends ParsedItem {
  source: string;
}

/**
 * Items from one feed, filtered and deduped against each other.
 *
 * `now` is passed in so the test suite is not time-dependent.
 */
export function selectItems(
  items: ParsedItem[],
  source: FeedSource,
  opts: { maxAgeDays?: number; now?: number } = {},
): SourcedItem[] {
  const maxAgeDays = opts.maxAgeDays ?? 45;
  const now = opts.now ?? Date.now();
  const seen = new Set<string>();
  const out: SourcedItem[] = [];

  for (const item of items) {
    if (!source.energyOnly && !isEnergyRelevant(`${item.title} ${item.summary ?? ""}`)) continue;
    // An undated item is kept: some feeds omit pubDate, and dropping it
    // would silently lose a whole outlet. Only a date we HAVE and that is
    // old excludes a story.
    if (item.publishedAt && now - item.publishedAt.getTime() > maxAgeDays * 86_400_000) continue;
    const key = dedupeKey(item.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, source: source.name });
  }
  return out;
}

/** Newest first; undated items sort last rather than being dropped. */
export function byRecency(a: { publishedAt: Date | null }, b: { publishedAt: Date | null }): number {
  const ta = a.publishedAt ? a.publishedAt.getTime() : -Infinity;
  const tb = b.publishedAt ? b.publishedAt.getTime() : -Infinity;
  return tb - ta;
}
