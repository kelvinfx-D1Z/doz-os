import test from "node:test";
import assert from "node:assert/strict";
import {
  extractJsonLd,
  collectEvents,
  normaliseEvent,
  isEnergyEvent,
  discoverFromHtml,
  eventKey,
  dedupeEvents,
  byDate,
  DISCOVERY_SOURCES,
  MAX_EVENT_TITLE,
  type DiscoverySource,
} from "./event-discovery.ts";
import { safeHttpUrl } from "./energy-news.ts";

const NOW = new Date("2026-10-06T12:00:00Z").getTime();
const SRC: DiscoverySource = { url: "https://x", site: "Eventbrite", region: "Nigeria" };
const opts = { now: NOW };

/** The shape Eventbrite actually publishes: Events nested inside an ItemList. */
const EVENTBRITE_PAGE = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":[
 {"position":1,"@type":"ListItem","item":{"@type":"Event","name":"Lagos Energy Summit 2026",
  "startDate":"2026-11-10","endDate":"2026-11-11",
  "description":"Transforming the grid and the power sector.",
  "url":"https://www.eventbrite.com/e/lagos-energy-summit-tickets-123",
  "location":{"@type":"Place","name":"Eko Hotel","address":{"@type":"PostalAddress","addressLocality":"Lagos","addressCountry":"NG"}}}},
 {"position":2,"@type":"ListItem","item":{"@type":"Event","name":"AFRO HOUSE FUSION",
  "startDate":"2026-10-21","description":"A night of music.",
  "url":"https://www.eventbrite.com/e/afro-house-tickets-456",
  "location":{"@type":"Place","name":"Club","address":{"addressLocality":"Itori"}}}}
]}</script>
<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>
</head></html>`;

test("THE REAL SHAPE: events nested in an ItemList are found", () => {
  // Eventbrite does not put Events at the top level. A parser that only
  // looked there would report that the whole internet has no events.
  const found = discoverFromHtml(EVENTBRITE_PAGE, SRC, opts);
  assert.equal(found.length, 1, "the music night is filtered out");
  const e = found[0];
  assert.equal(e.title, "Lagos Energy Summit 2026");
  assert.equal(e.startDate.toISOString().slice(0, 10), "2026-11-10");
  assert.equal(e.endDate?.toISOString().slice(0, 10), "2026-11-11");
  assert.equal(e.venue, "Eko Hotel");
  assert.equal(e.city, "Lagos");
  assert.equal(e.country, "NG");
  assert.equal(e.site, "Eventbrite");
});

test("events inside an @graph are found too", () => {
  const page = `<script type="application/ld+json">{"@graph":[{"@type":"BusinessEvent","name":"Nigeria Oil & Gas Week",
    "startDate":"2026-12-01","url":"https://nog.example/x"}]}</script>`;
  const [e] = discoverFromHtml(page, SRC, opts);
  assert.equal(e.title, "Nigeria Oil & Gas Week");
});

test("NO DATE, NO EVENT — a listing without a start date is dropped", () => {
  // The line that keeps a guessed date out of the list. A guess sends
  // somebody to an empty hall.
  assert.equal(normaliseEvent({ name: "Energy Summit", url: "https://x/y" }, SRC, opts), null);
  assert.equal(normaliseEvent({ name: "Energy Summit", startDate: "soon" }, SRC, opts), null);
  assert.equal(normaliseEvent({ name: "Energy Summit", startDate: "" }, SRC, opts), null);
});

test("an event with no name is dropped", () => {
  assert.equal(normaliseEvent({ startDate: "2026-11-10" }, SRC, opts), null);
});

test("an event that has already finished is dropped", () => {
  assert.equal(normaliseEvent({ name: "Energy Expo", startDate: "2026-09-01" }, SRC, opts), null);
});

test("a multi-day event running TODAY is kept", () => {
  // It started yesterday and ends tomorrow — still worth knowing about.
  const e = normaliseEvent(
    { name: "Energy Week", startDate: "2026-10-05", endDate: "2026-10-08" },
    SRC,
    opts,
  );
  assert.ok(e, "an event in progress is still an event");
});

test("a listing dated absurdly far ahead is treated as a data error", () => {
  assert.equal(normaliseEvent({ name: "Energy Expo", startDate: "2099-01-01" }, SRC, opts), null);
});

test("an end date before the start is discarded rather than stored backwards", () => {
  const e = normaliseEvent(
    { name: "Energy Expo", startDate: "2026-11-10", endDate: "2026-11-02" },
    SRC,
    opts,
  );
  assert.equal(e?.endDate, null);
});

test("IRRELEVANT RESULTS ARE REFUSED, however they were found", () => {
  // All real results from live Eventbrite energy searches.
  for (const name of ["LAVISH FRIDAY", "Night Of Power 2026 (The Mighty Hand of God)", "AgriValue Nigeria Summit 2026"]) {
    assert.equal(normaliseEvent({ name, startDate: "2026-11-10" }, SRC, opts), null, name);
  }
});

test("the organiser's description can qualify an event the title does not", () => {
  const e = normaliseEvent(
    { name: "The Future Forum 2026", startDate: "2026-11-10", description: "A day on refinery economics and LNG exports." },
    SRC,
    opts,
  );
  assert.ok(e);
});

test("a virtual event reads as Online rather than as a missing venue", () => {
  const e = normaliseEvent(
    { name: "Energy transition webinar", startDate: "2026-11-10", location: { "@type": "VirtualLocation", url: "https://zoom.example" } },
    SRC,
    opts,
  );
  assert.equal(e?.city, "Online");
  assert.equal(e?.venue, null);
});

test("a plain-string address still yields a city", () => {
  const e = normaliseEvent(
    { name: "Gas Expo", startDate: "2026-11-10", location: { name: "ICC", address: "Abuja, Nigeria" } },
    SRC,
    opts,
  );
  assert.equal(e?.venue, "ICC");
  assert.equal(e?.city, "Abuja, Nigeria");
});

// ---- untrusted input ----------------------------------------------------

test("UNTRUSTED: a javascript: link on an event never becomes a link", () => {
  const e = normaliseEvent({ name: "Oil & Gas summit", startDate: "2026-11-10", url: "javascript:alert(1)" }, SRC, opts);
  assert.equal(e?.url, null, "the event is still shown, just without a link");
});

test("markup in a listing is stripped, not rendered", () => {
  const e = normaliseEvent(
    { name: "<script>alert(1)</script>Energy Summit", startDate: "2026-11-10", description: "<b>Gas</b> and oil" },
    SRC,
    opts,
  );
  assert.doesNotMatch(e?.title ?? "", /script|alert/i);
  assert.equal(e?.summary, "Gas and oil");
});

test("an over-long title is capped", () => {
  const e = normaliseEvent({ name: "Energy " + "x".repeat(2000), startDate: "2026-11-10" }, SRC, opts);
  assert.equal(e?.title.length, MAX_EVENT_TITLE);
});

test("malformed, empty and hostile JSON-LD yields nothing rather than throwing", () => {
  assert.deepEqual(extractJsonLd(""), []);
  assert.deepEqual(extractJsonLd("<script type=\"application/ld+json\">{not json}</script>"), []);
  assert.deepEqual(extractJsonLd(null as never), []);
  assert.deepEqual(discoverFromHtml("<html>nothing here</html>", SRC, opts), []);
});

test("a deeply self-referencing object cannot spin the walker forever", () => {
  const loop: Record<string, unknown> = { "@type": "Event", name: "Energy Expo", startDate: "2026-11-10" };
  loop.self = loop;
  assert.doesNotThrow(() => collectEvents(loop));
});

// ---- dedupe and ordering -------------------------------------------------

const ev = (title: string, iso: string) => ({
  title, startDate: new Date(iso), endDate: null, venue: null, city: null, country: null,
  url: null, summary: null, site: "Eventbrite", region: "Nigeria" as const,
});

test("the same conference found by two searches is listed once", () => {
  // Nigeria/energy and Nigeria/oil--gas both return it, with different
  // tracking parameters on the link — so identity is title plus start day.
  const deduped = dedupeEvents([
    ev("Lagos Energy Summit 2026", "2026-11-10"),
    ev("lagos energy summit 2026!", "2026-11-10"),
  ]);
  assert.equal(deduped.length, 1);
});

test("an annual event in two different years is NOT merged", () => {
  const deduped = dedupeEvents([ev("NOG Energy Week", "2026-07-01"), ev("NOG Energy Week", "2027-07-01")]);
  assert.equal(deduped.length, 2);
});

test("eventKey ignores punctuation and case but not the date", () => {
  assert.equal(eventKey(ev("Oil & Gas Expo", "2026-11-10")), eventKey(ev("oil   gas   expo", "2026-11-10")));
  assert.notEqual(
    eventKey(ev("Oil & Gas Expo", "2026-11-10")),
    eventKey(ev("Oil and Gas Expo", "2026-11-10")),
    "a different word is a different title — the key does not try to be clever",
  );
  assert.notEqual(eventKey(ev("Oil Expo", "2026-11-10")), eventKey(ev("Oil Expo", "2026-11-11")));
});

test("events sort soonest first, with a stable order within a day", () => {
  const sorted = [ev("Zebra summit", "2026-12-01"), ev("Alpha summit", "2026-12-01"), ev("Early one", "2026-11-01")].sort(byDate);
  assert.deepEqual(sorted.map((e) => e.title), ["Early one", "Alpha summit", "Zebra summit"]);
});

// ---- the source list -----------------------------------------------------

test("every discovery source is an https URL on a site that allows it", () => {
  assert.ok(DISCOVERY_SOURCES.length >= 5);
  for (const s of DISCOVERY_SOURCES) {
    assert.equal(safeHttpUrl(s.url), s.url);
    assert.ok(s.site.trim().length > 0, "a reader must be told where this came from");
  }
  assert.equal(new Set(DISCOVERY_SOURCES.map((s) => s.url)).size, DISCOVERY_SOURCES.length);
});

test("Nigerian searches are read first, so they win any dedupe", () => {
  const firstAfrica = DISCOVERY_SOURCES.findIndex((s) => s.region === "Africa");
  const lastNigeria = DISCOVERY_SOURCES.map((s) => s.region).lastIndexOf("Nigeria");
  assert.ok(lastNigeria < firstAfrica, "Nigeria before the rest of Africa in the list");
});

test("THE SCOPE IS NIGERIA AND AFRICA — nothing further afield", () => {
  // "Limit it to Nigeria and a bit of Africa." The American, British,
  // Emirati and online searches were four fifths of everything found and
  // none of it was work D1Z could reach.
  const regions = new Set(DISCOVERY_SOURCES.map((s) => s.region));
  assert.deepEqual([...regions].sort(), ["Africa", "Nigeria"]);
  for (const s of DISCOVERY_SOURCES) {
    assert.doesNotMatch(s.url, /united-states|united-kingdom|united-arab-emirates|\/online\//, s.url);
  }
});

test("THE NIGHTLIFE CASE: 'high energy' in a party listing is not this industry", () => {
  // All real: these reached the list because their descriptions promise an
  // energetic night out. A title may say "energy"; a description must name
  // the sector.
  const party = "Come through for a high energy night, great vibes and good energy all evening.";
  for (const name of ["LAVISH FRIDAY", "Silk & Soul - Bella Red Room", "Friday Tribal Jungle", "Turning Up Oshodi Nights"]) {
    assert.equal(
      normaliseEvent({ name, startDate: "2026-11-10", description: party }, SRC, opts),
      null,
      name,
    );
  }
});

test("a description still qualifies an event when it names the sector", () => {
  assert.ok(isEnergyEvent("The Future Forum 2026", "A day on refinery economics and LNG exports."));
  assert.ok(isEnergyEvent("Annual Members' Day", "Covering the national grid and electricity tariffs."));
});

test("and a plain energy title still passes on its own", () => {
  assert.ok(isEnergyEvent("Lagos Energy Summit 2026", null));
  assert.ok(isEnergyEvent("Amped and Wired 2026: Energy and AI", "A day of talks."));
});

test("THE AROMATHERAPY CASE: 'oil' alone is not this industry", () => {
  // Real results from live Kenyan and South African searches. In an event
  // listing "oil" is as often essential, anointing or cooking oil.
  assert.equal(isEnergyEvent("Aromatherapy Class", "Blend your own essential oils."), false);
  assert.equal(isEnergyEvent("BEFORE DAWN: GUARD THE OIL", "A night of worship and prayer."), false);
  assert.equal(isEnergyEvent("Swimming Upstream - Worldwork + Process", "A psychology workshop."), false);
});

test("but oil with a companion word is the sector", () => {
  assert.ok(isEnergyEvent("Nigeria Oil & Gas Week", null));
  assert.ok(isEnergyEvent("Oil & Gas Processing & AIM Workshop", null));
  assert.ok(isEnergyEvent("Crude oil licensing round briefing", null));
  assert.ok(isEnergyEvent("Upstream investment forum", "Offshore exploration and field development."));
});

test("unambiguous sector words still stand alone", () => {
  for (const t of ["Solar Expo Lagos", "National Grid Summit", "LNG Shipping Forum", "Refinery Operators Workshop"]) {
    assert.ok(isEnergyEvent(t, null), t);
  }
});

test("'gas' counts for an event even though the news list treats it warily", () => {
  // It sits on the news module's ambiguous list because of "tear gas". An
  // event listing that says gas means the sector, and briefly did not count.
  assert.ok(isEnergyEvent("Gas Expo", null));
  assert.ok(isEnergyEvent("West African Gas Summit", null));
  assert.equal(isEnergyEvent("Protest anniversary: tear gas and the right to march", null), false);
});
