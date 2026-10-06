// ============================================================
// FINDING ENERGY EVENTS ON THE OPEN WEB
//
// The founder's ask: "scour all over the internet and show the events; they
// do not have to be my events, just every other event in this industry."
//
// HOW, WITHOUT INVENTING ANYTHING
// Event pages publish machine-readable listings — schema.org Event records
// embedded as JSON-LD, written by the organiser. That is the whole source:
// a name, a start date and a link, as the organiser themselves published
// them. Nothing is scraped out of prose, no date is inferred, and nothing
// is written by an AI. An event whose listing carries no start date is
// dropped rather than guessed at, because a guessed date sends somebody to
// an empty hall.
//
// WHAT THIS IS NOT
// Not a general crawler. It reads a fixed list of search pages whose
// robots.txt permits it, and it reads only their structured data. Sites
// that refuse automated access (10times returns 403) are left alone, and
// sites that render their listings in the browser (conferenceindex) have
// nothing to read server-side.
//
// EVERYTHING HERE IS UNTRUSTED
// It is third-party text fetched over the network: stripped of markup,
// length-capped, http(s) links only, and treated as data — never as an
// instruction.
// ============================================================

import { stripHtml, safeHttpUrl, containsTerm, TERM_LISTS } from "./energy-news.ts";

/**
 * Terms that mean the industry even on their own — everything except the
 * word "energy" itself.
 *
 * "Energy" in an event DESCRIPTION is usually about atmosphere: a live
 * search returned "LAVISH FRIDAY", "Silk & Soul" and "Friday Tribal Jungle"
 * because their listings promise a high-energy night. So a description has
 * to say oil, gas, grid, solar, refinery — something that cannot be said of
 * a party. A title may still say "energy", because "Lagos Energy Summit"
 * means what it says.
 */
const HARD_SECTOR_TERMS = TERM_LISTS.ENERGY_TERMS.filter((t) => t !== "energy");

/**
 * Industry words that are something else entirely in an event listing.
 *
 * "Oil" is aromatherapy, anointing oil and cooking oil; a live African
 * search returned an "Aromatherapy Class" and "BEFORE DAWN: GUARD THE OIL".
 * "Upstream" is a psychology workshop called "Swimming Upstream". Each needs
 * a companion below before it counts.
 */
const NEEDS_COMPANY = ["oil", "upstream", "downstream", "midstream"];

/** What has to appear alongside one of the above for it to mean the sector. */
const COMPANIONS = [
  "gas", "crude", "petroleum", "refinery", "refineries", "barrel", "barrels",
  "rig", "drilling", "exploration", "field", "offshore", "pipeline", "energy",
  "industry", "sector", "opec", "nnpc", "nuprc", "licensing", "subsea", "lng",
];

/**
 * Whether a listing is an event in this industry.
 *
 * Three ways in, in order of confidence: a word that can only mean the
 * sector; "oil" (or upstream/downstream) backed by a companion word; or the
 * word "energy" in the TITLE. "Energy" in a description is usually about
 * atmosphere — a live search returned "LAVISH FRIDAY", "Silk & Soul" and
 * "Friday Tribal Jungle", all promising a high-energy night.
 */
export function isEnergyEvent(title: string, summary: string | null): boolean {
  const text = `${title} ${summary ?? ""}`;
  // "gas" lives on the news module's ambiguous list because of "tear gas",
  // but in an event listing it is the sector — "Oil & Gas Week", "Gas Expo".
  // Without this it counted for nothing and real events were dropped.
  if (containsTerm(text, "gas") && !text.toLowerCase().includes("tear gas")) return true;
  const unambiguous = HARD_SECTOR_TERMS.filter((t) => !NEEDS_COMPANY.includes(t));
  if (unambiguous.some((term) => containsTerm(text, term))) return true;
  if (
    NEEDS_COMPANY.some((term) => containsTerm(text, term)) &&
    COMPANIONS.some((c) => containsTerm(text, c))
  ) {
    return true;
  }
  return containsTerm(title, "energy");
}

