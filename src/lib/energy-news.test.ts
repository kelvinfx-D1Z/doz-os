import test from "node:test";
import assert from "node:assert/strict";
import {
  parseFeed,
  stripHtml,
  isEnergyRelevant,
  safeHttpUrl,
  dedupeKey,
  selectItems,
  byRecency,
  FEEDS,
  MAX_TITLE,
  MAX_SUMMARY,
  TERM_LISTS,
} from "./energy-news.ts";

const NOW = new Date("2026-10-06T12:00:00Z").getTime();

// A real item, copied from the Nairametrics energy feed.
const REAL_ITEM = `<item>
  <title>Asharami Ghana commissions 6,000MT LPG facility, expands storage capacity by 10%</title>
  <link>https://nairametrics.com/2026/10/06/asharami-ghana-commissions-6000mt-lpg-facility/</link>
  <dc:creator><![CDATA[Chike Olisah]]></dc:creator>
  <pubDate>Tue, 06 Oct 2026 16:07:09 +0000</pubDate>
  <category><![CDATA[Energy]]></category>
  <description><![CDATA[<p>Asharami Ghana has commissioned a 6,000-metric-tonne LPG storage facility at the Tema Oil Jetty.</p>
<p>The post <a href="https://nairametrics.com/x/">Asharami Ghana commissions</a> appeared first on <a href="https://nairametrics.com">Nairametrics</a>.</p>]]></description>
</item>`;

test("a real feed item parses into headline, link, standfirst and date", () => {
  const [item] = parseFeed(`<rss><channel>${REAL_ITEM}</channel></rss>`);
  assert.equal(item.title, "Asharami Ghana commissions 6,000MT LPG facility, expands storage capacity by 10%");
  assert.equal(item.url, "https://nairametrics.com/2026/10/06/asharami-ghana-commissions-6000mt-lpg-facility/");
  assert.equal(item.summary, "Asharami Ghana has commissioned a 6,000-metric-tonne LPG storage facility at the Tema Oil Jetty.");
  assert.equal(item.publishedAt?.toISOString(), "2026-10-06T16:07:09.000Z");
});

test("the WordPress 'appeared first on' tail is dropped from the standfirst", () => {
  // Every WordPress feed appends it. Left in, it is the longest part of most
  // standfirsts and says nothing.
  const [item] = parseFeed(`<rss>${REAL_ITEM}</rss>`);
  assert.doesNotMatch(item.summary ?? "", /appeared first on/i);
});

test("Atom entries parse too, link attribute and all", () => {
  const atom = `<feed><entry>
    <title>NNPC lifts crude output to 1.8m bpd</title>
    <link rel="alternate" href="https://example.ng/nnpc-output"/>
    <summary>Production rose in September.</summary>
    <published>2026-10-01T09:00:00Z</published>
  </entry></feed>`;
  const [item] = parseFeed(atom);
  assert.equal(item.title, "NNPC lifts crude output to 1.8m bpd");
  assert.equal(item.url, "https://example.ng/nnpc-output");
  assert.equal(item.publishedAt?.toISOString(), "2026-10-01T09:00:00.000Z");
});

