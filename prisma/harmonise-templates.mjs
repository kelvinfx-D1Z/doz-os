// Seed: harmonises the three reference EventTemplates (seed-templates.mjs)
// with the rate-card catalogue (seed-rate-card.mjs) so a project started
// from a template arrives with real costs instead of an empty column.
//
// The bug this fixes: BP flows through EventTemplateItem.serviceItemId (an
// id — see src/app/api/doz/projects/route.ts); CP flows separately through
// the pricing route's name|category fold (src/lib/pricing.ts rateKey),
// where ProjectService.category is the template line's `section`. The two
// templates named the same equipment differently than the catalogue, so
// neither matcher ever agreed and 0 of 45 lines linked up. Fixing this
// means every mapped line needs all three set together: the catalogue
// service's exact name, the department as its section, and the service's
// id — setting only the id gets BP and silently leaves CP on the markup
// formula, which is the bug re-appearing in a new place.
//
// This is unlike most other scripts in this plan: it is committed and it
// WRITES TO THE LIVE PRODUCTION DATABASE. It is:
//
//   - Never destructive. No deleteMany/delete/updateMany/reset. Only
//     `update` (on rows this task names) and `create` (for the new
//     per-sqm catalogue row and for lines a split produces) are used.
//     ProjectService, Project, Invoice, Quotation, Receipt and
//     PaymentRequest rows are never read or written by this script.
//   - Idempotent on IDENTITY only. Every write is preceded by a read that
//     decides whether the row already matches the desired name/section/
//     serviceItemId; a second run reports every row "already correct" and
//     writes nothing further. A split line's defaultQuantity/defaultDays/
//     enabledByDefault are set only once — at the moment a still-unsplit
//     original row is migrated into its first split identity, or when a
//     brand-new extra split row is created. Once a line exists with the
//     right identity, this script never again touches its quantity, day
//     count or enabled flag, because the founder can and does change them
//     ("they can be increase per production" — his stated reason for
//     wanting personnel splittable at all). Re-running this script must
//     never silently revert a quantity he raised by hand.
//   - Written trimmed. A stored name with a stray space silently loses its
//     published rate in the pricing lookup (src/app/api/doz/projects/
//     pricing/route.ts) — that failure has already been found once here.
//
// Three-state rule (see src/lib/rate-card.ts): a rate of 0 is a real,
// complimentary price; null is "unpriced". This script never reads back or
// branches on an EXISTING rate's value — the two catalogue figures it
// writes (LED_NEW_CP, LED_SQM_BP/LED_SQM_CP) are literal constants, not
// derived from a comparison that could confuse 0 with "unset". Every
// identity check elsewhere in this file (row.name, row.section,
// row.serviceItemId, a resolved service's id) uses strict `===`/`!==`
// against real values, never a falsy/truthy shortcut — but that is because
// none of those values is ever legitimately 0 or empty, not because of a
// null-vs-0 guard like rate-card.ts's.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// ============================================================
// Catalogue changes (docs/superpowers/specs/2026-08-29-template-harmonisation.md)
//
// seed-rate-card.mjs is create-only by design, so it will never touch the
// existing "LED screen (6sqm)" row — that rename and CP correction need an
// explicit, reported write here instead.
// ============================================================
const LED_DEPARTMENT = "Displays";
const LED_OLD_NAME = "LED screen (6sqm)";
const LED_NEW_NAME = "LED screen (3m x 2m)";
const LED_NEW_CP = 250000;

const LED_SQM_NAME = "LED wall (per sqm)";
const LED_SQM_BP = 25000;
const LED_SQM_CP = 41667;
const LED_SQM_UNIT = "SQM";

// ============================================================
// Template line mapping. For every direct entry: set the line's `name` to
// the service name, its `section` to the department, and its
// `serviceItemId` to that service's id — nothing else on the row changes.
// ============================================================

