import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  FEEDS,
  parseFeed,
  selectItems,
  dedupeKey,
  safeHttpUrl,
  stripHtml,
  MAX_TITLE,
  MAX_SUMMARY,
  type SourcedItem,
} from "@/lib/energy-news";
import {
  DISCOVERY_SOURCES,
  discoverFromHtml,
  dedupeEvents,
  eventKey,
  byDate,
  type DiscoveredEvent,
} from "@/lib/event-discovery";

// Nigerian energy sector news and events.
//
// READABLE BY EVERY SIGNED-IN USER. This is the one module that is the same
// for all of them: it carries no figures, no client names and nothing about
// anyone's pay. An intern should walk into a shoot knowing what happened in
// the sector that morning, same as the founder.
//
// WRITES ARE NARROWER. Events are entered by hand and go on every screen in
// the company, so only the founder and staff may add or remove one.
//
// FEED CONTENT IS UNTRUSTED THIRD-PARTY TEXT. It is parsed, stripped of
// markup and stored as data. Nothing in a feed is ever treated as an
// instruction, and no AI rewrites a headline into something the outlet did
// not publish.

/** How long ingested news is considered fresh enough not to refetch. */
const FRESH_FOR_MS = 3 * 60 * 60 * 1000; // 3 hours
/** A slow outlet must not hold up everyone's dashboard. */
const FEED_TIMEOUT_MS = 8000;
const MAX_PER_FEED = 25;

function canCurate(role: string): boolean {
  return role === "FOUNDER" || role === "STAFF";
}

type FetchKind = "feed" | "page";

async function fetchFeed(url: string, kind: FetchKind = "feed"): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Some outlets refuse an unidentified client outright.
        "User-Agent": "Mozilla/5.0 (compatible; DOZ-OS/1.0; +https://doz-os.vercel.app)",
        Accept:
          kind === "feed"
            ? "application/rss+xml, application/xml, text/xml, */*"
            : "text/html,application/xhtml+xml,*/*",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read the event listings and store what is new.
 *
 * Events are discovered from organisers' own schema.org listings — see
 * src/lib/event-discovery.ts for what is and is not read. A row added by a
 * person is never touched here: discovery only ever inserts, and only
 * events it has not already stored.
 */
async function refreshEvents(): Promise<{ added: number; failed: string[] }> {
  const results = await Promise.allSettled(
    DISCOVERY_SOURCES.map(async (source) => {
      const html = await fetchFeed(source.url, "page");
      if (html === null) throw new Error("unreachable");
      return discoverFromHtml(html, source);
    }),
  );

  const failed: string[] = [];
  const found: DiscoveredEvent[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") found.push(...r.value);
    else failed.push(DISCOVERY_SOURCES[i].site);
  }

  const fresh = dedupeEvents(found).sort(byDate);
  if (fresh.length === 0) return { added: 0, failed: [...new Set(failed)] };

  // Against what is already stored, by the same key the discovery uses, so
  // a conference does not reappear every three hours.
  const existing = await db.industryNews.findMany({
    where: { kind: "EVENT" },
    select: { title: true, eventStart: true },
  });
  const known = new Set(
    existing
      .filter((e) => e.eventStart)
      .map((e) => eventKey({ title: e.title, startDate: e.eventStart as Date })),
  );

  const rows = fresh
    .filter((e) => !known.has(eventKey(e)))
    .map((e) => ({
      kind: "EVENT",
      title: e.title,
      url: e.url,
      // The site it was found on, so a reader can judge it. A person's name
      // goes here instead when they add one by hand.
      source: e.site,
      category: "ENERGY",
      summary: e.summary,
      publishedAt: null,
      eventStart: e.startDate,
      eventEnd: e.endDate,
      venue: e.venue,
      city: e.city,
      country: e.country,
      region: e.region,
      foundOn: e.site,
      addedById: null,
      // Events dedupe on title and date, not on URL, so they take no
      // dedupeKey — two listings of one conference have different links.
      dedupeKey: null,
    }));

  if (rows.length === 0) return { added: 0, failed: [...new Set(failed)] };
  const res = await db.industryNews.createMany({ data: rows, skipDuplicates: true });
  return { added: res.count, failed: [...new Set(failed)] };
}

/**
 * Pull every feed and store what is new. Returns how many rows were added.
 *
 * One outlet being down, slow or refusing us must never fail the refresh:
 * each feed is settled independently and its outcome recorded, so the page
 * can say which sources are not answering rather than showing an empty list
 * with no explanation.
 */
async function refreshFeeds(): Promise<{ added: number; failed: string[] }> {
  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const xml = await fetchFeed(feed.url);
      if (xml === null) throw new Error("unreachable");
      return { feed, items: selectItems(parseFeed(xml), feed).slice(0, MAX_PER_FEED) };
    }),
  );

  let added = 0;
  const failed: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const feed = FEEDS[i];
    const r = results[i];
    if (r.status !== "fulfilled") {
      failed.push(feed.name);
      await recordFeedRun(feed.url, false, r.reason instanceof Error ? r.reason.message : "failed", 0);
      continue;
    }
    // One insert for the whole feed, not one per story. Inserting 63 rows
    // individually against a remote pooler was most of a 53-second refresh.
    // skipDuplicates leans on the unique dedupeKey, so a story we already
    // have is passed over rather than raising.
    const stored = await storeFeedItems(r.value.items);
    added += stored;
    await recordFeedRun(feed.url, true, null, stored);
  }
  return { added, failed };
}

async function recordFeedRun(feedUrl: string, ok: boolean, error: string | null, itemsStored: number) {
  const data = { lastRunAt: new Date(), lastOk: ok, lastError: error?.slice(0, 300) ?? null, itemsStored };
  await db.newsFeedState
    .upsert({ where: { feedUrl }, update: data, create: { feedUrl, ...data } })
    .catch(() => {});
}