test("an item with no headline or no link is skipped, not half-stored", () => {
  const xml = `<rss>
    <item><title>No link here</title></item>
    <item><link>https://example.ng/no-title</link></item>
    <item><title>Good one</title><link>https://example.ng/good</link></item>
  </rss>`;
  const items = parseFeed(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Good one");
});

test("empty, junk and non-string input yield no items rather than throwing", () => {
  assert.deepEqual(parseFeed(""), []);
  assert.deepEqual(parseFeed("<html><body>not a feed</body></html>"), []);
  assert.deepEqual(parseFeed("   "), []);
  assert.deepEqual(parseFeed(null as never), []);
});

// ---- untrusted content ---------------------------------------------------

test("UNTRUSTED: markup in a feed is stripped, never carried through", () => {
  // This text is third party and arrives over the network. It is data.
  const xml = `<rss><item>
    <title>Headline &amp; more</title>
    <link>https://example.ng/x</link>
    <description><![CDATA[<script>alert(1)</script><p>Real text</p>]]></description>
  </item></rss>`;
  const [item] = parseFeed(xml);
  assert.equal(item.title, "Headline & more");
  assert.equal(item.summary, "Real text");
  assert.doesNotMatch(item.summary ?? "", /script|alert/i);
});

test("A javascript: link in a feed never becomes a link on a staff screen", () => {
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(safeHttpUrl("file:///etc/passwd"), null);
  assert.equal(safeHttpUrl("/relative/path"), null, "a relative link has no outlet to point at");
  assert.equal(safeHttpUrl(""), null);
  assert.equal(safeHttpUrl(null), null);
  assert.equal(safeHttpUrl("https://example.ng/ok"), "https://example.ng/ok");
});

test("an item whose only link is hostile is skipped entirely", () => {
  const xml = `<rss><item><title>Click me</title><link>javascript:alert(1)</link></item></rss>`;
  assert.deepEqual(parseFeed(xml), []);
});

test("titles and standfirsts are capped, so one feed cannot flood a column", () => {
  const long = "x".repeat(2000);
  const xml = `<rss><item><title>${long}</title><link>https://example.ng/a</link><description>${long}</description></item></rss>`;
  const [item] = parseFeed(xml);
  assert.equal(item.title.length, MAX_TITLE);
  assert.equal((item.summary ?? "").length, MAX_SUMMARY);
});

test("stripHtml decodes &amp; last, so &amp;lt; does not become a tag", () => {
  assert.equal(stripHtml("&amp;lt;b&amp;gt;"), "&lt;b&gt;");
  assert.equal(stripHtml("Shell&#8217;s output"), "Shell’s output");
});

// ---- is this actually energy news? --------------------------------------

test("real energy headlines are recognised", () => {
  for (const headline of [
    "NNPC raises petrol price at its retail outlets",
    "Dangote Refinery begins diesel exports",
    "NERC approves new electricity tariff for Discos",
    "Seplat completes acquisition of onshore assets",
    "FG targets 1.8 million barrels per day crude output",
    "Shell declares force majeure on Bonny Light exports",
    "Nigeria signs LNG supply deal",
    "TCN restores national grid after collapse",
  ]) {
    assert.equal(isEnergyRelevant(headline), true, headline);
  }
});

test("THE FALSE FRIENDS: political 'power' and tear gas are not energy news", () => {
  // A general business feed carries the whole paper. Without this, every
  // "power tussle" in Nigerian politics lands on an intern's dashboard
  // labelled industry news.
  assert.equal(isEnergyRelevant("APC power tussle deepens ahead of primaries"), false);
  assert.equal(isEnergyRelevant("Police fire tear gas at protesters in Abuja"), false);
  assert.equal(isEnergyRelevant("Governor speaks on balance of power in the senate"), false);
});

test("but real power-sector stories still pass", () => {
  assert.equal(isEnergyRelevant("Power sector debt hits N4 trillion"), true);
  assert.equal(isEnergyRelevant("Band A customers to get 20 hours of power daily"), true);
});

test("word boundaries: 'toil' is not oil and 'rigging' is not a rig", () => {
  assert.equal(isEnergyRelevant("Years of toil finally rewarded"), false);
  assert.equal(isEnergyRelevant("Court hears election rigging case"), false);
  assert.equal(isEnergyRelevant("Lagos traffic worsens"), false);
  assert.equal(isEnergyRelevant("Super Eagles win in Uyo"), false);
});

// ---- selection ----------------------------------------------------------

const energyDesk = { name: "Punch", url: "https://x", energyOnly: true };
const businessDesk = { name: "ThisDay", url: "https://y", energyOnly: false };
const item = (title: string, url: string, iso: string | null = "2026-10-05T00:00:00Z") => ({
  title, url, summary: null, publishedAt: iso ? new Date(iso) : null,
});

test("an energy desk is taken whole; a business desk is filtered", () => {
  const raw = [item("Anything at all", "https://x/1"), item("NNPC output rises", "https://x/2")];
  assert.equal(selectItems(raw, energyDesk, { now: NOW }).length, 2);
  const filtered = selectItems(raw, businessDesk, { now: NOW });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].title, "NNPC output rises");
});