export interface DiscoverySource {
  /** Where the listing lives. */
  url: string;
  /** Shown to the reader as where this was found. */
  site: string;
  /** Rough geography, for the Nigeria-first filter on the page. */
  region: "Nigeria" | "Africa";
}

/**
 * The searches that are read on each refresh.
 *
 * Nigeria and the nearer African markets only — the founder's own scope:
 * "limit it to Nigeria and a bit of Africa." The American, British, Emirati
 * and online listings were dropped: they were four fifths of what was found
 * and none of it was work D1Z could reach.
 *
 * Eventbrite publishes a schema.org ItemList of Events on its search pages
 * and its robots.txt does not disallow them. Angola, Senegal, Ivory Coast,
 * Uganda and Morocco were each tried and returned nothing, so they are not
 * kept here as fetches that cost time and find no events.
 */
export const DISCOVERY_SOURCES: DiscoverySource[] = [
  { url: "https://www.eventbrite.com/d/nigeria/energy/", site: "Eventbrite", region: "Nigeria" },
  { url: "https://www.eventbrite.com/d/nigeria/oil--gas/", site: "Eventbrite", region: "Nigeria" },
  { url: "https://www.eventbrite.com/d/nigeria/power/", site: "Eventbrite", region: "Nigeria" },
  { url: "https://www.eventbrite.com/d/nigeria/conference/", site: "Eventbrite", region: "Nigeria" },
  { url: "https://www.eventbrite.com/d/south-africa/energy-conference/", site: "Eventbrite", region: "Africa" },
  { url: "https://www.eventbrite.com/d/south-africa/oil--gas/", site: "Eventbrite", region: "Africa" },
  { url: "https://www.eventbrite.com/d/ghana/energy/", site: "Eventbrite", region: "Africa" },
  { url: "https://www.eventbrite.com/d/kenya/energy/", site: "Eventbrite", region: "Africa" },
  { url: "https://www.eventbrite.com/d/tanzania/energy/", site: "Eventbrite", region: "Africa" },
  { url: "https://www.eventbrite.com/d/egypt/energy/", site: "Eventbrite", region: "Africa" },
];

export interface DiscoveredEvent {
  title: string;
  startDate: Date;
  endDate: Date | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  url: string | null;
  summary: string | null;
  site: string;
  region: DiscoverySource["region"];
}

export const MAX_EVENT_TITLE = 300;
export const MAX_EVENT_SUMMARY = 400;

/** Every JSON-LD document embedded in a page, parsed. Unreadable ones are skipped. */
export function extractJsonLd(html: string): unknown[] {
  if (typeof html !== "string") return [];
  const out: unknown[] = [];
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) ?? [];
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      out.push(JSON.parse(body));
    } catch {
      // A malformed block is one site's problem, not the refresh's.
    }
  }
  return out;
}

/**
 * Every schema.org Event anywhere inside a JSON-LD document.
 *
 * Events are rarely at the top level: Eventbrite nests each one inside an
 * ItemList as `itemListElement[].item`, and other sites use `@graph`. So
 * this walks the whole structure rather than assuming a shape.
 */
export function collectEvents(node: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 8 || node === null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((n) => collectEvents(n, depth + 1));

  const obj = node as Record<string, unknown>;
  const found: Record<string, unknown>[] = [];
  const type = obj["@type"];
  const types = Array.isArray(type) ? type.map(String) : [String(type ?? "")];
  // "Event", "BusinessEvent", "EducationEvent", "SocialEvent" — all Event
  // subtypes end in the word.
  if (types.some((t) => /Event$/.test(t)) && typeof obj.name === "string") {
    found.push(obj);
  }
  for (const value of Object.values(obj)) found.push(...collectEvents(value, depth + 1));
  return found;
}

/** A date from a listing, or null. Never today as a stand-in. */
function parseEventDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw.trim());
  return Number.isFinite(d.getTime()) ? d : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = stripHtml(value).trim();
  return clean ? clean.slice(0, max) : null;
}

