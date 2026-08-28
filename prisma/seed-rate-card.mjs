// Seed: the founder's real rate-card figures — BP (Budget Price, what the
// job costs D1Z) from the equipment-rental cost sheet, CP (Client Price,
// what the client is charged) from the founder's 2026 rate card — plus the
// linking of the three reference EventTemplates (seed-templates.mjs) to
// this catalogue so "start a budget from a template" produces real costs.
//
// This is unlike every other script in this plan: it is committed and it
// WRITES TO THE LIVE PRODUCTION DATABASE. It is:
//
//   - Never destructive. No deleteMany/delete/updateMany/reset. The six
//     departments and 31 services that predate this script are left
//     completely alone; new rows are added alongside them.
//   - Idempotent. The key for a department is its name (ServiceCategory.name
//     is @unique in the schema). The key for a service is DEPARTMENT + NAME,
//     not name alone — "Stage & ambient lighting" already exists under
//     "Audiovisual & Technical Production" with no rate, and the founder's
//     rate card gives a real price (BP 180,000 / CP 225,000) for the same
//     name filed under a new "Lighting" department. Keying on name alone
//     would skip that row and silently lose a rate the founder gave by
//     direct verbal instruction. A duplicate name across two departments is
//     safe: the pricing lookup (src/app/api/doz/projects/pricing/route.ts)
//     keys on name AND category, so the two rows can never collide there.
//   - Written trimmed. A stored name with a stray space silently loses its
//     published rate in the pricing lookup.
//
// Three-state rule (see src/lib/rate-card.ts): a rate of 0 is a real,
// complimentary price; null is "unpriced", not "free". In the table below,
// `null` means the founder's sheet did not give a figure for that side —
// never coerce it to 0, never write 0 for "unknown".
//
// This script only ever CREATES, never UPDATES. A row that already exists
// (department + name) is left exactly as it is, on purpose — that is what
// stops a re-run from clobbering a correction the founder has since made in
// the Catalogue tab. The direct consequence: editing a figure in CATALOGUE
// below and re-running this script does NOTHING to an already-seeded row —
// it will print "already present, skipped", not "updated". This matters
// because three figures below are explicitly flagged as awaiting the
// founder's confirmation (see FLAGS): once seeded, changing them here has
// no effect. A seeded rate is changed on the founder's rate card page, not
// by editing this file and re-running it.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// department, [ name, BP, CP, unit ][]
const CATALOGUE = [
  ["Displays", [
    ["LED screen (6sqm)", 150000, 225000, "DAY"],
    ["TV + stand", 40000, 60000, "DAY"],
    ["TV display", 35000, 50000, "DAY"],
    ["Standing monitor", null, null, "DAY"],
    ["Floor monitor", null, null, "DAY"],
    ["Control room monitor", null, null, "DAY"],
    ["Stage timer", null, null, "DAY"],
    ["LED processor", null, 50000, "DAY"],
    ["LED technician", null, 50000, "DAY"],
  ]],
  ["Cameras & Capture", [
    ["Professional camera package", 30000, 45000, "DAY"],
    ["B-roll camera package", 100000, 150000, "DAY"],
    ["6-channel HD mixer + monitor", 25000, 30000, "DAY"],
    ["Blackmagic recorder", 20000, 30000, "DAY"],
    ["Wireless receiver", 15000, 25000, "DAY"],
    ["Cables & connectors package", 50000, 75000, "UNIT"],
    ["Camera tripod", null, 15000, "DAY"],
  ]],
  ["Sound", [
    ["Standard event sound", 250000, 300000, "DAY"],
    ["Small meeting sound system", null, 150000, "DAY"],
    ["Medium event sound", null, 400000, "DAY"],
    ["Wireless microphone", null, 25000, "DAY"],
    ["Wired microphone", null, 10000, "DAY"],
    ["Sound engineer", null, 50000, "DAY"],
  ]],
  ["Lighting", [
    // "Stage & ambient lighting" also exists under "Audiovisual & Technical
    // Production" (unpriced) — see the module comment above on why this is
    // seeded as a second row rather than folded into that one.
    ["Stage & ambient lighting", 180000, 225000, "DAY"],
    ["Stage lighting package", null, 300000, "DAY"],
    ["Stage light strip / install", 135800, null, "UNIT"],
    ["Moving head lighting", null, 50000, "DAY"],
    ["LED par / wash light", null, 15000, "DAY"],
    ["Lighting technician", null, 40000, "DAY"],
  ]],
  ["Streaming & Broadcast", [
    ["Livestreaming", 70000, 150000, "DAY"],
    ["Streaming technician", null, 50000, "DAY"],
    ["Stream director", null, 75000, "DAY"],
    ["Graphics / lower thirds", null, 50000, "UNIT"],
    ["Internet / data", 16000, 25000, "DAY"],
  ]],
  ["Stage & Scenic Fabrication", [
    ["Stage", 390000, 500000, "UNIT"],
    ["Standard corporate stage", null, 650000, "UNIT"],
    ["Stage fascia", null, 100000, "UNIT"],
    ["Stage installation", null, 75000, "UNIT"],
  ]],
  ["Branding & Print", [
    ["Branding materials", 461000, null, "UNIT"],
    ["Workmanship / fabrication", 150000, null, "UNIT"],
    ["Printing", 298000, null, "UNIT"],
    ["Directional signage", null, 25000, "UNIT"],
    ["Pull-up banner", null, 35000, "UNIT"],
    ["Backdrop branding", null, 100000, "UNIT"],
  ]],
  ["Furniture", [
    ["Bucket chair", 15000, 20000, "UNIT"],
    ["Panel chair", 15000, 20000, "UNIT"],
    ["Side table", 10000, 15000, "UNIT"],
    ["Counter table", null, 10000, "UNIT"],
    ["High stool", null, 15000, "UNIT"],
  ]],
  ["Personnel", [
    ["Videographer", 30000, 45000, "PERSON"],
    ["Senior videographer", null, 60000, "PERSON"],
    ["Photographer", 100000, 120000, "PERSON"],
    ["Production manager", 250000, 325000, "PERSON"],
    ["Camera assistant", null, 30000, "PERSON"],
    ["Technical director", null, 100000, "PERSON"],
  ]],
  ["Logistics & Welfare", [
    ["Local production transport", 40000, 50000, "UNIT"],
    ["Equipment transport", null, 75000, "UNIT"],
    ["Crew catering", 32000, 50000, "DAY"],
  ]],
  ["Post-Production", [
    ["Basic event edit", null, 150000, "UNIT"],
    ["Standard event highlight", null, 200000, "UNIT"],
    ["Conference recap", null, 250000, "UNIT"],
  ]],
  ["Colour Grading", [
    ["Basic colour correction", null, 100000, "UNIT"],
    ["Corporate video grade", null, 150000, "UNIT"],
  ]],
  ["Motion Graphics", [
    ["Lower third package", null, 100000, "UNIT"],
    ["Animated logo", null, 150000, "UNIT"],
    ["Event screen graphics", null, 150000, "UNIT"],
  ]],
  ["Exhibition Stands", [
    ["Basic shell scheme", null, 350000, "UNIT"],
    ["Branded shell scheme", null, 500000, "UNIT"],
    ["Standard custom booth", null, 750000, "UNIT"],
    ["Premium custom booth", null, 1500000, "UNIT"],
  ]],
  ["Drone", [
    ["Event drone coverage", null, 200000, "DAY"],
    ["Cinematic drone shoot", null, 250000, "DAY"],
  ]],
];