test("the same story at two URLs is carried once", () => {
  const raw = [
    item("Grid collapses", "https://punchng.com/story/"),
    item("Grid collapses", "https://www.punchng.com/story?utm_source=twitter"),
  ];
  assert.equal(selectItems(raw, energyDesk, { now: NOW }).length, 1);
});

test("dedupeKey ignores www, scheme, trailing slash, query and fragment", () => {
  const a = dedupeKey("https://www.punchng.com/story/?utm=1#top");
  assert.equal(a, dedupeKey("http://punchng.com/story"));
  assert.notEqual(a, dedupeKey("https://punchng.com/other-story"));
});

test("stale news is dropped, but an UNDATED item is kept", () => {
  // Some outlets omit pubDate entirely. Dropping undated items would quietly
  // lose a whole source, which is worse than carrying something slightly old.
  const raw = [
    item("Old news", "https://x/old", "2026-01-01T00:00:00Z"),
    item("Fresh news", "https://x/new", "2026-10-05T00:00:00Z"),
    item("Undated", "https://x/undated", null),
  ];
  const kept = selectItems(raw, energyDesk, { now: NOW }).map((i) => i.title);
  assert.deepEqual(kept, ["Fresh news", "Undated"]);
});

test("a feed with a clock set in the future cannot pin itself to the top", () => {
  const xml = `<rss><item><title>From the future</title><link>https://x/f</link>
    <pubDate>Tue, 06 Oct 2030 00:00:00 +0000</pubDate></item></rss>`;
  assert.equal(parseFeed(xml)[0].publishedAt, null);
});

test("byRecency puts newest first and undated last", () => {
  const sorted = [
    { publishedAt: null },
    { publishedAt: new Date("2026-10-01T00:00:00Z") },
    { publishedAt: new Date("2026-10-05T00:00:00Z") },
  ].sort(byRecency);
  assert.equal(sorted[0].publishedAt?.toISOString(), "2026-10-05T00:00:00.000Z");
  assert.equal(sorted[2].publishedAt, null);
});

test("every configured feed names its outlet and is an https URL", () => {
  assert.ok(FEEDS.length >= 5);
  for (const f of FEEDS) {
    assert.ok(f.name.trim().length > 0, "a story must say who reported it");
    assert.equal(safeHttpUrl(f.url), f.url);
    assert.equal(new URL(f.url).protocol, "https:");
  }
  assert.equal(new Set(FEEDS.map((f) => f.url)).size, FEEDS.length, "no feed twice");
});

test("the two term lists stay disjoint — the bug that let tear gas through", () => {
  // "gas" sat in both. The plain list matched it before the ambiguity rule
  // could veto it, so a protest story read as energy news. If anyone adds a
  // word to both lists again, the veto silently stops working.
  const { ENERGY_TERMS, AMBIGUOUS_TERMS } = TERM_LISTS;
  const plain = new Set(ENERGY_TERMS);
  const overlap = AMBIGUOUS_TERMS.map((a) => a.term).filter((t) => plain.has(t));
  assert.deepEqual(overlap, [], `these are matched before their exception can apply: ${overlap.join(", ")}`);
});