/** Store a feed's stories in one statement. Returns how many were new. */
async function storeFeedItems(items: SourcedItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const seen = new Set<string>();
  const rows: Array<{
    kind: string; title: string; url: string; source: string; category: string;
    summary: string | null; publishedAt: Date | null; dedupeKey: string;
  }> = [];
  for (const item of items) {
    const key = dedupeKey(item.url);
    // Two feeds can carry the same wire story; createMany cannot skip a
    // duplicate that is inside its own batch.
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      kind: "NEWS",
      title: item.title.slice(0, MAX_TITLE),
      url: item.url,
      source: item.source,
      category: "ENERGY",
      summary: item.summary?.slice(0, MAX_SUMMARY) ?? null,
      publishedAt: item.publishedAt,
      dedupeKey: key,
    });
  }
  try {
    const res = await db.industryNews.createMany({ data: rows, skipDuplicates: true });
    return res.count;
  } catch {
    return 0;
  }
}

async function needsRefresh(): Promise<boolean> {
  const newest = await db.newsFeedState.findFirst({ orderBy: { lastRunAt: "desc" }, select: { lastRunAt: true } });
  if (!newest) return true;
  return Date.now() - newest.lastRunAt.getTime() > FRESH_FOR_MS;
}

/**
 * GET — the sector's news and its events.
 *
 * Refreshes the feeds inline when the stored news has gone stale, so nobody
 * has to remember to press anything; `?refresh=1` forces it.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Only an explicit refresh fetches the outlets. A page load reads what is
  // stored and says whether it is stale; the page then asks for a refresh in
  // the background. Fetching seven newspapers inline made the first load take
  // 53 seconds — and it would have done so on five dashboards at once.
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  let refreshed: { added: number; failed: string[] } | null = null;
  let eventsFound: { added: number; failed: string[] } | null = null;
  if (force) {
    // News and events are independent: one source refusing us must not cost
    // the other its refresh.
    const [news, events] = await Promise.allSettled([refreshFeeds(), refreshEvents()]);
    refreshed = news.status === "fulfilled" ? news.value : null;
    eventsFound = events.status === "fulfilled" ? events.value : null;
  }
  const stale = await needsRefresh();

  const [news, events, feedStates] = await Promise.all([
    db.industryNews.findMany({
      where: { kind: "NEWS" },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 60,
    }),
    db.industryNews.findMany({
      where: { kind: "EVENT" },
      orderBy: [{ eventStart: "asc" }],
      take: 100,
    }),
    db.newsFeedState.findMany(),
  ]);

  const lastRefreshed = feedStates.reduce<Date | null>(
    (latest, f) => (latest === null || f.lastRunAt > latest ? f.lastRunAt : latest),
    null,
  );

  return NextResponse.json({
    news,
    events,
    lastRefreshed,
    /** True when the page should quietly ask for ?refresh=1 in the background. */
    stale,
    // Named so the page can say "Punch isn't answering" rather than simply
    // showing less news than yesterday with no reason given.
    unreachable: feedStates.filter((f) => !f.lastOk).map((f) => f.feedUrl),
    refreshed,
    eventsFound,
    canCurate: canCurate(user.role),
    sources: FEEDS.map((f) => f.name),
  });
}

/** POST — add an event by hand, or a link worth keeping. Founder/staff only. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canCurate(user.role)) {
    return NextResponse.json(
      { error: "Only the founder or staff can add to industry news" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = stripHtml(String(body.title ?? "")).slice(0, MAX_TITLE).trim();
  if (!title) return NextResponse.json({ error: "A title is required" }, { status: 400 });

  const kind = body.kind === "EVENT" ? "EVENT" : "NEWS";
  const url = safeHttpUrl(typeof body.url === "string" ? body.url : null);
  if (kind === "NEWS" && !url) {
    return NextResponse.json({ error: "A news link must be a full http(s) address" }, { status: 400 });
  }

  const eventStart = parseDay(body.eventStart);
  const eventEnd = parseDay(body.eventEnd);
  if (kind === "EVENT" && !eventStart) {
    // An event with no date cannot be planned around, and a guessed one
    // sends somebody to an empty hall.
    return NextResponse.json({ error: "An event needs a start date" }, { status: 400 });
  }
  if (eventStart && eventEnd && eventEnd < eventStart) {
    return NextResponse.json({ error: "The event ends before it starts" }, { status: 400 });
  }

  const created = await db.industryNews.create({
    data: {
      kind,
      title,
      url,
      // A hand-entered row names the person, so a reader knows this came
      // from a colleague rather than from an outlet's wire.
      source: stripHtml(String(body.source ?? "")).slice(0, 120).trim() || user.name,
      category: "ENERGY",
      summary: stripHtml(String(body.summary ?? "")).slice(0, MAX_SUMMARY).trim() || null,
      publishedAt: kind === "NEWS" ? new Date() : null,
      eventStart,
      eventEnd,
      venue: stripHtml(String(body.venue ?? "")).slice(0, 200).trim() || null,
      city: stripHtml(String(body.city ?? "")).slice(0, 120).trim() || null,
      addedById: user.id,
      dedupeKey: url ? dedupeKey(url) : null,
    },
  });
  return NextResponse.json({ ok: true, item: created }, { status: 201 });
}

/** "2026-11-04" or an ISO datetime, as a real date or null. Never a guess. */
function parseDay(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw.trim());
  return Number.isFinite(d.getTime()) ? d : null;
}

/** DELETE — remove an item. Founder only. */
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "FOUNDER") {
    return NextResponse.json({ error: "Only the founder can remove an item" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await db.industryNews.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  await db.industryNews.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
