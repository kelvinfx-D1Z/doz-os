// Seed: Founder Roadmap (12 months) + Industry News
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  console.log("Seeding Founder Roadmap...");

  const milestones = [
    // QUARTER 1 — Build the Foundation
    { quarter: 1, phase: "Build the Foundation", title: "Build the Company Bible", description: "Create the master document: Mission, Vision, Values, Services, Processes, Pricing, Brand Standards, Org Chart, Communication Standards, Meeting Structure, KPIs.", deliverable: "Company Bible document", category: "SYSTEMS", dueMonth: 1 },
    { quarter: 1, phase: "Build the Foundation", title: "Document EVERYTHING", description: "Every project, workflow, proposal, checklist, lesson. By December, nothing important should exist only inside your head.", deliverable: "Documented processes", category: "SYSTEMS", dueMonth: 3 },
    { quarter: 1, phase: "Build the Foundation", title: "Financial Dashboard", description: "Know revenue, expenses, profit, cashflow, pipeline, average project value, lead conversion, MRR. Every Monday.", deliverable: "Financial dashboard live", category: "SYSTEMS", dueMonth: 1 },
    { quarter: 1, phase: "Build the Foundation", title: "Standardise Services", description: "Stop selling 'we do media.' Sell products: Corporate Documentary Package, Conference Coverage, Hybrid Event, Photography, Event Registration, Livestream, Podcast packages.", deliverable: "7 standardized service packages", category: "REVENUE", dueMonth: 3 },

    // QUARTER 2 — Build the Growth Engine
    { quarter: 2, phase: "Build the Growth Engine", title: "Weekly Sales System", description: "Every week: Research 20 companies, Contact 10, Follow-up existing clients, Meet 1 new potential client. No exceptions.", deliverable: "Sales system running weekly", category: "REVENUE", dueMonth: 4 },
    { quarter: 2, phase: "Build the Growth Engine", title: "Weekly Marketing", description: "Every week: LinkedIn founder story, case study, behind the scenes, educational post, website update, newsletter.", deliverable: "Weekly content calendar", category: "BRAND", dueMonth: 4 },
    { quarter: 2, phase: "Build the Growth Engine", title: "Partnerships", description: "Meet equipment rental companies, event planners, hotels, conference centres, NGOs, government agencies, creative agencies, software companies.", deliverable: "Partnership pipeline", category: "REVENUE", dueMonth: 6 },

    // QUARTER 3 — Build Assets
    { quarter: 3, phase: "Build Assets", title: "Proposal Library", description: "Create reusable proposal templates for all service packages.", deliverable: "Proposal library", category: "ASSETS", dueMonth: 7 },
    { quarter: 3, phase: "Build Assets", title: "Marketing Assets", description: "Company Profile, Capability Deck, Pricing Calculator, Client Onboarding Pack, Brand Guide, Contract Templates, Invoice Templates.", deliverable: "Complete marketing asset library", category: "ASSETS", dueMonth: 8 },
    { quarter: 3, phase: "Build Assets", title: "Fiestivo.com — Build or Validate", description: "Decide: build or validate. Don't let it drift. Interview event organisers, run pilots, collect testimonials, improve.", deliverable: "Fiestivo validation decision", category: "PRODUCTS", dueMonth: 9 },
    { quarter: 3, phase: "Build Assets", title: "FounderOS Development", description: "Continue building FounderOS. First use it to run DOZ internally, then package and sell it.", deliverable: "FounderOS internal adoption", category: "PRODUCTS", dueMonth: 9 },

    // QUARTER 4 — Scale
    { quarter: 4, phase: "Scale", title: "Delegate Operations", description: "Delegate scheduling, proposal preparation, social media, website updates, CRM, research, documentation, client follow-ups.", deliverable: "Delegation plan executed", category: "PEOPLE", dueMonth: 10 },
    { quarter: 4, phase: "Scale", title: "Never Delegate: Vision & Relationships", description: "Never delegate: Vision, Relationships, Negotiation, Hiring, Creative Direction, Major client meetings, Company culture.", deliverable: "Clear delegation boundaries", category: "PEOPLE", dueMonth: 10 },
    { quarter: 4, phase: "Scale", title: "Quarterly CEO Retreat", description: "Take one day away. Answer: What generated revenue? What wasted time? Which clients to stop/pursue? What to automate/delegate? What new service/product?", deliverable: "Q4 retreat completed", category: "SYSTEMS", dueMonth: 12 },
    { quarter: 4, phase: "Scale", title: "Year-End Review", description: "By end of year: Operations Coordinator, Brand & Content Coordinator, CEO Dashboard, Proposal Library, Knowledge Base, CRM, Marketing System, SOPs, Documented Services, Fiestivo validated, strong LinkedIn, modern website, case studies, BD pipeline, financial dashboard.", deliverable: "Year-end review document", category: "SYSTEMS", dueMonth: 12 },
  ];

  for (const m of milestones) {
    const existing = await db.founderMilestone.findFirst({ where: { title: m.title } });
    if (!existing) await db.founderMilestone.create({ data: m });
  }
  console.log(`Seeded ${milestones.length} founder milestones`);

  // Industry News
  const news = [
    { title: "Nigeria's Energy Transition: What Corporates Need to Know", url: "https://www.energyvoice.com/africa/nigeria/", source: "Energy Voice", category: "ENERGY", summary: "Latest developments in Nigeria's energy sector and opportunities for event producers.", publishedAt: new Date(Date.now() - 2 * 86400000) },
    { title: "NNPC Awards $50M in New Contracts — Opportunities for Coverage", url: "https://nairametrics.com/", source: "Nairametrics", category: "ENERGY", summary: "Major energy contracts announced — potential for corporate event coverage and documentation.", publishedAt: new Date(Date.now() - 3 * 86400000) },
    { title: "Abuja Oil & Gas Conference 2025 — Call for Media Partners", url: "https://www.oilandgasevents.com/nigeria/", source: "Oil & Gas Events", category: "ENERGY", summary: "Upcoming energy conference seeking media production partners.", publishedAt: new Date(Date.now() - 1 * 86400000) },
    { title: "Nigeria Tech Ecosystem: 10 Startups to Watch", url: "https://techcabal.com/", source: "TechCabal", category: "TECH", summary: "Tech startup ecosystem updates — potential Fiestivo.com customers.", publishedAt: new Date(Date.now() - 4 * 86400000) },
    { title: "Event Industry Trends: Hybrid Events Growing in Africa", url: "https://www.eventbrite.com/blog/", source: "Eventbrite Blog", category: "EVENTS", summary: "Hybrid events on the rise — opportunity for Fiestivo.com validation.", publishedAt: new Date(Date.now() - 5 * 86400000) },
    { title: "Federal Government Announces New Infrastructure Projects", url: "https://www.premiumtimesng.com/", source: "Premium Times", category: "GOVERNMENT", summary: "New government projects — potential for documentation and event coverage.", publishedAt: new Date(Date.now() - 6 * 86400000) },
  ];

  for (const n of news) {
    const existing = await db.industryNews.findFirst({ where: { url: n.url } });
    if (!existing) await db.industryNews.create({ data: n });
  }
  console.log(`Seeded ${news.length} industry news items`);
  console.log("Founder Roadmap + Industry News seed complete.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
