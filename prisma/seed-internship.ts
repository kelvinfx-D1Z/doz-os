// Seed: Full 12-month NJFP Internship Programme
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  console.log("Seeding NJFP Internship Programme...");

  const interns = await db.user.findMany({ where: { role: "INTERN" } });
  const intern1 = interns[0]; // Operations & Growth
  const intern2 = interns[1]; // Content & Brand

  // Clear existing
  await db.internshipMilestone.deleteMany({});

  // ============================================================
  // INTERN 1: OPERATIONS & GROWTH COORDINATOR
  // ============================================================
  const opsMilestones = [
    // Month 1 — Learn the Business
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 1, phase: "Learn the Business", title: "Study Company Operations", description: "Study company profile, past projects, proposals, invoices, client communications, event workflows, and production workflows.", deliverable: "Understanding of how DOZ operates", kpi: null },
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 1, phase: "Learn the Business", title: "Create Company Master Folder", description: "Build a clean digital workspace with folders: 01 Company Documents, 02 Clients, 03 Proposals, 04 Productions, 05 Events, 06 Marketing, 07 EventCo, 08 SOPs.", deliverable: "A clean and organized digital workspace", kpi: null, assigneeId: intern1?.id },

    // Months 2-3 — Build the Client Database
    { track: "OPERATIONS_GROWTH", monthStart: 2, monthEnd: 3, phase: "Build the Client Database", title: "Research Corporate Organisations", description: "Research and compile corporate organisations: Banks, Oil & Gas, NGOs, Development Agencies, Event companies, Government agencies. For each: company name, contact person, email, opportunity type, next action.", deliverable: "Client database with 100 companies", kpi: "100 companies added", assigneeId: intern1?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 2, monthEnd: 3, phase: "Build the Client Database", title: "Identify Warm Prospects", description: "From the 100 companies, identify 20 warm prospects with clear opportunity types and next actions.", deliverable: "20 warm prospects in CRM", kpi: "20 warm prospects identified", assigneeId: intern1?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 2, monthEnd: 3, phase: "Build the Client Database", title: "Maintain CRM Weekly", description: "Update the CRM every week with new contacts, status changes, and follow-up actions.", deliverable: "CRM updated weekly", kpi: "CRM updated weekly", assigneeId: intern1?.id },

    // Months 3-4 — Proposal System
    { track: "OPERATIONS_GROWTH", monthStart: 3, monthEnd: 4, phase: "Proposal System", title: "Create Media Production Proposal Templates", description: "Create reusable proposal templates for: Corporate Documentary, TV Commercial, Photography, Livestreaming.", deliverable: "4 media production proposal templates", kpi: "4 templates created", assigneeId: intern1?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 3, monthEnd: 4, phase: "Proposal System", title: "Create Event Proposal Templates", description: "Create reusable proposal templates for: Conference coverage, Hybrid events, Registration systems, Event engagement.", deliverable: "4 event proposal templates", kpi: "4 templates created", assigneeId: intern1?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 3, monthEnd: 4, phase: "Proposal System", title: "Build Proposal Library", description: "Organize all templates into a proposal library so future proposals are never created from scratch.", deliverable: "A complete proposal library", kpi: null, assigneeId: intern1?.id },

    // Months 4-6 — SOP Documentation
    { track: "OPERATIONS_GROWTH", monthStart: 4, monthEnd: 6, phase: "SOP Documentation", title: "Document Production SOP", description: "Document how DOZ handles: Client briefing, Pre-production, Equipment preparation, Shooting, File backup, Editing, Delivery.", deliverable: "Production SOP document", kpi: "7 production processes documented", assigneeId: intern1?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 4, monthEnd: 6, phase: "SOP Documentation", title: "Document Event SOP", description: "Document: Registration, Check-in, Venue setup, Livestream setup, Speaker management, Post-event reporting.", deliverable: "Event SOP document", kpi: "6 event processes documented", assigneeId: intern1?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 4, monthEnd: 6, phase: "SOP Documentation", title: "Compile Operations Manual", description: "Combine all SOPs into the Digit One Zero Operations Manual.", deliverable: "The DOZ Operations Manual", kpi: null, assigneeId: intern1?.id },

    // Months 6-12 — Business Development
    { track: "OPERATIONS_GROWTH", monthStart: 6, monthEnd: 12, phase: "Business Development", title: "Research Opportunities", description: "Research upcoming conferences, industry exhibitions, government tenders, corporate anniversaries, NGO projects.", deliverable: "Weekly opportunity tracker", kpi: "5 potential clients identified weekly", assigneeId: intern1?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 6, monthEnd: 12, phase: "Business Development", title: "Maintain Opportunity Tracker", description: "Maintain opportunity tracker, follow-up schedule, and proposal calendar.", deliverable: "Live opportunity tracker + follow-up calendar", kpi: "2 proposals in progress weekly", assigneeId: intern1?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 6, monthEnd: 12, phase: "Business Development", title: "Submit Weekly BD Report", description: "Submit a weekly report: clients identified, proposals in progress, conferences requiring coverage, partnership opportunities.", deliverable: "Weekly BD report", kpi: "Weekly report submitted", assigneeId: intern1?.id },
  ];

  // ============================================================
  // INTERN 2: CONTENT & BRAND COORDINATOR
  // ============================================================
  const contentMilestones = [
    // Month 1 — Brand Immersion
    { track: "CONTENT_BRAND", monthStart: 1, monthEnd: 1, phase: "Brand Immersion", title: "Study Brand Assets", description: "Study previous projects, documentary work, event productions, photography, website, and social media.", deliverable: "Brand understanding document", kpi: null, assigneeId: intern2?.id },
    { track: "CONTENT_BRAND", monthStart: 1, monthEnd: 1, phase: "Brand Immersion", title: "Define Content Pillars", description: "Prepare 7 content pillars: 1) Behind the Scenes, 2) Case Studies, 3) Event Tips, 4) Filmmaking Tips, 5) Client Success Stories, 6) Founder Stories, 7) EventCo Journey.", deliverable: "Content pillar document", kpi: "7 content pillars defined", assigneeId: intern2?.id },

    // Months 2-3 — Social Media
    { track: "CONTENT_BRAND", monthStart: 2, monthEnd: 3, phase: "Social Media", title: "Weekly Behind-the-Scenes Video", description: "Produce 1 behind-the-scenes video per week. Examples: 'How we filmed this documentary.'", deliverable: "1 BTS video/week", kpi: "4 BTS videos/month", assigneeId: intern2?.id },
    { track: "CONTENT_BRAND", monthStart: 2, monthEnd: 3, phase: "Social Media", title: "Weekly Project Spotlight", description: "Produce 1 project spotlight per week. Examples: 'How we covered a 3-day conference.'", deliverable: "1 project spotlight/week", kpi: "4 spotlights/month", assigneeId: intern2?.id },
    { track: "CONTENT_BRAND", monthStart: 2, monthEnd: 3, phase: "Social Media", title: "Weekly Educational Post", description: "Produce 1 educational post per week. Examples: '5 mistakes event organizers make.'", deliverable: "1 educational post/week", kpi: "4 educational posts/month", assigneeId: intern2?.id },
    { track: "CONTENT_BRAND", monthStart: 2, monthEnd: 3, phase: "Social Media", title: "Hit Monthly Content KPI", description: "Maintain minimum 3 posts/week and 12 posts/month across all platforms.", deliverable: "12 posts/month minimum", kpi: "12 posts/month", assigneeId: intern2?.id },

    // Months 3-5 — Website & Portfolio
    { track: "CONTENT_BRAND", monthStart: 3, monthEnd: 5, phase: "Website & Portfolio", title: "Maintain Portfolio", description: "Upload photos, videos, project descriptions, and testimonials to the website portfolio.", deliverable: "Updated portfolio with all past projects", kpi: null, assigneeId: intern2?.id },
    { track: "CONTENT_BRAND", monthStart: 3, monthEnd: 5, phase: "Website & Portfolio", title: "Create Case Studies", description: "Create structured case studies: Client, Challenge, Solution, Result. These become marketing tools.", deliverable: "6 case studies published", kpi: "6 case studies", assigneeId: intern2?.id },

    // Months 5-8 — Founder Branding
    { track: "CONTENT_BRAND", monthStart: 5, monthEnd: 8, phase: "Founder Branding", title: "Weekly Founder Content", description: "Create weekly founder content based on Kelvin's experience in event production, film, documentary, AI/no-code, event tech, and business development. Examples: 'Things I wish I knew before shooting documentaries.', 'How AI is changing events in Nigeria.', 'Behind EventCo: Building an Event Tech Startup.'", deliverable: "1 founder content piece/week", kpi: "4 founder pieces/month", assigneeId: intern2?.id },
    { track: "CONTENT_BRAND", monthStart: 5, monthEnd: 8, phase: "Founder Branding", title: "Build Founder Brand Identity", description: "Position Kelvin as 'Kelvin Keshy — Creative Entrepreneur, Founder of Digit One Zero, Builder of EventCo.'", deliverable: "Consistent founder brand across platforms", kpi: null, assigneeId: intern2?.id },

    // Months 8-12 — Marketing Assets
    { track: "CONTENT_BRAND", monthStart: 8, monthEnd: 10, phase: "Marketing Assets", title: "Create Company Profile", description: "Create a professional company profile in PDF and interactive website version.", deliverable: "Company profile (PDF + web)", kpi: null, assigneeId: intern2?.id },
    { track: "CONTENT_BRAND", monthStart: 8, monthEnd: 10, phase: "Marketing Assets", title: "Create Capability Deck", description: "Create a capability deck covering: Corporate documentaries, Event production, Photography, Livestreaming, Event technology.", deliverable: "Capability deck", kpi: null, assigneeId: intern2?.id },
    { track: "CONTENT_BRAND", monthStart: 10, monthEnd: 12, phase: "Marketing Assets", title: "Create Sales One-Pagers", description: "Create separate one-pagers for: Conferences, NGOs, Corporate events, Government agencies, Documentary production.", deliverable: "5 sales one-pagers", kpi: "5 one-pagers created", assigneeId: intern2?.id },

    // Month 12 — Final Assets
    { track: "CONTENT_BRAND", monthStart: 12, monthEnd: 12, phase: "Final Deliverables", title: "Complete Marketing Asset Library", description: "Ensure by year end: professional website, active social media, case studies, capability deck, proposal library, company profile.", deliverable: "Complete marketing asset library", kpi: null, assigneeId: intern2?.id },
  ];

  for (const m of [...opsMilestones, ...contentMilestones]) {
    await db.internshipMilestone.create({ data: m });
  }

  console.log(`Seeded ${opsMilestones.length} Operations & Growth milestones`);
  console.log(`Seeded ${contentMilestones.length} Content & Brand milestones`);
  console.log("NJFP Internship Programme seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
