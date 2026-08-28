// Seed: three reference EventTemplates (One-day production, Multi-day
// conference, Lecture series), transcribed from D1Z's own client invoices
// (PTDF, SciBiz, SPE).
//
// Costs are intentionally left null. Those source documents show the
// client-facing Official Price, not what the job cost D1Z to run — seeding
// Base Price from them would put invented figures into the founder's own
// costing, which then drives margin and vendor payments. No separate
// equipment-rental cost sheet with matching lines was found in this
// repository to draw a real cost from, so every line here is unpriced
// (defaultUnitCost: null) rather than guessed.
//
// Idempotent: EventTemplate.name is @unique, so each template is looked up
// by name first and skipped (not recreated) if it already exists. Safe to
// run more than once.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// section, name, qty, days, enabledByDefault
function item(section, name, opts = {}) {
  const { qty = 1, days = 1, enabled = true } = opts;
  return {
    section,
    name,
    defaultQuantity: qty,
    defaultDays: days,
    defaultUnitCost: null,
    enabledByDefault: enabled,
  };
}

const AV = "AUDIO VISUAL";
const BRANDING = "BRANDING";
const PERSONNEL = "PERSONNEL";
const CONTENT = "CONTENT CREATION";
// markupFor() (src/lib/pricing.ts) keys on the SECTION string, not the line
// name — a construction line filed under AUDIO VISUAL prices as equipment
// hire (2.0x default) instead of the founder's fabrication ruling (3.5x).
// This section name carries the keywords "stage"/"fabricat" so it scores
// the fabrication rule regardless of rule ordering.
const FABRICATION = "STAGE & SCENIC FABRICATION";

const templates = [
  {
    name: "One-day production",
    description:
      "From D1Z's PTDF invoice: a single-day panel/conference production.",
    items: [
      item(AV, "LED Screen", { qty: 2, days: 1 }),
      item(AV, "Live Streaming"),
      item(AV, "HD Cameras Complete Rig", { qty: 3 }),
      item(AV, "Complete Audio System"),
      item(AV, "6 Channel Video Mixer + Recorder"),
      item(AV, "Stage Lights and Audience Light with Truss Stand"),
      item(PERSONNEL, "Production Personnel", { qty: 6 }),
      item(PERSONNEL, "Photography"),
      // Complimentary on the reference invoice — Official Price 0 on the
      // client invoice, but D1Z still hires and pays for these. They must
      // seed as real cost-sheet lines (enabled, unpriced like every other
      // line here) so a vendor cost and payment request can exist; the
      // founder sets Official Price to 0 when converting, not the absence
      // of a line.
      item(AV, "65 Inch TV with Stands"),
      item(AV, "Goose Mic — Panellist Microphones", { qty: 10 }),
      item(AV, "Background Lights", { qty: 6 }),
      item(PERSONNEL, "Professional Fees"),
    ],
  },
  {
    name: "Multi-day conference",
    description:
      "From D1Z's SciBiz invoice: a three-day conference with branding and decoration.",
    items: [
      item(FABRICATION, "LED Screen + Riser", { qty: 2, days: 3 }),
      item(AV, "Stage TV Monitor & Stand", { qty: 2, days: 3 }),
      item(AV, "Stage Timer Stand & Attendant", { days: 3 }),
      item(AV, "Live Streaming", { days: 3 }),
      item(AV, "HD Camera Chain", { qty: 4, days: 3 }),
      item(AV, "Complete Audio System", { days: 3 }),
      item(AV, "Panellist Microphones", { qty: 8, days: 3 }),
      item(AV, "6 Channel Video Mixer + Recorder", { days: 3 }),
      item(BRANDING, "Stage / Red Carpet / Welcome / Flags Branding"),
      item(BRANDING, "Decoration (Main Hall)"),
      item(AV, "Stage Lights and Audience Light with Truss Stand", { days: 3 }),
      item(AV, "Opening Animation and Partner Animation"),
      item(AV, "Programme Slides"),
      item(AV, "Panellist Chairs and Stools", { qty: 7, days: 3 }),
      item(BRANDING, "Poster Session"),
      item(PERSONNEL, "Production Personnel", { qty: 8, days: 3 }),
      item(PERSONNEL, "Photography", { qty: 2, days: 3 }),
    ],
  },
  {
    name: "Lecture series",
    description:
      "From D1Z's SPE invoice: a lecture-series production with content creation and external branding.",
    items: [
      item(AV, "HD Camera Chain", { qty: 3 }),
      item(FABRICATION, "Stage and Conference Platform Construction"),
      item(AV, "Video Mixer / Technical Presentation / Recorder and Playback"),
      item(AV, "50 Inch Stage Monitor with Stand", { qty: 2 }),
      item(AV, "50 Inch Timer"),
      item(FABRICATION, "LED Screen + Riser", { qty: 4 }),
      item(AV, "Complete PA System including Speakers and Panellist Mics"),
      item(AV, "Streaming Equipment"),
      item(AV, "Programme Slides / Animation"),
      item(AV, "Stage Lights and Audience Light with Truss"),
      item(PERSONNEL, "Photography", { qty: 2 }),
      item(PERSONNEL, "Production Personnel", { qty: 6 }),
      item(CONTENT, "Post Production and Editing"),
      item(PERSONNEL, "Professional Fees"),
      item(BRANDING, "External Branding — Red Carpet Background and Gate Banner"),
      item(CONTENT, "Conference Advert Production"),
    ],
  },
];

async function main() {
  console.log("Seeding reference event templates...");

  for (const t of templates) {
    const existing = await db.eventTemplate.findUnique({ where: { name: t.name } });
    if (existing) {
      console.log(`  - "${t.name}": already present (id ${existing.id}), skipped.`);
      continue;
    }

    const created = await db.eventTemplate.create({
      data: {
        name: t.name,
        description: t.description,
        items: {
          create: t.items.map((it, i) => ({ ...it, sortOrder: i })),
        },
      },
      include: { items: true },
    });
    console.log(`  - "${t.name}": created (id ${created.id}), ${created.items.length} items.`);
  }

  console.log("Template seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