test("only feeds that are genuinely energy desks are taken unfiltered", () => {
  // Punch's /topics/energy/ feed serves the paper's whole front page; it was
  // configured as an energy desk and put pension and air-crash stories on
  // every dashboard as "industry news". Checked against the live feed.
  const unfiltered = FEEDS.filter((f) => f.energyOnly).map((f) => f.name);
  assert.deepEqual(unfiltered.sort(), ["Nairametrics", "Vanguard"]);
});

test("THE ECOWAS CASE: 'non-renewable tenure' is not energy news", () => {
  // Real standfirst from the Punch feed. "renewable" on its own matched the
  // hyphenated word and put a judicial appointment on every dashboard.
  const real = "The ECOWAS Community Court of Justice has sworn in five new judges for a four-year non-renewable tenure during a ceremony in Abuja.";
  assert.equal(isEnergyRelevant(`ECOWAS court gets new judges ${real}`), false);
});

test("but genuine renewables coverage still passes", () => {
  assert.equal(isEnergyRelevant("FG signs renewable energy deal for rural electrification"), true);
  assert.equal(isEnergyRelevant("Renewables now 12% of the generation mix"), true);
});

test("the 'Read More:' tail Punch appends is stripped from standfirsts", () => {
  const xml = `<rss><item><title>FG opens oil bid round</title><link>https://punchng.com/x</link>
    <description><![CDATA[The Federal Government has opened the 2026 licensing round. Read More: https://punchng.com/fg-opens-oil-bid/]]></description></item></rss>`;
  const [item] = parseFeed(xml);
  assert.equal(item.summary, "The Federal Government has opened the 2026 licensing round.");
});

test("THE NON-OIL CASE: a story about non-oil exports is not oil news", () => {
  // Real headlines from the ThisDay and Premium Times feeds. A hyphen is a
  // word boundary, so "non-oil" matched "oil" and put the ports authority's
  // export drive on every dashboard as energy news.
  assert.equal(isEnergyRelevant("NPA to End Non-oil Export Bottlenecks to Boost FX Inflow"), false);
  assert.equal(
    isEnergyRelevant("NPA moves to cut export bottlenecks. Interventions for non-oil exporters."),
    false,
  );
});

test("but a story about BOTH sectors still counts, on its own 'oil'", () => {
  // Removing the phrase must not blind the matcher to a real mention.
  assert.equal(
    isEnergyRelevant("Economy grows: the oil and non-oil sectors both contributed"),
    true,
  );
});

test("EVENT MODE: 'power' alone is not an energy event", () => {
  // Real results from a live Eventbrite "power" search in Nigeria. In a
  // newspaper "power" is usually the grid; in an event title it is usually
  // a church service.
  assert.equal(isEnergyRelevant("Night Of Power 2026 (The Mighty Hand of God)", "event"), false);
  assert.equal(isEnergyRelevant("The girl I am: The power I possess", "event"), false);
  assert.equal(isEnergyRelevant("Liberation Power Conference 2026", "event"), false);
});

test("but the same word still counts in a news headline", () => {
  assert.equal(isEnergyRelevant("Power sector debt hits N4 trillion", "news"), true);
  assert.equal(isEnergyRelevant("Band A customers to get 20 hours of power daily", "news"), true);
});

test("real energy events pass in event mode", () => {
  for (const name of [
    "Lagos Energy Summit 2026: Transforming the grid",
    "Energy & AI Conference and Exhibition",
    "ADIPEC 2026 - Global Energy Network Drinks Reception",
    "Nigeria Oil & Gas Week",
    "IBC SOLAR Technical Training",
  ]) {
    assert.equal(isEnergyRelevant(name, "event"), true, name);
  }
});

test("events that merely turned up in an energy search are rejected", () => {
  // All real results from Eventbrite's Nigeria energy and oil--gas searches.
  for (const name of ["AFRO HOUSE FUSION", "LAVISH FRIDAY", "Bulletproof & Security Tech Abuja Expo", "AgriValue Nigeria Summit 2026"]) {
    assert.equal(isEnergyRelevant(name, "event"), false, name);
  }
});