// [ originalName, targetName, department ][]
const ONE_DAY_DIRECT = [
  ["LED Screen", "LED screen (3m x 2m)", "Displays"],
  ["Live Streaming", "Livestreaming", "Streaming & Broadcast"],
  ["HD Cameras Complete Rig", "Professional camera package", "Cameras & Capture"],
  ["Complete Audio System", "Standard event sound", "Sound"],
  ["6 Channel Video Mixer + Recorder", "6-channel HD mixer + monitor", "Cameras & Capture"],
  ["Stage Lights and Audience Light with Truss Stand", "Stage & ambient lighting", "Lighting"],
  ["Photography", "Photographer", "Personnel"],
  ["65 Inch TV with Stands", "TV + stand", "Displays"],
  ["Goose Mic — Panellist Microphones", "Wired microphone", "Sound"],
  ["Background Lights", "LED par / wash light", "Lighting"],
];

const MULTI_DAY_DIRECT = [
  ["Stage TV Monitor & Stand", "TV + stand", "Displays"],
  ["Stage Timer Stand & Attendant", "Stage timer", "Displays"],
  ["Live Streaming", "Livestreaming", "Streaming & Broadcast"],
  ["HD Camera Chain", "Professional camera package", "Cameras & Capture"],
  ["Complete Audio System", "Standard event sound", "Sound"],
  ["Panellist Microphones", "Wired microphone", "Sound"],
  ["6 Channel Video Mixer + Recorder", "6-channel HD mixer + monitor", "Cameras & Capture"],
  ["Stage / Red Carpet / Welcome / Flags Branding", "Backdrop branding", "Branding & Print"],
  ["Stage Lights and Audience Light with Truss Stand", "Stage & ambient lighting", "Lighting"],
  ["Opening Animation and Partner Animation", "Animated logo", "Motion Graphics"],
  ["Programme Slides", "Event screen graphics", "Motion Graphics"],
  ["Photography", "Photographer", "Personnel"],
];

const LECTURE_DIRECT = [
  ["HD Camera Chain", "Professional camera package", "Cameras & Capture"],
  ["Stage and Conference Platform Construction", "Stage", "Stage & Scenic Fabrication"],
  ["Video Mixer / Technical Presentation / Recorder and Playback", "6-channel HD mixer + monitor", "Cameras & Capture"],
  ["50 Inch Stage Monitor with Stand", "TV + stand", "Displays"],
  ["50 Inch Timer", "Stage timer", "Displays"],
  ["Complete PA System including Speakers and Panellist Mics", "Standard event sound", "Sound"],
  ["Streaming Equipment", "Livestreaming", "Streaming & Broadcast"],
  ["Programme Slides / Animation", "Event screen graphics", "Motion Graphics"],
  ["Stage Lights and Audience Light with Truss", "Stage & ambient lighting", "Lighting"],
  ["Photography", "Photographer", "Personnel"],
  ["Post Production and Editing", "Basic event edit", "Post-Production"],
  ["External Branding — Red Carpet Background and Gate Banner", "Backdrop branding", "Branding & Print"],
];

// Lines that split into several, each carrying its own serviceItemId (or
// none, for a line with no catalogue counterpart — `department: null`,
// the Riser lines). quantity 1 / defaultDays / enabledByDefault are set
// ONLY at the moment a produced line first comes into existence (the
// original row's one-time migration into its first split identity, or a
// brand-new extra row's creation) — see the module header. A later run
// only re-verifies name/section/serviceItemId. The extra lines get
// adjacent (sortOrder + 1, + 2, ...) sort orders so they stay together.
const PRODUCTION_PERSONNEL_SPLIT = [
  { name: "Production manager", section: "Personnel", department: "Personnel" },
  { name: "Videographer", section: "Personnel", department: "Personnel" },
  { name: "Camera assistant", section: "Personnel", department: "Personnel" },
];
const PANELLIST_CHAIRS_SPLIT = [
  { name: "Panel chair", section: "Furniture", department: "Furniture" },
  { name: "High stool", section: "Furniture", department: "Furniture" },
];
const LED_RISER_SPLIT = [
  { name: "LED screen (3m x 2m)", section: "Displays", department: "Displays" },
  { name: "Riser", section: "Stage & Scenic Fabrication", department: null },
];

// [ originalName, splitDefs ][]
const ONE_DAY_SPLITS = [["Production Personnel", PRODUCTION_PERSONNEL_SPLIT]];
const MULTI_DAY_SPLITS = [
  ["Production Personnel", PRODUCTION_PERSONNEL_SPLIT],
  ["Panellist Chairs and Stools", PANELLIST_CHAIRS_SPLIT],
  ["LED Screen + Riser", LED_RISER_SPLIT],
];
const LECTURE_SPLITS = [
  ["Production Personnel", PRODUCTION_PERSONNEL_SPLIT],
  ["LED Screen + Riser", LED_RISER_SPLIT],
];