// Figures the founder must confirm — printed, never altered. Seeded exactly
// as the table above gives them.
const FLAGS = [
  'Cameras & Capture > "6-channel HD mixer + monitor": BP seeded at 25,000 — a midpoint. The founder\'s cost sheet showed both 30,000 and 20,000 for this line.',
  'Logistics & Welfare > "Local production transport": BP seeded at 40,000 — a midpoint. The founder\'s cost sheet showed both 50,000 and 30,000 for this line.',
  'Cameras & Capture > "B-roll camera package" BP 100,000 vs "Professional camera package" BP 30,000: seeded exactly as the rate card gives them, but the B-roll package costs more than 3x the professional one. May be correct if one is a multi-camera kit, but reads backwards at a glance — please confirm.',
];

async function seedCatalogue() {
  console.log("Seeding rate-card departments and services...");

  const existingMaxSortOrder = await db.serviceCategory.aggregate({ _max: { sortOrder: true } });
  let nextSortOrder = (existingMaxSortOrder._max.sortOrder ?? -1) + 1;

  let deptCreated = 0, deptExisting = 0, svcCreated = 0, svcExisting = 0;

  for (const [deptNameRaw, services] of CATALOGUE) {
    const deptName = deptNameRaw.trim();

    let dept = await db.serviceCategory.findUnique({ where: { name: deptName } });
    if (dept) {
      deptExisting++;
      console.log(`  - department "${deptName}": already present (id ${dept.id}).`);
    } else {
      dept = await db.serviceCategory.create({
        data: { name: deptName, sortOrder: nextSortOrder++ },
      });
      deptCreated++;
      console.log(`  - department "${deptName}": created (id ${dept.id}).`);
    }

    for (const [nameRaw, bp, cp, unit] of services) {
      const name = nameRaw.trim();
      const existing = await db.serviceItem.findFirst({
        where: { categoryId: dept.id, name },
      });
      if (existing) {
        svcExisting++;
        console.log(`      - "${name}": already present (id ${existing.id}), skipped.`);
        continue;
      }

      const created = await db.serviceItem.create({
        data: {
          categoryId: dept.id,
          name,
          standardCost: bp,
          standardClientRate: cp,
          unit,
        },
      });
      svcCreated++;
      console.log(`      - "${name}": created (id ${created.id}), BP ${bp ?? "—"} / CP ${cp ?? "—"} / ${unit}.`);
    }
  }

  console.log(
    `Catalogue seed complete: ${deptCreated} department(s) created, ${deptExisting} already present; ` +
    `${svcCreated} service(s) created, ${svcExisting} already present.`
  );

  console.log("\nFigures needing the founder's confirmation:");
  for (const [i, f] of FLAGS.entries()) console.log(`  ${i + 1}. ${f}`);
}

