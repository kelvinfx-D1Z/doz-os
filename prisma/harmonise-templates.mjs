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
//   - Idempotent. Every write is preceded by a read that decides whether
//     the row already matches the desired end state; a second run reports
//     every row "already correct" and performs no further writes.
//   - Written trimmed. A stored name with a stray space silently loses its
//     published rate in the pricing lookup (src/app/api/doz/projects/
//     pricing/route.ts) — that failure has already been found once here.
//
// Three-state rule (see src/lib/rate-card.ts): a rate of 0 is a real,
// complimentary price; null is "unpriced". Every comparison below checks
// `!== null && !== undefined`, never truthiness.
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

// Lines that split into several, each with quantity 1 and its own
// serviceItemId. `department: null` (the Riser lines) means: no catalogue
// counterpart exists, so the line keeps its given section text and gets no
// serviceItemId — inventing a match would put someone else's rate on it.
// Splits inherit the original line's sortOrder, defaultDays and
// enabledByDefault; the extra lines get adjacent (sortOrder + 1, + 2, ...)
// sort orders so they stay together.
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

// Lines with no catalogue counterpart — never touched, only reported so the
// founder sees the real gaps (not a naming mismatch this script could fix).
const EXPECTED_UNMATCHED = [
  ["One-day production", "Professional Fees"],
  ["Multi-day conference", "Decoration (Main Hall)"],
  ["Multi-day conference", "Poster Session"],
  ["Lecture series", "Conference Advert Production"],
  ["Lecture series", "Professional Fees"],
  // The two Riser lines the LED Screen + Riser split produces (above) join
  // this same "no counterpart" state, reported separately below since they
  // do not exist until this script runs.
];

const TEMPLATES = [
  { name: "One-day production", direct: ONE_DAY_DIRECT, splits: ONE_DAY_SPLITS },
  { name: "Multi-day conference", direct: MULTI_DAY_DIRECT, splits: MULTI_DAY_SPLITS },
  { name: "Lecture series", direct: LECTURE_DIRECT, splits: LECTURE_SPLITS },
];