// Lines with no catalogue counterpart — never touched, only reported so
// the founder sees the real gaps. Includes the two Riser lines the LED
// Screen + Riser splits produce, which start in this state from the
// moment they are created. Checked against the live "no serviceItemId"
// list by set difference below (not eyeballed) — see linkTemplates.
const EXPECTED_UNMATCHED = [
  ["One-day production", "Professional Fees"],
  ["Multi-day conference", "Decoration (Main Hall)"],
  ["Multi-day conference", "Poster Session"],
  ["Multi-day conference", "Riser"],
  ["Lecture series", "Conference Advert Production"],
  ["Lecture series", "Professional Fees"],
  ["Lecture series", "Riser"],
];

const TEMPLATES = [
  { name: "One-day production", direct: ONE_DAY_DIRECT, splits: ONE_DAY_SPLITS },
  { name: "Multi-day conference", direct: MULTI_DAY_DIRECT, splits: MULTI_DAY_SPLITS },
  { name: "Lecture series", direct: LECTURE_DIRECT, splits: LECTURE_SPLITS },
];

// ------------------------------------------------------------
// Catalogue update
// ------------------------------------------------------------
async function updateCatalogue(client) {
  console.log("Updating rate-card catalogue (LED screen rename/correction, new per-sqm row)...");

  const dept = await client.serviceCategory.findUnique({ where: { name: LED_DEPARTMENT } });
  if (!dept) {
    console.log(`  ! department "${LED_DEPARTMENT}" not found — LED catalogue update skipped, needs investigation.`);
    return;
  }

  // Rename + CP correction on the existing row. seed-rate-card.mjs never
  // updates an existing row, so this write only ever happens here.
  let ledRow = await client.serviceItem.findFirst({ where: { categoryId: dept.id, name: LED_OLD_NAME } });
  if (!ledRow) {
    // Not found under the old name — either already renamed by a previous
    // run of this script, or genuinely missing. Check the new name before
    // giving up.
    ledRow = await client.serviceItem.findFirst({ where: { categoryId: dept.id, name: LED_NEW_NAME } });
  }

  if (!ledRow) {
    console.log(`  ! neither "${LED_OLD_NAME}" nor "${LED_NEW_NAME}" found under "${LED_DEPARTMENT}" — skipped, needs investigation.`);
  } else if (ledRow.name === LED_NEW_NAME && ledRow.standardClientRate === LED_NEW_CP) {
    console.log(`  - "${LED_NEW_NAME}" (id ${ledRow.id}): already correct (BP ${ledRow.standardCost ?? "—"} / CP ${LED_NEW_CP}), skipped.`);
  } else {
    const updated = await client.serviceItem.update({
      where: { id: ledRow.id },
      data: { name: LED_NEW_NAME, standardClientRate: LED_NEW_CP, rateUpdatedAt: new Date() },
    });
    console.log(
      `  - "${ledRow.name}" (id ${ledRow.id}) -> "${updated.name}": CP ${ledRow.standardClientRate ?? "—"} -> ${updated.standardClientRate}, ` +
      `BP unchanged (${updated.standardCost ?? "—"}).`
    );
  }

  // New per-sqm row. Create-only, keyed on DEPARTMENT + NAME like
  // seed-rate-card.mjs.
  const existingSqm = await client.serviceItem.findFirst({ where: { categoryId: dept.id, name: LED_SQM_NAME } });
  if (existingSqm) {
    console.log(`  - "${LED_SQM_NAME}": already present (id ${existingSqm.id}), skipped.`);
  } else {
    const created = await client.serviceItem.create({
      data: {
        categoryId: dept.id,
        name: LED_SQM_NAME,
        standardCost: LED_SQM_BP,
        standardClientRate: LED_SQM_CP,
        unit: LED_SQM_UNIT,
      },
    });
    console.log(`  - "${LED_SQM_NAME}": created (id ${created.id}), BP ${LED_SQM_BP} / CP ${LED_SQM_CP} / ${LED_SQM_UNIT}.`);
  }
}