// Link every EventTemplateItem whose name matches a ServiceItem name
// case-insensitively after trimming. Never renamed or loosened to raise the
// match count — an unmatched line is a real signal the catalogue is
// missing that service, and the founder needs to see it.
//
// EventTemplateItem.serviceItemId carries no database foreign key (bare
// String?), and the Catalogue tab allows a founder to delete a ServiceItem.
// So a link made by an earlier run can go stale: the id is still on the
// row, but no ServiceItem with that id exists any more. Every run
// re-verifies every existing link actually resolves — a stale one is
// reported as a BROKEN LINK, its own category, not silently counted as
// matched and not silently re-resolved into some other candidate.
async function linkTemplates() {
  console.log("\nLinking template lines to the catalogue...");

  const allServices = await db.serviceItem.findMany({ select: { id: true, name: true } });
  const serviceIds = new Set(allServices.map((s) => s.id));
  // Case-insensitive, trimmed lookup. Collect every service under a given
  // fold so an ambiguous fold (matches more than one distinct service) is
  // reported rather than silently resolved by picking one.
  const byFold = new Map();
  for (const s of allServices) {
    const fold = s.name.trim().toLowerCase();
    if (!byFold.has(fold)) byFold.set(fold, []);
    byFold.get(fold).push(s);
  }

  const templateItems = await db.eventTemplateItem.findMany({
    include: { template: { select: { name: true } } },
    orderBy: [{ templateId: "asc" }, { sortOrder: "asc" }],
  });

  // These four counts partition templateItems.length exactly — every line
  // falls into exactly one category, so none is counted twice.
  let matched = 0, alreadyLinked = 0, brokenLinks = 0, ambiguous = 0;
  const brokenList = [];
  const ambiguousList = [];
  const unmatchedList = [];

  for (const item of templateItems) {
    if (item.serviceItemId) {
      // Previously linked. Re-verify the id still resolves to a real
      // ServiceItem rather than trusting the stored id at face value.
      if (serviceIds.has(item.serviceItemId)) {
        alreadyLinked++;
        matched++;
      } else {
        brokenLinks++;
        brokenList.push(
          `[${item.template.name}] "${item.name}" -> serviceItemId ${item.serviceItemId} no longer exists (service was deleted)`
        );
      }
      continue;
    }

    const fold = item.name.trim().toLowerCase();
    const candidates = byFold.get(fold) ?? [];

    if (candidates.length === 1) {
      await db.eventTemplateItem.update({
        where: { id: item.id },
        data: { serviceItemId: candidates[0].id },
      });
      matched++;
      console.log(`  - [${item.template.name}] "${item.name}" -> "${candidates[0].name}" (id ${candidates[0].id})`);
    } else if (candidates.length > 1) {
      ambiguous++;
      ambiguousList.push(`[${item.template.name}] "${item.name}" (ambiguous: matches ${candidates.length} services)`);
    } else {
      unmatchedList.push(`[${item.template.name}] "${item.name}"`);
    }
  }

  console.log(
    `\nTemplate link summary: ${templateItems.length} line(s) total, ${matched} matched ` +
    `(${alreadyLinked} already linked from a previous run), ${brokenLinks} broken link(s), ` +
    `${ambiguous} ambiguous, ${unmatchedList.length} unmatched.`
  );
  if (brokenList.length > 0) {
    console.log("Broken links (previously linked to a catalogue service that no longer exists):");
    for (const b of brokenList) console.log(`  - ${b}`);
  }
  if (ambiguousList.length > 0) {
    console.log("Ambiguous template lines (name matches more than one catalogue service):");
    for (const a of ambiguousList) console.log(`  - ${a}`);
  }
  if (unmatchedList.length > 0) {
    console.log("Unmatched template lines (no catalogue service behind them yet):");
    for (const u of unmatchedList) console.log(`  - ${u}`);
  }
}

async function main() {
  await seedCatalogue();
  await linkTemplates();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
