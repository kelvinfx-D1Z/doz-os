// Seed: Rebuilt NJFP Internship Programme (12 Months) — Learn. Build. Lead.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  console.log("Seeding rebuilt NJFP Internship Programme...");

  const interns = await db.user.findMany({ where: { role: "INTERN", isActive: true } });
  const akpala = interns.find(i => i.name.includes("Akpala"));
  const esther = interns.find(i => i.name.includes("Esther"));

  // Clear existing
  await db.internshipMilestone.deleteMany({});

  const milestones: any[] = [];

  // ============================================================
  // QUARTER 1 (MONTHS 1-3) — LEARN THE BUSINESS
  // ============================================================
  const q1Shared = [
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 1, phase: "Q1: Learn the Business", title: "Shared Learning: Company Culture & Communication", description: "Learn company culture, professional communication, Microsoft Office & Google Workspace, AI tools (ChatGPT, Claude, Gemini), project management tools, file management, time management, business etiquette, meeting etiquette, client confidentiality, personal branding.", deliverable: "Shared learning completion", kpi: null, assigneeId: akpala?.id },
    { track: "CONTENT_BRAND", monthStart: 1, monthEnd: 1, phase: "Q1: Learn the Business", title: "Shared Learning: Company Culture & Communication", description: "Learn company culture, professional communication, Microsoft Office & Google Workspace, AI tools, project management tools, file management, time management, business etiquette, meeting etiquette, client confidentiality, personal branding.", deliverable: "Shared learning completion", kpi: null, assigneeId: esther?.id },
  ];

  // Q1 — Operations Intern
  const q1Ops = [
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Learn: Proposal Writing & CRM Basics", description: "Learn proposal writing, CRM basics, client onboarding, event planning, budgeting basics.", deliverable: "Understanding of proposal & CRM workflows", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Task: Organize Google Drive", description: "Organize the company Google Drive with a clear folder structure.", deliverable: "Clean Google Drive structure", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Task: Build CRM Database", description: "Build a CRM database with 100 potential clients.", deliverable: "CRM with 100 contacts", kpi: "100 companies added", assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Task: Research 100 Potential Clients", description: "Research and compile 100 potential clients across corporate organizations, banks, oil & gas, NGOs, development agencies, event companies, government agencies.", deliverable: "Lead tracker with 100 contacts", kpi: "100 companies researched", assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Task: Create Contact Directory", description: "Create a structured contact directory with company name, contact person, email, opportunity type, next action.", deliverable: "Company directory", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Task: Attend Client Meetings as Observer", description: "Attend client meetings as an observer to learn how DOZ handles clients.", deliverable: "Meeting notes repository", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Deliverable: Client CRM + Lead Tracker + Company Directory + Meeting Notes", description: "Consolidate all Q1 deliverables: Client CRM, Lead tracker, Company directory, Meeting notes repository.", deliverable: "Q1 deliverables package", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Skills: Research, Data Organization, Business Communication, CRM Management", description: "Acquire skills: research, data organization, business communication, CRM management.", deliverable: "Skills self-assessment", kpi: null, assigneeId: akpala?.id },
  ];

  // Q1 — Brand & Content Intern
  const q1Content = [
    { track: "CONTENT_BRAND", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Learn: Photography Basics & Canva", description: "Learn photography basics, Canva, CapCut/Premiere Pro, copywriting, social media strategy.", deliverable: "Understanding of content creation tools", kpi: null, assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Task: Photograph Office Activities", description: "Photograph office activities and daily operations.", deliverable: "Photo library", kpi: null, assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Task: Document Productions", description: "Document all productions with photos and behind-the-scenes content.", deliverable: "Production documentation", kpi: null, assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Task: Write Captions", description: "Write engaging captions for social media posts.", deliverable: "Caption template library", kpi: null, assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Task: Update Website", description: "Update the company website with current projects and information.", deliverable: "Updated website", kpi: null, assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Task: Organize Portfolio", description: "Organize the company portfolio with past projects, photos, and videos.", deliverable: "Organized portfolio", kpi: null, assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Deliverable: Monthly Content Calendar + 12 Social Posts + Website Updates + Content Archive", description: "Consolidate all Q1 deliverables.", deliverable: "Q1 deliverables package", kpi: "12 posts per month", assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 1, monthEnd: 3, phase: "Q1: Learn the Business", title: "Skills: Photography, Copywriting, Social Media, Branding", description: "Acquire skills: photography, copywriting, social media, branding.", deliverable: "Skills self-assessment", kpi: null, assigneeId: esther?.id },
  ];

  // ============================================================
  // QUARTER 2 (MONTHS 4-6) — BUILD SYSTEMS
  // ============================================================
  const q2Ops = [
    { track: "OPERATIONS_GROWTH", monthStart: 4, monthEnd: 6, phase: "Q2: Build Systems", title: "DOZ: Proposal Preparation & Follow-up Emails", description: "Take over proposal preparation and follow-up emails for DOZ.", deliverable: "Proposal tracking system", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 4, monthEnd: 6, phase: "Q2: Build Systems", title: "DOZ: Opportunity Tracking & SOP Documentation", description: "Track opportunities and document SOPs for DOZ operations.", deliverable: "SOP Version 1", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 4, monthEnd: 6, phase: "Q2: Build Systems", title: "DOZ: Vendor Database", description: "Build and maintain the vendor database.", deliverable: "Vendor database", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 4, monthEnd: 6, phase: "Q2: Build Systems", title: "Fiestivo: Research Event Companies, Universities, Churches, NGOs, Conference Organizers", description: "Research potential Fiestivo customers: event companies, universities, churches, NGOs, conference organizers.", deliverable: "Fiestivo research report", kpi: "5 customer interviews", assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 4, monthEnd: 6, phase: "Q2: Build Systems", title: "Fiestivo: Customer Interview Summaries & Competitor Reports & Pricing Research", description: "Create customer interview summaries, competitor reports, and pricing research for Fiestivo.", deliverable: "Fiestivo market research", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 4, monthEnd: 6, phase: "Q2: Build Systems", title: "FounderOS: Document How DOZ Operates", description: "Document every workflow at DOZ for the FounderOS system.", deliverable: "DOZ operations documentation", kpi: null, assigneeId: akpala?.id },
  ];

  const q2Content = [
    { track: "CONTENT_BRAND", monthStart: 4, monthEnd: 6, phase: "Q2: Build Systems", title: "DOZ: Weekly LinkedIn Posts & Instagram Content", description: "Create weekly LinkedIn posts and Instagram content for DOZ.", deliverable: "Weekly content output", kpi: "12 posts per month", assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 4, monthEnd: 6, phase: "Q2: Build Systems", title: "DOZ: Case Studies & Blog Posts", description: "Create 3 case studies and blog posts for DOZ.", deliverable: "3 case studies", kpi: "3 case studies", assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 4, monthEnd: 6, phase: "Q2: Build Systems", title: "Fiestivo: Demo Videos & Launch Graphics & Feature Explainers & Customer Stories", description: "Produce Fiestivo media: demo videos, launch graphics, feature explainers, customer stories.", deliverable: "Fiestivo media kit", kpi: null, assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 4, monthEnd: 6, phase: "Q2: Build Systems", title: "FounderOS: Document Internal Workflows with Screenshots", description: "Document internal workflows with screenshots for FounderOS.", deliverable: "FounderOS documentation", kpi: null, assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 4, monthEnd: 6, phase: "Q2: Build Systems", title: "FounderOS: Create Training Videos", description: "Create training videos for FounderOS users.", deliverable: "Training video library", kpi: null, assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 4, monthEnd: 6, phase: "Q2: Build Systems", title: "Deliverable: 3 Case Studies + Website Refreshed + Fiestivo Media Kit + FounderOS User Guide", description: "Consolidate all Q2 deliverables.", deliverable: "Q2 deliverables package", kpi: null, assigneeId: esther?.id },
  ];

  // ============================================================
  // QUARTER 3 (MONTHS 7-9) — OWN PROJECTS
  // ============================================================
  const q3Ops = [
    { track: "OPERATIONS_GROWTH", monthStart: 7, monthEnd: 9, phase: "Q3: Own Projects", title: "DOZ: Lead One Client Onboarding", description: "Lead one complete client onboarding process from start to finish.", deliverable: "Successful client onboarding", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 7, monthEnd: 9, phase: "Q3: Own Projects", title: "DOZ: Lead One Proposal", description: "Lead one complete proposal from research to submission.", deliverable: "Submitted proposal", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 7, monthEnd: 9, phase: "Q3: Own Projects", title: "DOZ: Lead One Event Logistics Plan", description: "Lead one event logistics plan from planning to execution.", deliverable: "Event logistics plan", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 7, monthEnd: 9, phase: "Q3: Own Projects", title: "DOZ: One Internal Improvement Project", description: "Lead one internal improvement project to make DOZ more efficient.", deliverable: "Internal improvement", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 7, monthEnd: 9, phase: "Q3: Own Projects", title: "Fiestivo: Coordinate User Testing & Collect Feedback & Organize Pilot Events", description: "Coordinate user testing for Fiestivo, collect feedback, and organize pilot events.", deliverable: "Fiestivo pilot report", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 7, monthEnd: 9, phase: "Q3: Own Projects", title: "FounderOS: Map Entire Client Journey", description: "Map the entire client journey from first contact to project delivery.", deliverable: "Client journey map", kpi: null, assigneeId: akpala?.id },
  ];

  const q3Content = [
    { track: "CONTENT_BRAND", monthStart: 7, monthEnd: 9, phase: "Q3: Own Projects", title: "DOZ: Lead Content Campaign", description: "Lead a 3-month content campaign from planning to execution.", deliverable: "3-month content campaign", kpi: null, assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 7, monthEnd: 9, phase: "Q3: Own Projects", title: "DOZ: Documentary Behind-the-Scenes Series", description: "Create a behind-the-scenes documentary series.", deliverable: "BTS documentary series", kpi: null, assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 7, monthEnd: 9, phase: "Q3: Own Projects", title: "DOZ: Photography at Events + Newsletter", description: "Lead photography at events and produce the newsletter.", deliverable: "Event photos + newsletter", kpi: null, assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 7, monthEnd: 9, phase: "Q3: Own Projects", title: "Fiestivo: Product Launch Campaign + Educational Videos + Email Campaign", description: "Create Fiestivo product launch campaign, educational videos, and email campaign.", deliverable: "Product launch assets", kpi: null, assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 7, monthEnd: 9, phase: "Q3: Own Projects", title: "FounderOS: Design Knowledge Base & Internal Training Materials", description: "Design the FounderOS knowledge base and create internal training materials.", deliverable: "Internal knowledge base", kpi: null, assigneeId: esther?.id },
  ];

  // ============================================================
  // QUARTER 4 (MONTHS 10-12) — LEAD & GRADUATE
  // ============================================================
  const q4Ops = [
    { track: "OPERATIONS_GROWTH", monthStart: 10, monthEnd: 12, phase: "Q4: Lead & Graduate", title: "DOZ: Responsible for Weekly Reports, Proposal Tracking, CRM Updates, Vendor Coordination, Meeting Prep", description: "Take responsibility for weekly reports, proposal tracking, CRM updates, vendor coordination, and meeting preparation.", deliverable: "Operate with minimal supervision", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 10, monthEnd: 12, phase: "Q4: Lead & Graduate", title: "Final Project: DOZ Operations Manual", description: "Create the DOZ Operations Manual containing: SOPs, Templates, Checklists, CRM Guide, Vendor List, Event Procedures.", deliverable: "DOZ Operations Manual", kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 10, monthEnd: 12, phase: "Q4: Lead & Graduate", title: "Graduate as Junior Operations Manager", description: "Graduate from intern to Junior Operations Manager.", deliverable: "Graduation", kpi: null, assigneeId: akpala?.id },
  ];

  const q4Content = [
    { track: "CONTENT_BRAND", monthStart: 10, monthEnd: 12, phase: "Q4: Lead & Graduate", title: "DOZ: Responsible for Publishing Schedule, Website Updates, Social Media Calendar, Portfolio Management", description: "Take responsibility for the publishing schedule, website updates, social media calendar, and portfolio management.", deliverable: "Operate with minimal supervision", kpi: null, assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 10, monthEnd: 12, phase: "Q4: Lead & Graduate", title: "Final Project: DOZ Brand Playbook", description: "Create the DOZ Brand Playbook containing: Brand Guidelines, Social Media Strategy, Content Templates, Case Studies, Website Guide.", deliverable: "DOZ Brand Playbook", kpi: null, assigneeId: esther?.id },
    { track: "CONTENT_BRAND", monthStart: 10, monthEnd: 12, phase: "Q4: Lead & Graduate", title: "Graduate as Brand & Marketing Associate", description: "Graduate from intern to Brand & Marketing Associate.", deliverable: "Graduation", kpi: null, assigneeId: esther?.id },
  ];

  // ============================================================
  // WEEKLY STRUCTURE (same for both interns)
  // ============================================================
  const weeklyStructure = [
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 12, phase: "Weekly Structure", title: "Monday: Team Planning", description: "Weekly goals, review KPIs, assign tasks.", deliverable: null, kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 12, phase: "Weekly Structure", title: "Tuesday: Learning Day (2hr training)", description: "2-hour training session led by founder or external expert. Topics rotate: BD, Marketing, Photography, Event Management, AI, Sales, Entrepreneurship.", deliverable: null, kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 12, phase: "Weekly Structure", title: "Wednesday: Project Work", description: "Focus on current client projects.", deliverable: null, kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 12, phase: "Weekly Structure", title: "Thursday: Innovation Day", description: "Dedicated to Fiestivo improvements, FounderOS improvements, automation, AI experiments.", deliverable: null, kpi: null, assigneeId: akpala?.id },
    { track: "OPERATIONS_GROWTH", monthStart: 1, monthEnd: 12, phase: "Weekly Structure", title: "Friday: Reflection", description: "Present: What I learned, What I built, What challenged me, What I'll improve next week.", deliverable: null, kpi: null, assigneeId: akpala?.id },
  ];

  // ============================================================
  // MONTHLY LEARNING GOALS (same for both)
  // ============================================================
  const monthlyLearning = [
    { month: 1, focus: "Workplace professionalism & communication" },
    { month: 2, focus: "Photography, videography & storytelling" },
    { month: 3, focus: "Event production fundamentals" },
    { month: 4, focus: "Marketing & branding" },
    { month: 5, focus: "Sales & proposal writing" },
    { month: 6, focus: "Project management & client service" },
    { month: 7, focus: "AI tools for business and creativity" },
    { month: 8, focus: "Leadership & teamwork" },
    { month: 9, focus: "Entrepreneurship & business finance" },
    { month: 10, focus: "Product thinking (Fiestivo & FounderOS)" },
    { month: 11, focus: "Public speaking & presentation" },
    { month: 12, focus: "Career planning, CV, LinkedIn & interview preparation" },
  ];

  for (const m of monthlyLearning) {
    for (const track of ["OPERATIONS_GROWTH", "CONTENT_BRAND"] as const) {
      milestones.push({
        track,
        monthStart: m.month, monthEnd: m.month,
        phase: "Monthly Learning Goal",
        title: `Month ${m.month}: ${m.focus}`,
        description: `Learning focus for month ${m.month}: ${m.focus}`,
        deliverable: null, kpi: null,
        assigneeId: track === "OPERATIONS_GROWTH" ? akpala?.id : esther?.id,
      });
    }
  }

  // Performance Reviews
  const reviews = [3, 6, 9, 12];
  for (const month of reviews) {
    for (const track of ["OPERATIONS_GROWTH", "CONTENT_BRAND"] as const) {
      milestones.push({
        track,
        monthStart: month, monthEnd: month,
        phase: "Performance Review",
        title: `Month ${month} Performance Review`,
        description: `Formal review measuring: Professionalism (punctuality, dress, communication, initiative), Learning (new skills, certifications, ability to apply feedback), Contribution (quality of work, systems created, assets produced, business impact), Leadership (ownership, teamwork, problem-solving, reliability).`,
        deliverable: "Performance review document",
        kpi: null,
        assigneeId: track === "OPERATIONS_GROWTH" ? akpala?.id : esther?.id,
      });
    }
  }

  // Combine all
  const all = [...q1Shared, ...q1Ops, ...q1Content, ...q2Ops, ...q2Content, ...q3Ops, ...q3Content, ...q4Ops, ...q4Content, ...weeklyStructure, ...milestones];

  for (const m of all) {
    await db.internshipMilestone.create({ data: m });
  }

  console.log(`Seeded ${all.length} internship milestones`);
  console.log(`  Operations: ${all.filter(m => m.track === "OPERATIONS_GROWTH").length}`);
  console.log(`  Content: ${all.filter(m => m.track === "CONTENT_BRAND").length}`);
  console.log("NJFP Internship Programme (Rebuilt) seed complete.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