// ------------------------------------------------------------
// Template linking
// ------------------------------------------------------------

// Resolves (department, name) to exactly one ServiceItem, trimmed. Returns
// null (and logs) rather than guessing a near match — see the module
// header on why an invented match is the worst outcome available here.
async function resolveService(client, department, name) {
  const dept = await client.serviceCategory.findUnique({ where: { name: department.trim() } });
  if (!dept) {
    console.log(`  ! department "${department}" not found — cannot resolve "${name}".`);
    return null;
  }
  const items = await client.serviceItem.findMany({ where: { categoryId: dept.id, name: name.trim() } });
  if (items.length !== 1) {
    console.log(`  ! "${department}" > "${name}": expected exactly 1 catalogue match, found ${items.length} — skipped.`);
    return null;
  }
  return items[0];
}

// Finds the one EventTemplateItem in this template named `name`, folding
// case and trimming — matching how every other matcher in this system
// compares a line name (rateKey, the projects route's seedKey, and
// seed-rate-card.mjs's byFold all lower-case). There is no DB uniqueness
// on (templateId, name), so more than one candidate is reported as
// ambiguous and left alone rather than picked arbitrarily — picking wrong
// here is exactly how a re-run could double a split's personnel cost.
async function findLine(client, templateId, name) {
  const trimmed = name.trim();
  const rows = await client.eventTemplateItem.findMany({
    where: { templateId, name: { equals: trimmed, mode: "insensitive" } },
  });
  if (rows.length > 1) {
    return {
      row: null,
      error: `${rows.length} lines named "${trimmed}" (case-insensitively) already exist in this template — ambiguous, skipped rather than guessing which one.`,
    };
  }
  return { row: rows[0] ?? null, error: null };
}

// A direct 1:1 mapping only ever touches name/section/serviceItemId — never
// quantity, days, sortOrder or enabledByDefault.
async function applyDirect(client, templateId, templateLabel, originalName, targetName, department) {
  const service = await resolveService(client, department, targetName);
  if (!service) return "error";

  let found = await findLine(client, templateId, originalName);
  if (found.error) {
    console.log(`  ! [${templateLabel}] "${originalName}": ${found.error}`);
    return "error";
  }
  let row = found.row;
  if (!row) {
    found = await findLine(client, templateId, targetName);
    if (found.error) {
      console.log(`  ! [${templateLabel}] "${targetName}": ${found.error}`);
      return "error";
    }
    row = found.row;
  }
  if (!row) {
    console.log(`  ! [${templateLabel}] neither "${originalName}" nor "${targetName}" found — skipped, needs investigation.`);
    return "error";
  }

  const alreadyCorrect = row.name === targetName && row.section === department && row.serviceItemId === service.id;
  if (alreadyCorrect) {
    console.log(`  - [${templateLabel}] "${targetName}" (section "${department}", serviceItemId ${service.id}): already correct, skipped.`);
    return "already-correct";
  }

  await client.eventTemplateItem.update({
    where: { id: row.id },
    data: { name: targetName, section: department, serviceItemId: service.id },
  });
  console.log(
    `  - [${templateLabel}] "${row.name}" -> "${targetName}" ` +
    `(section "${row.section}" -> "${department}", serviceItemId -> ${service.id}).`
  );
  return "updated";
}