/** Pull venue, city and country out of schema.org's several location shapes. */
function readLocation(loc: unknown): { venue: string | null; city: string | null; country: string | null } {
  const empty = { venue: null, city: null, country: null };
  if (!loc || typeof loc !== "object") return empty;
  const node = (Array.isArray(loc) ? loc[0] : loc) as Record<string, unknown>;
  if (!node || typeof node !== "object") return empty;

  // A virtual event has a VirtualLocation with a url and no address.
  const type = String(node["@type"] ?? "");
  if (/VirtualLocation/i.test(type)) return { venue: null, city: "Online", country: null };

  const address = node.address;
  if (typeof address === "string") {
    return { venue: text(node.name, 200), city: text(address, 120), country: null };
  }
  const addr = (address ?? {}) as Record<string, unknown>;
  return {
    venue: text(node.name, 200),
    city: text(addr.addressLocality, 120) ?? text(addr.addressRegion, 120),
    country: text(addr.addressCountry, 120) ?? text((addr.addressCountry as Record<string, unknown>)?.name, 120),
  };
}

export interface NormaliseOptions {
  now?: number;
  /** How far ahead a listing may claim to be. Beyond this it is a data error. */
  maxYearsAhead?: number;
}

/**
 * One schema.org Event turned into a row, or null when it does not qualify.
 *
 * The bar: a name, a real start date that has not already passed, and
 * subject matter that is actually this industry. Everything else about the
 * listing is optional.
 */
export function normaliseEvent(
  raw: Record<string, unknown>,
  source: DiscoverySource,
  opts: NormaliseOptions = {},
): DiscoveredEvent | null {
  const now = opts.now ?? Date.now();
  const maxYearsAhead = opts.maxYearsAhead ?? 3;

  const title = text(raw.name, MAX_EVENT_TITLE);
  if (!title) return null;

  const startDate = parseEventDate(raw.startDate);
  // No date, no event. This is the line that keeps a guess out of the list.
  if (!startDate) return null;

  const endDate = parseEventDate(raw.endDate);
  // Already over. A day's grace so an event running today still shows.
  if (startDate.getTime() < now - 86_400_000 && (!endDate || endDate.getTime() < now)) return null;
  if (startDate.getTime() > now + maxYearsAhead * 365 * 86_400_000) return null;

  const summary = text(raw.description, MAX_EVENT_SUMMARY);
  // An Eventbrite search for "energy" returns nightclub nights and church
  // services, and they must not land on everyone's dashboard.
  if (!isEnergyEvent(title, summary)) return null;

  const { venue, city, country } = readLocation(raw.location);

  return {
    title,
    startDate,
    endDate: endDate && endDate.getTime() >= startDate.getTime() ? endDate : null,
    venue,
    city,
    country,
    url: safeHttpUrl(typeof raw.url === "string" ? raw.url : null),
    summary,
    site: source.site,
    region: source.region,
  };
}

/** Every qualifying event on one fetched page. */
export function discoverFromHtml(
  html: string,
  source: DiscoverySource,
  opts: NormaliseOptions = {},
): DiscoveredEvent[] {
  const events: DiscoveredEvent[] = [];
  for (const doc of extractJsonLd(html)) {
    for (const raw of collectEvents(doc)) {
      const ev = normaliseEvent(raw, source, opts);
      if (ev) events.push(ev);
    }
  }
  return events;
}

/**
 * The key one event is the same event under.
 *
 * The same conference is listed by several of these searches, and its URL
 * can differ by tracking parameters — so identity is its title and the day
 * it starts, not its link.
 */
export function eventKey(e: { title: string; startDate: Date }): string {
  const title = e.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const day = e.startDate.toISOString().slice(0, 10);
  return `event:${title}|${day}`;
}

/** Soonest first. Two on the same day sort by title, so the order is stable. */
export function byDate(a: DiscoveredEvent, b: DiscoveredEvent): number {
  const d = a.startDate.getTime() - b.startDate.getTime();
  return d !== 0 ? d : a.title.localeCompare(b.title);
}

/** Drop repeats across sources, keeping the first (Nigeria searches run first). */
export function dedupeEvents(events: DiscoveredEvent[]): DiscoveredEvent[] {
  const seen = new Set<string>();
  const out: DiscoveredEvent[] = [];
  for (const e of events) {
    const key = eventKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