// ------------------------------------------------------------
// Catalogue update
// ------------------------------------------------------------
async function updateCatalogue() {
  console.log("Updating rate-card catalogue (LED screen rename/correction, new per-sqm row)...");

  const dept = await db.serviceCategory.findUnique({ where: { name: LED_DEPARTMENT } });
  if (!dept) {
    console.log(`  ! department "${LED_DEPARTMENT}" not found — LED catalogue update skipped, needs investigation.`);
    return;
  }

  // Rename + CP correction on the existing row. seed-rate-card.mjs never
  // updates an existing row, so this write only ever happens here.
  let ledRow = await db.serviceItem.findFirst({ where: { categoryId: dept.id, name: LED_OLD_NAME } });
  if (!ledRow) {
    // Not found under the old name — either already renamed by a previous
    // run of this script, or genuinely missing. Check the new name before
    // giving up.
    ledRow = await db.serviceItem.findFirst({ where: { categoryId: dept.id, name: LED_NEW_NAME } });
  }

  if (!ledRow) {
    console.log(`  ! neither "${LED_OLD_NAME}" nor "${LED_NEW_NAME}" found under "${LED_DEPARTMENT}" — skipped, needs investigation.`);
  } else if (ledRow.name === LED_NEW_NAME && ledRow.standardClientRate === LED_NEW_CP) {
    console.log(`  - "${LED_NEW_NAME}" (id ${ledRow.id}): already correct (BP ${ledRow.standardCost ?? "—"} / CP ${LED_NEW_CP}), skipped.`);
  } else {
    const updated = await db.serviceItem.update({
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
  const existingSqm = await db.serviceItem.findFirst({ where: { categoryId: dept.id, name: LED_SQM_NAME } });
  if (existingSqm) {
    console.log(`  - "${LED_SQM_NAME}": already present (id ${existingSqm.id}), skipped.`);
  } else {
    const created = await db.serviceItem.create({
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
async function resolveService(department, name) {
  const dept = await db.serviceCategory.findUnique({ where: { name: department.trim() } });
  if (!dept) {
    console.log(`  ! department "${department}" not found — cannot resolve "${name}".`);
    return null;
  }
  const items = await db.serviceItem.findMany({ where: { categoryId: dept.id, name: name.trim() } });
  if (items.length !== 1) {
    console.log(`  ! "${department}" > "${name}": expected exactly 1 catalogue match, found ${items.length} — skipped.`);
    return null;
  }
  return items[0];
}

async function findLine(templateId, name) {
  return db.eventTemplateItem.findFirst({ where: { templateId, name: name.trim() } });
}

// A direct 1:1 mapping only ever touches name/section/serviceItemId — never
// quantity, days, sortOrder or enabledByDefault.
async function applyDirect(templateId, templateLabel, originalName, targetName, department) {
  const service = await resolveService(department, targetName);
  if (!service) return "error";

  let row = await findLine(templateId, originalName);
  if (!row) row = await findLine(templateId, targetName);
  if (!row) {
    console.log(`  ! [${templateLabel}] neither "${originalName}" nor "${targetName}" found — skipped, needs investigation.`);
    return "error";
  }

  const alreadyCorrect = row.name === targetName && row.section === department && row.serviceItemId === service.id;
  if (alreadyCorrect) {
    console.log(`  - [${templateLabel}] "${targetName}" (section "${department}", serviceItemId ${service.id}): already correct, skipped.`);
    return "already-correct";
  }

  await db.eventTemplateItem.update({
    where: { id: row.id },
    data: { name: targetName, section: department, serviceItemId: service.id },
  });
  console.log(
    `  - [${templateLabel}] "${row.name}" -> "${targetName}" ` +
    `(section "${row.section}" -> "${department}", serviceItemId -> ${service.id}).`
  );
  return "updated";
}

// A split turns one line into several, each landing at quantity 1 with its
// own serviceItemId (or none, for a line with no catalogue counterpart).
// defaultDays, enabledByDefault and (for the anchor) sortOrder are
// inherited from the original line; the extra lines get sortOrder + 1,
// + 2, ... so they stay adjacent to it.
async function applySplit(templateId, templateLabel, originalName, splitDefs) {
  const [anchorDef, ...extraDefs] = splitDefs;

  let anchor = await findLine(templateId, originalName);
  if (!anchor) anchor = await findLine(templateId, anchorDef.name);
  if (!anchor) {
    console.log(`  ! [${templateLabel}] neither "${originalName}" nor "${anchorDef.name}" found — split skipped, needs investigation.`);
    return;
  }

  const anchorService = anchorDef.department ? await resolveService(anchorDef.department, anchorDef.name) : null;
  if (anchorDef.department && !anchorService) return;
  const anchorServiceId = anchorService ? anchorService.id : null;

  const anchorAlreadyCorrect =
    anchor.name === anchorDef.name &&
    anchor.section === anchorDef.section &&
    anchor.serviceItemId === anchorServiceId &&
    anchor.defaultQuantity === 1;
  if (anchorAlreadyCorrect) {
    console.log(`  - [${templateLabel}] "${anchorDef.name}" (section "${anchorDef.section}", serviceItemId ${anchorServiceId ?? "—"}): already correct, skipped.`);
  } else {
    await db.eventTemplateItem.update({
      where: { id: anchor.id },
      data: { name: anchorDef.name, section: anchorDef.section, serviceItemId: anchorServiceId, defaultQuantity: 1 },
    });
    console.log(
      `  - [${templateLabel}] "${anchor.name}" -> "${anchorDef.name}" (split of "${originalName}") ` +
      `(section "${anchor.section}" -> "${anchorDef.section}", serviceItemId -> ${anchorServiceId ?? "—"}, quantity -> 1).`
    );
  }

  // The anchor's defaultDays/enabledByDefault/sortOrder are never touched
  // above, so they are safe to read back from the row fetched before the
  // update for sourcing the extra lines below, on every run.
  for (const [i, def] of extraDefs.entries()) {
    const service = def.department ? await resolveService(def.department, def.name) : null;
    if (def.department && !service) continue;
    const serviceId = service ? service.id : null;

    const existing = await findLine(templateId, def.name);
    const desired = {
      section: def.section,
      serviceItemId: serviceId,
      defaultQuantity: 1,
      defaultDays: anchor.defaultDays,
      enabledByDefault: anchor.enabledByDefault,
    };

    if (existing) {
      const alreadyCorrect =
        existing.section === desired.section &&
        existing.serviceItemId === desired.serviceItemId &&
        existing.defaultQuantity === desired.defaultQuantity &&
        existing.defaultDays === desired.defaultDays &&
        existing.enabledByDefault === desired.enabledByDefault;
      if (alreadyCorrect) {
        console.log(`  - [${templateLabel}] "${def.name}" (section "${def.section}", serviceItemId ${serviceId ?? "—"}): already correct, skipped.`);
      } else {
        await db.eventTemplateItem.update({ where: { id: existing.id }, data: desired });
        console.log(`  - [${templateLabel}] "${def.name}" (split of "${originalName}"): corrected to section "${def.section}", serviceItemId ${serviceId ?? "—"}.`);
      }
    } else {
      const created = await db.eventTemplateItem.create({
        data: {
          templateId,
          name: def.name,
          ...desired,
          defaultUnitCost: null,
          sortOrder: anchor.sortOrder + i + 1,
        },
      });
      console.log(
        `  - [${templateLabel}] "${def.name}" (split of "${originalName}"): created (id ${created.id}), ` +
        `section "${def.section}", serviceItemId ${serviceId ?? "—"}, sortOrder ${created.sortOrder}.`
      );
    }
  }
}

async function linkTemplates() {
  console.log("\nLinking template lines to the catalogue...");

  for (const t of TEMPLATES) {
    const template = await db.eventTemplate.findUnique({ where: { name: t.name } });
    if (!template) {
      console.log(`  ! template "${t.name}" not found — skipped, needs investigation.`);
      continue;
    }
    console.log(`\n[${t.name}]`);
    for (const [originalName, targetName, department] of t.direct) {
      await applyDirect(template.id, t.name, originalName, targetName, department);
    }
    for (const [originalName, splitDefs] of t.splits) {
      await applySplit(template.id, t.name, originalName, splitDefs);
    }
  }

  console.log("\nLines with no catalogue counterpart (left untouched, reported for the founder):");
  for (const [templateName, name] of EXPECTED_UNMATCHED) {
    console.log(`  - [${templateName}] "${name}"`);
  }
  console.log('  - [Multi-day conference] "Riser" (split of "LED Screen + Riser" — no catalogue counterpart)');
  console.log('  - [Lecture series] "Riser" (split of "LED Screen + Riser" — no catalogue counterpart)');

  const totalLines = await db.eventTemplateItem.count({ where: { template: { name: { in: TEMPLATES.map((t) => t.name) } } } });
  const unlinked = await db.eventTemplateItem.findMany({
    where: { template: { name: { in: TEMPLATES.map((t) => t.name) } }, serviceItemId: null },
    include: { template: { select: { name: true } } },
    orderBy: [{ templateId: "asc" }, { sortOrder: "asc" }],
  });
  console.log(`\nTemplate line total across the three templates: ${totalLines}.`);
  console.log(`Lines with no serviceItemId (expected gaps, listed above, should match this list exactly):`);
  for (const u of unlinked) console.log(`  - [${u.template.name}] "${u.name}"`);
}

async function main() {
  await updateCatalogue();
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