// A split turns one line into several. Identity (name/section/
// serviceItemId) is re-verified and corrected on every run, exactly like
// applyDirect. Quantity is different: it is set to 1 only at the instant a
// line is first produced — the anchor's one-time migration off the
// original unsplit row, or a brand-new extra row's creation — and never
// again. A founder who raises a produced line's quantity, changes its day
// count, or unticks it must have that survive every later run.
// Returns an array of status strings, one per line the split produces
// (anchor first, then each extra), for the caller's tally.
async function applySplit(client, templateId, templateLabel, originalName, splitDefs) {
  const [anchorDef, ...extraDefs] = splitDefs;
  const statuses = [];

  const originalFound = await findLine(client, templateId, originalName);
  if (originalFound.error) {
    console.log(`  ! [${templateLabel}] "${originalName}": ${originalFound.error}`);
    statuses.push("error");
    return statuses;
  }
  let anchor = originalFound.row;
  const isMigrating = !!anchor; // found under the pre-split name: this is the one-time transition

  if (!anchor) {
    const anchorFound = await findLine(client, templateId, anchorDef.name);
    if (anchorFound.error) {
      console.log(`  ! [${templateLabel}] "${anchorDef.name}": ${anchorFound.error}`);
      statuses.push("error");
      return statuses;
    }
    anchor = anchorFound.row;
  }
  if (!anchor) {
    console.log(`  ! [${templateLabel}] neither "${originalName}" nor "${anchorDef.name}" found — split skipped, needs investigation.`);
    statuses.push("error");
    return statuses;
  }

  const anchorService = anchorDef.department ? await resolveService(client, anchorDef.department, anchorDef.name) : null;
  if (anchorDef.department && !anchorService) {
    statuses.push("error");
    return statuses;
  }
  const anchorServiceId = anchorService ? anchorService.id : null;

  const anchorIdentityCorrect =
    anchor.name === anchorDef.name && anchor.section === anchorDef.section && anchor.serviceItemId === anchorServiceId;
  if (anchorIdentityCorrect) {
    console.log(`  - [${templateLabel}] "${anchorDef.name}" (section "${anchorDef.section}", serviceItemId ${anchorServiceId ?? "—"}): already correct, skipped.`);
    statuses.push("already-correct");
  } else {
    const data = { name: anchorDef.name, section: anchorDef.section, serviceItemId: anchorServiceId };
    if (isMigrating) data.defaultQuantity = 1; // one-time only — never on a later identity fix
    await client.eventTemplateItem.update({ where: { id: anchor.id }, data });
    console.log(
      `  - [${templateLabel}] "${anchor.name}" -> "${anchorDef.name}" (split of "${originalName}") ` +
      `(section "${anchor.section}" -> "${anchorDef.section}", serviceItemId -> ${anchorServiceId ?? "—"}` +
      `${isMigrating ? ", quantity -> 1 (one-time)" : ""}).`
    );
    statuses.push("updated");
  }

  // anchor.defaultDays/enabledByDefault are never written by this script,
  // so they are safe to read back here for sourcing the extra lines below
  // on every run, migrating or not.
  for (const [i, def] of extraDefs.entries()) {
    const service = def.department ? await resolveService(client, def.department, def.name) : null;
    if (def.department && !service) {
      statuses.push("error");
      continue;
    }
    const serviceId = service ? service.id : null;

    const existingFound = await findLine(client, templateId, def.name);
    if (existingFound.error) {
      console.log(`  ! [${templateLabel}] "${def.name}": ${existingFound.error}`);
      statuses.push("error");
      continue;
    }
    const existing = existingFound.row;

    if (existing) {
      // `name` is part of identity, not just section and id: findLine folds case, so a line
      // stored as "videographer" matches and must be normalised to the catalogue's own
      // spelling. Leaving it would strand that row off-spec forever, since a guard that
      // never checks name can never notice it is wrong.
      const identityOk =
        existing.name === def.name && existing.section === def.section && existing.serviceItemId === serviceId;
      if (identityOk) {
        console.log(`  - [${templateLabel}] "${def.name}" (section "${def.section}", serviceItemId ${serviceId ?? "—"}): already correct, skipped.`);
        statuses.push("already-correct");
      } else {
        await client.eventTemplateItem.update({
          where: { id: existing.id },
          data: { name: def.name, section: def.section, serviceItemId: serviceId },
        });
        console.log(
          `  - [${templateLabel}] "${def.name}" (split of "${originalName}"): corrected to name "${def.name}", section "${def.section}", ` +
          `serviceItemId ${serviceId ?? "—"} (quantity/days/enabled left as they are — a founder's own edit is never reverted).`
        );
        statuses.push("updated");
      }
    } else {
      const created = await client.eventTemplateItem.create({
        data: {
          templateId,
          name: def.name,
          section: def.section,
          serviceItemId: serviceId,
          defaultQuantity: 1,
          defaultDays: anchor.defaultDays,
          enabledByDefault: anchor.enabledByDefault,
          defaultUnitCost: null,
          sortOrder: anchor.sortOrder + i + 1,
        },
      });
      console.log(
        `  - [${templateLabel}] "${def.name}" (split of "${originalName}"): created (id ${created.id}), ` +
        `section "${def.section}", serviceItemId ${serviceId ?? "—"}, quantity 1, days ${created.defaultDays}, sortOrder ${created.sortOrder}.`
      );
      statuses.push("created");
    }
  }

  return statuses;
}

async function linkTemplates(client) {
  console.log("\nLinking template lines to the catalogue...");

  let created = 0, updated = 0, alreadyCorrect = 0, errors = 0;
  const tally = (status) => {
    if (status === "created") created++;
    else if (status === "updated") updated++;
    else if (status === "already-correct") alreadyCorrect++;
    else if (status === "error") errors++;
  };

  for (const t of TEMPLATES) {
    const template = await client.eventTemplate.findUnique({ where: { name: t.name } });
    if (!template) {
      console.log(`  ! template "${t.name}" not found — skipped, needs investigation.`);
      errors++;
      continue;
    }
    console.log(`\n[${t.name}]`);
    for (const [originalName, targetName, department] of t.direct) {
      tally(await applyDirect(client, template.id, t.name, originalName, targetName, department));
    }
    for (const [originalName, splitDefs] of t.splits) {
      const statuses = await applySplit(client, template.id, t.name, originalName, splitDefs);
      for (const s of statuses) tally(s);
    }
  }

  console.log("\nLines with no catalogue counterpart (left untouched, reported for the founder):");
  for (const [templateName, name] of EXPECTED_UNMATCHED) {
    console.log(`  - [${templateName}] "${name}"`);
  }

  const totalLines = await client.eventTemplateItem.count({ where: { template: { name: { in: TEMPLATES.map((t) => t.name) } } } });
  const unlinked = await client.eventTemplateItem.findMany({
    where: { template: { name: { in: TEMPLATES.map((t) => t.name) } }, serviceItemId: null },
    include: { template: { select: { name: true } } },
    orderBy: [{ templateId: "asc" }, { sortOrder: "asc" }],
  });

  console.log(`\nTemplate line total across the three templates: ${totalLines}.`);
  console.log("Lines with no serviceItemId (checked against the expected list above, not eyeballed):");
  for (const u of unlinked) console.log(`  - [${u.template.name}] "${u.name}"`);

  // Assert the unmatched list rather than eyeballing it: set difference
  // between EXPECTED_UNMATCHED and what the live data actually shows.
  const keyOf = (templateName, name) => `${templateName}::${name.trim().toLowerCase()}`;
  const expectedSet = new Set(EXPECTED_UNMATCHED.map(([t, n]) => keyOf(t, n)));
  const actualSet = new Set(unlinked.map((u) => keyOf(u.template.name, u.name)));
  const missingFromActual = [...expectedSet].filter((k) => !actualSet.has(k));
  const unexpectedInActual = [...actualSet].filter((k) => !expectedSet.has(k));

  if (missingFromActual.length === 0 && unexpectedInActual.length === 0) {
    console.log(`\nUnmatched-list check: matches the expected ${expectedSet.size} line(s) exactly.`);
  } else {
    for (const k of missingFromActual) {
      console.log(`  ! expected unmatched but not found unlinked (now has a serviceItemId, or is missing entirely): ${k}`);
      errors++;
    }
    for (const k of unexpectedInActual) {
      console.log(`  ! unexpectedly unlinked, not in the expected list: ${k}`);
      errors++;
    }
  }

  console.log(
    `\nHarmonisation summary: ${created} created, ${updated} updated, ${alreadyCorrect} already correct, ${errors} error(s).`
  );
}

async function main() {
  await updateCatalogue(db);
  await linkTemplates(db);
}

// Import-safe: this module is imported by its own verification scripts (to
// exercise applySplit/applyDirect inside a rollback transaction) without
// running the live harmonisation as a side effect of import. main() only
// runs when this file is executed directly.
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

export {
  db,
  updateCatalogue,
  linkTemplates,
  applyDirect,
  applySplit,
  findLine,
  resolveService,
  TEMPLATES,
  EXPECTED_UNMATCHED,
  PRODUCTION_PERSONNEL_SPLIT,
  PANELLIST_CHAIRS_SPLIT,
  LED_RISER_SPLIT,
};

if (isMainModule) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
