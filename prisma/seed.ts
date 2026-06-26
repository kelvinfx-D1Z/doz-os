// DOZ OS — Seed script
// Populates the database with realistic Digit One Zero Ltd data
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const db = new PrismaClient();
const hashPassword = (p: string) => crypto.createHash("sha256").update(p).digest("hex");
const DEMO_PW = hashPassword("doz2025");

const now = new Date();
const daysFromNow = (n: number) => new Date(now.getTime() + n * 86400000);
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);

async function main() {
  console.log("Seeding DOZ OS...");

  // ---------- USERS ----------
  const founder = await db.user.create({
    data: {
      email: "founder@digitonezero.com",
      name: "Adaeze Okonkwo",
      role: "FOUNDER",
      title: "Founder & CEO",
      phone: "+234 803 000 0001",
      capacity: 60,
      password: DEMO_PW,
    },
  });

  const staff = await db.user.create({
    data: {
      email: "ops@digitonezero.com",
      name: "Tunde Bakare",
      role: "STAFF",
      title: "Operations Lead",
      phone: "+234 803 000 0002",
      capacity: 45,
      password: DEMO_PW,
    },
  });

  const finance = await db.user.create({
    data: {
      email: "finance@digitonezero.com",
      name: "Ngozi Eze",
      role: "STAFF",
      title: "Finance Officer",
      phone: "+234 803 000 0003",
      capacity: 40,
      password: DEMO_PW,
    },
  });

  const interns = await Promise.all(
    [
      { name: "Chioma Adeyemi", title: "Intern — Production", email: "chioma@digitonezero.com" },
      { name: "Emeka Obi", title: "Intern — Media", email: "emeka@digitonezero.com" },
      { name: "Fatima Yusuf", title: "Intern — Creative", email: "fatima@digitonezero.com" },
    ].map((i) =>
      db.user.create({ data: { ...i, role: "INTERN", capacity: 30, phone: "+234 803 000 00XX", password: DEMO_PW } })
    )
  );

  const freelancers = await Promise.all(
    [
      { name: "Bola Martins", title: "Production Manager", email: "bola@freelance.ng", capacity: 20 },
      { name: "Seyi Adekunle", title: "Technical Director", email: "seyi@freelance.ng", capacity: 20 },
      { name: "Kunle Ojo", title: "Camera Operator", email: "kunle@freelance.ng", capacity: 25 },
      { name: "Rita Eyo", title: "Sound Engineer", email: "rita@freelance.ng", capacity: 18 },
      { name: "Dan Usman", title: "Lighting Technician", email: "dan@freelance.ng", capacity: 22 },
      { name: "Grace Idowu", title: "Video Editor", email: "grace@freelance.ng", capacity: 35 },
      { name: "Mike Afolabi", title: "Stage Manager", email: "mike@freelance.ng", capacity: 24 },
    ].map((f) =>
      db.user.create({ data: { ...f, role: "FREELANCER", phone: "+234 803 000 00XX", password: DEMO_PW } })
    )
  );

  // ---------- ACCOUNTS (with portal tokens for client portal) ----------
  const accounts = await Promise.all(
    [
      { name: "GTBank Plc", industry: "Banking", isStrategic: true, lifetimeValue: 28500000, portalToken: "gtb-portal-2025", portalActive: true },
      { name: "MTN Nigeria", industry: "Telecoms", isStrategic: true, lifetimeValue: 42000000, portalToken: "mtn-portal-2025", portalActive: true },
      { name: "Lagos Chamber of Commerce", industry: "Association", isStrategic: false, lifetimeValue: 6500000, portalToken: "lcc-portal-2025", portalActive: true },
      { name: "Dangote Group", industry: "Manufacturing", isStrategic: true, lifetimeValue: 18000000, portalToken: "dangote-portal-2025", portalActive: true },
      { name: "Access Holdings", industry: "Banking", isStrategic: false, lifetimeValue: 9500000, portalActive: false },
      { name: "Shell Nigeria", industry: "Oil & Gas", isStrategic: true, lifetimeValue: 22000000, portalToken: "shell-portal-2025", portalActive: true },
      { name: "Nike Art Gallery", industry: "Arts & Culture", isStrategic: false, lifetimeValue: 2200000, portalActive: false },
      { name: "Federal Ministry of Information", industry: "Government", isStrategic: false, lifetimeValue: 7800000, portalActive: false },
    ].map((a) => db.account.create({ data: a }))
  );

  // ---------- CONTACTS ----------
  const contacts = await Promise.all([
    db.contact.create({ data: { accountId: accounts[0].id, name: "Femi Adeola", title: "Head of Brand", email: "femi.adeola@gtbank.com", phone: "+234 803 111 0001", isDecisionMaker: true } }),
    db.contact.create({ data: { accountId: accounts[1].id, name: "Yetunde Bello", title: "Events Manager", email: "yetunde.bello@mtn.com", phone: "+234 803 111 0002", isDecisionMaker: true } }),
    db.contact.create({ data: { accountId: accounts[2].id, name: "Dr. Chinyere Alu", title: "Director", email: "chinyere@lccsng.org", phone: "+234 803 111 0003", isDecisionMaker: true } }),
    db.contact.create({ data: { accountId: accounts[3].id, name: "Engr. Sani Dangote", title: "Group COO", email: "sani@dangote.com", phone: "+234 803 111 0004", isDecisionMaker: true } }),
    db.contact.create({ data: { accountId: accounts[4].id, name: "Herbert Wigwe Jr", title: "Brand Manager", email: "herbert.jr@accessbank.com", phone: "+234 803 111 0005" } }),
    db.contact.create({ data: { accountId: accounts[5].id, name: "Osagie Okunbor", title: "External Affairs", email: "osagie@shell.com", phone: "+234 803 111 0006", isDecisionMaker: true } }),
    db.contact.create({ data: { name: "Chief Nike Davies-Okundaye", title: "Founder", email: "nike@nikeart.com", phone: "+234 803 111 0007", isDecisionMaker: true } }),
    db.contact.create({ data: { name: "Lai Mohammed", title: "Referrer — Consultant", email: "lai@consults.ng", phone: "+234 803 111 0008" } }),
  ]);

  // ---------- GOALS (cascade) ----------
  const annualGoal = await db.goal.create({
    data: {
      title: "Grow annual revenue to ₦250M and reduce founder dependency by 40%",
      description: "Scale from founder-led to process-driven. Build systems for sales, procurement, and delivery. Prepare EventCo/Fiestivo launch.",
      type: "ANNUAL",
      status: "ACTIVE",
      progress: 38,
      ownerId: founder.id,
      startDate: daysAgo(120),
      dueDate: daysFromNow(245),
    },
  });

  const qGoal = await db.goal.create({
    data: {
      title: "Q3: Close ₦75M pipeline + ship procurement controls + onboard 2 senior hires",
      type: "QUARTERLY",
      status: "ACTIVE",
      progress: 52,
      ownerId: founder.id,
      parentId: annualGoal.id,
      quarter: "Q3-2025",
      startDate: daysAgo(30),
      dueDate: daysFromNow(60),
    },
  });

  const monthlyGoal = await db.goal.create({
    data: {
      title: "This Month: Convert 4 proposals, finalize DOZ OS, launch intern program",
      type: "MONTHLY",
      status: "ACTIVE",
      progress: 60,
      ownerId: founder.id,
      parentId: qGoal.id,
      startDate: daysAgo(12),
      dueDate: daysFromNow(18),
    },
  });

  const weeklyGoal = await db.goal.create({
    data: {
      title: "This Week: Approve 3 POs, sign GTBank event, finish intern onboarding",
      type: "WEEKLY",
      status: "ACTIVE",
      progress: 45,
      ownerId: founder.id,
      parentId: monthlyGoal.id,
      startDate: daysAgo(3),
      dueDate: daysFromNow(4),
    },
  });

  // ---------- TASKS ----------
  const tasks = [
    { title: "Finalize GTBank Annual Conference proposal", priority: "URGENT", status: "IN_PROGRESS", category: "STRATEGIC", assigneeId: founder.id, creatorId: founder.id, goalId: weeklyGoal.id, dueDate: daysFromNow(1), estimatedHrs: 3 },
    { title: "Approve MTN video edit PO (₦1.2M)", priority: "HIGH", status: "TODO", category: "OPERATIONAL", assigneeId: founder.id, creatorId: staff.id, dueDate: daysFromNow(0), estimatedHrs: 1 },
    { title: "Review intern daily reports", priority: "MEDIUM", status: "TODO", category: "OPERATIONAL", assigneeId: founder.id, creatorId: founder.id, dueDate: daysFromNow(0), estimatedHrs: 1 },
    { title: "Follow up with Shell on livestream quote", priority: "HIGH", status: "TODO", category: "STRATEGIC", assigneeId: founder.id, creatorId: founder.id, goalId: weeklyGoal.id, dueDate: daysFromNow(1), estimatedHrs: 1 },
    { title: "Reply 14 unread WhatsApp messages (DISTRACTION)", priority: "LOW", status: "TODO", category: "DISTRACTION", assigneeId: founder.id, creatorId: founder.id, isDistraction: true, dueDate: daysFromNow(0), estimatedHrs: 1 },
    { title: "Reconcile June expenses with Finance", priority: "HIGH", status: "TODO", category: "OPERATIONAL", assigneeId: finance.id, creatorId: founder.id, dueDate: daysFromNow(2), estimatedHrs: 2 },
    { title: "Prepare Fiestivo product brief deck", priority: "MEDIUM", status: "TODO", category: "STRATEGIC", assigneeId: founder.id, creatorId: founder.id, goalId: monthlyGoal.id, dueDate: daysFromNow(5), estimatedHrs: 4 },
    { title: "Update vendor database with 5 new AV suppliers", priority: "MEDIUM", status: "IN_PROGRESS", category: "OPERATIONAL", assigneeId: interns[0].id, creatorId: staff.id, dueDate: daysFromNow(2), estimatedHrs: 3 },
    { title: "Edit MTN conference aftermovie (v2)", priority: "HIGH", status: "IN_PROGRESS", category: "OPERATIONAL", assigneeId: freelancers[5].id, creatorId: founder.id, dueDate: daysFromNow(3), estimatedHrs: 8 },
    { title: "Colour grade Dangote documentary", priority: "MEDIUM", status: "TODO", category: "OPERATIONAL", assigneeId: freelancers[5].id, creatorId: founder.id, dueDate: daysFromNow(6), estimatedHrs: 6 },
    { title: "Source 3 quotes for LED screen rental (Eko Event)", priority: "HIGH", status: "IN_PROGRESS", category: "OPERATIONAL", assigneeId: interns[0].id, creatorId: staff.id, dueDate: daysFromNow(1), estimatedHrs: 2 },
    { title: "Draft SOP: Event day run-sheet template", priority: "LOW", status: "TODO", category: "STRATEGIC", assigneeId: interns[2].id, creatorId: founder.id, dueDate: daysFromNow(7), estimatedHrs: 4 },
    { title: "Review overdue invoice — Lagos Chamber (₦2.1M)", priority: "URGENT", status: "TODO", category: "OPERATIONAL", assigneeId: founder.id, creatorId: finance.id, dueDate: daysAgo(-2), estimatedHrs: 1 },
    { title: "Approve vendor payment — Sound crew (₦450K)", priority: "HIGH", status: "TODO", category: "OPERATIONAL", assigneeId: founder.id, creatorId: staff.id, dueDate: daysFromNow(0), estimatedHrs: 1 },
    { title: "Weekly 1:1 with each intern", priority: "MEDIUM", status: "TODO", category: "OPERATIONAL", assigneeId: founder.id, creatorId: founder.id, dueDate: daysFromNow(3), estimatedHrs: 2 },
  ];
  for (const t of tasks) {
    await db.task.create({ data: t });
  }

  // ---------- OPPORTUNITIES ----------
  const opps = [
    { name: "GTBank Annual Conference 2025", accountId: accounts[0].id, contactId: contacts[0].id, stage: "PROPOSAL", value: 18500000, probability: 60, serviceType: "EVENT_PRODUCTION", expectedClose: daysFromNow(12), source: "EXISTING_CLIENT" },
    { name: "MTN Brand Film + Livestream", accountId: accounts[1].id, contactId: contacts[1].id, stage: "NEGOTIATION", value: 24000000, probability: 75, serviceType: "VIDEO_PRODUCTION", expectedClose: daysFromNow(7), source: "REFERRAL" },
    { name: "Dangote Sustainability Documentary", accountId: accounts[3].id, contactId: contacts[3].id, stage: "QUALIFIED", value: 12000000, probability: 40, serviceType: "VIDEO_PRODUCTION", expectedClose: daysFromNow(25), source: "REFERRAL" },
    { name: "Shell Safety Conference — Stage + AV", accountId: accounts[5].id, contactId: contacts[5].id, stage: "DISCOVERY", value: 32000000, probability: 20, serviceType: "CONFERENCE_PRODUCTION", expectedClose: daysFromNow(40), source: "NETWORKING" },
    { name: "Access Bank Year-End Party", accountId: accounts[4].id, contactId: contacts[4].id, stage: "PROPOSAL", value: 9500000, probability: 50, serviceType: "EVENT_MANAGEMENT", expectedClose: daysFromNow(18), source: "EXISTING_CLIENT" },
    { name: "Lagos Chamber Annual Lecture", accountId: accounts[2].id, contactId: contacts[2].id, stage: "WON", value: 4500000, probability: 100, serviceType: "EVENT_PRODUCTION", expectedClose: daysAgo(5), source: "REFERRAL" },
    { name: "Nike Art Exhibition Opening", accountId: accounts[6].id, contactId: contacts[6].id, stage: "QUALIFIED", value: 2800000, probability: 35, serviceType: "EVENT_MANAGEMENT", expectedClose: daysFromNow(30), source: "NETWORKING" },
    { name: "Fed Min of Info — National Broadcast", contactId: contacts[7].id, stage: "DISCOVERY", value: 15000000, probability: 15, serviceType: "VIDEO_PRODUCTION", expectedClose: daysFromNow(50), source: "REFERRAL" },
  ];
  const createdOpps = [];
  for (const o of opps) {
    createdOpps.push(await db.opportunity.create({ data: o }));
  }

  // ---------- PROPOSALS ----------
  await db.proposal.create({ data: { opportunityId: createdOpps[0].id, title: "GTBank Annual Conference — Full Production", amount: 18500000, status: "SENT", sentDate: daysAgo(6), validUntil: daysFromNow(8) } });
  await db.proposal.create({ data: { opportunityId: createdOpps[1].id, title: "MTN Brand Film + Multi-cam Livestream", amount: 24000000, status: "SENT", sentDate: daysAgo(9), validUntil: daysFromNow(5) } });
  await db.proposal.create({ data: { opportunityId: createdOpps[4].id, title: "Access Bank Year-End Party", amount: 9500000, status: "DRAFT", validUntil: daysFromNow(14) } });
  await db.proposal.create({ data: { opportunityId: createdOpps[5].id, title: "Lagos Chamber Annual Lecture", amount: 4500000, status: "ACCEPTED", sentDate: daysAgo(20), responseDate: daysAgo(8) } });

  // ---------- FOLLOW-UPS ----------
  await db.followUp.create({ data: { opportunityId: createdOpps[0].id, contactId: contacts[0].id, type: "CALL", subject: "Call Femi re: proposal feedback", dueDate: daysFromNow(0), notes: "Confirm AV spec + livestream add-on" } });
  await db.followUp.create({ data: { opportunityId: createdOpps[1].id, contactId: contacts[1].id, type: "MEETING", subject: "Site visit — MTN HQ auditorium", dueDate: daysFromNow(2) } });
  await db.followUp.create({ data: { opportunityId: createdOpps[3].id, contactId: contacts[5].id, type: "EMAIL", subject: "Send revised scope + budget", dueDate: daysFromNow(1) } });
  await db.followUp.create({ data: { opportunityId: createdOpps[4].id, contactId: contacts[4].id, type: "WHATSAPP", subject: "Nudge on proposal decision", dueDate: daysFromNow(0) } });
  await db.followUp.create({ data: { opportunityId: createdOpps[6].id, contactId: contacts[6].id, type: "CALL", subject: "Follow up on exhibition quote", dueDate: daysFromNow(3), completed: true, completedAt: daysAgo(1) } });

  // ---------- REFERRALS ----------
  await db.referral.create({ data: { referrerContactId: contacts[7].id, toAccountId: accounts[3].id, referrerName: "Lai Mohammed", value: 12000000, note: "Referred Dangote documentary project" } });
  await db.referral.create({ data: { referrerContactId: contacts[1].id, toAccountId: accounts[4].id, referrerName: "Yetunde Bello (MTN)", value: 9500000, note: "Referred Access Bank year-end" } });
  await db.referral.create({ data: { referrerContactId: contacts[0].id, toAccountId: accounts[1].id, referrerName: "Femi Adeola (GTBank)", value: 24000000, note: "Referred MTN brand film" } });

  // ---------- PROJECTS ----------
  const projLCC = await db.project.create({ data: { name: "Lagos Chamber Annual Lecture", code: "EVT-2025-014", serviceType: "EVENT_PRODUCTION", status: "COMPLETED", accountId: accounts[2].id, managerId: founder.id, eventDate: daysAgo(5), venue: "Eko Hotel Convention Centre", budget: 3200000, revenue: 4500000, progress: 100, startDate: daysAgo(40), endDate: daysAgo(4) } });
  const projMTN = await db.project.create({ data: { name: "MTN Brand Film + Livestream", code: "VID-2025-022", serviceType: "VIDEO_PRODUCTION", status: "IN_PROGRESS", accountId: accounts[1].id, managerId: founder.id, eventDate: daysFromNow(14), venue: "MTN HQ Falomo", budget: 17000000, revenue: 24000000, progress: 55, startDate: daysAgo(15) } });
  const projGTB = await db.project.create({ data: { name: "GTBank Annual Conference (tentative)", code: "EVT-2025-031", serviceType: "CONFERENCE_PRODUCTION", status: "PLANNING", accountId: accounts[0].id, managerId: founder.id, eventDate: daysFromNow(35), venue: "Eko Convention Center", budget: 14000000, revenue: 18500000, progress: 15 } });
  const projDangote = await db.project.create({ data: { name: "Dangote Sustainability Documentary", code: "DOC-2025-007", serviceType: "VIDEO_PRODUCTION", status: "CONFIRMED", accountId: accounts[3].id, managerId: founder.id, budget: 8000000, revenue: 12000000, progress: 10, startDate: daysFromNow(5) } });
  const projAccess = await db.project.create({ data: { name: "Access Bank Year-End Party (pending)", code: "EVT-2025-029", serviceType: "EVENT_MANAGEMENT", status: "PLANNING", accountId: accounts[4].id, managerId: staff.id, eventDate: daysFromNow(45), venue: "Federal Palace Hotel", budget: 7000000, revenue: 9500000, progress: 5 } });
  const projShell = await db.project.create({ data: { name: "Shell Past Event — Safety Conference 2024", code: "EVT-2024-051", serviceType: "CONFERENCE_PRODUCTION", status: "COMPLETED", accountId: accounts[5].id, managerId: founder.id, eventDate: daysAgo(90), venue: "Shell RA Hub PH", budget: 21000000, revenue: 22000000, progress: 100, startDate: daysAgo(130), endDate: daysAgo(88) } });
  const projTitle = await db.project.create({ data: { name: "Nollywood Title Sequence — 'Amina'", code: "TTL-2025-003", serviceType: "TITLE_SEQUENCE", status: "IN_PROGRESS", managerId: freelancers[5].id, budget: 1200000, revenue: 2800000, progress: 70, startDate: daysAgo(20) } });

  // ---------- MILESTONES ----------
  await db.milestone.create({ data: { projectId: projMTN.id, title: "Pre-production & shot list", dueDate: daysAgo(3), status: "DONE", completedAt: daysAgo(2) } });
  await db.milestone.create({ data: { projectId: projMTN.id, title: "Principal shoot day", dueDate: daysFromNow(14), status: "PENDING" } });
  await db.milestone.create({ data: { projectId: projMTN.id, title: "First cut delivery", dueDate: daysFromNow(28), status: "PENDING" } });
  await db.milestone.create({ data: { projectId: projGTB.id, title: "Venue contract signed", dueDate: daysFromNow(3), status: "PENDING" } });
  await db.milestone.create({ data: { projectId: projGTB.id, title: "Production run-sheet locked", dueDate: daysFromNow(20), status: "PENDING" } });
  await db.milestone.create({ data: { projectId: projDangote.id, title: "Stakeholder interviews filmed", dueDate: daysFromNow(12), status: "PENDING" } });

  // ---------- DELIVERABLES ----------
  await db.deliverable.create({ data: { projectId: projMTN.id, title: "3-min brand film (master)", type: "VIDEO", status: "IN_PROGRESS", dueDate: daysFromNow(28) } });
  await db.deliverable.create({ data: { projectId: projMTN.id, title: "Livestream multicam recording", type: "LIVESTREAM", status: "PENDING", dueDate: daysFromNow(14) } });
  await db.deliverable.create({ data: { projectId: projTitle.id, title: "Main title sequence (4K)", type: "VIDEO", status: "REVIEW", dueDate: daysFromNow(2) } });
  await db.deliverable.create({ data: { projectId: projLCC.id, title: "Event photo gallery (200+)", type: "PHOTO", status: "DELIVERED", dueDate: daysAgo(3), deliveredAt: daysAgo(3), clientApproved: true } });
  await db.deliverable.create({ data: { projectId: projLCC.id, title: "Aftermovie (90s)", type: "VIDEO", status: "DELIVERED", dueDate: daysAgo(2), deliveredAt: daysAgo(2), clientApproved: true } });

  // ---------- CREW ----------
  await db.crewAssignment.create({ data: { projectId: projMTN.id, userId: freelancers[0].id, role: "PRODUCTION_MANAGER", dayRate: 120000, status: "CONFIRMED" } });
  await db.crewAssignment.create({ data: { projectId: projMTN.id, userId: freelancers[1].id, role: "TECHNICAL_DIRECTOR", dayRate: 150000, status: "CONFIRMED" } });
  await db.crewAssignment.create({ data: { projectId: projMTN.id, userId: freelancers[2].id, role: "CAMERA_OP", dayRate: 80000, status: "ASSIGNED" } });
  await db.crewAssignment.create({ data: { projectId: projMTN.id, userId: freelancers[2].id, role: "CAMERA_OP", dayRate: 80000, status: "ASSIGNED" } });
  await db.crewAssignment.create({ data: { projectId: projMTN.id, userId: freelancers[3].id, role: "SOUND_ENG", dayRate: 70000, status: "ASSIGNED" } });
  await db.crewAssignment.create({ data: { projectId: projMTN.id, userId: freelancers[4].id, role: "LIGHTING", dayRate: 65000, status: "ASSIGNED" } });
  await db.crewAssignment.create({ data: { projectId: projMTN.id, userId: freelancers[5].id, role: "EDITOR", dayRate: 90000, status: "ASSIGNED" } });
  await db.crewAssignment.create({ data: { projectId: projGTB.id, userId: freelancers[0].id, role: "PRODUCTION_MANAGER", dayRate: 120000, status: "ASSIGNED" } });
  await db.crewAssignment.create({ data: { projectId: projGTB.id, userId: freelancers[6].id, role: "STAGE_MGR", dayRate: 85000, status: "ASSIGNED" } });

  // ---------- RESOURCES ----------
  await db.resourceBooking.create({ data: { projectId: projMTN.id, name: "Sony FX6 x2", type: "CAMERA", quantity: 2, cost: 300000 } });
  await db.resourceBooking.create({ data: { projectId: projMTN.id, name: "Livestream encoder + bonded internet", type: "SOUND", quantity: 1, cost: 450000 } });
  await db.resourceBooking.create({ data: { projectId: projGTB.id, name: "LED Wall 6x4m", type: "LED_SCREEN", quantity: 1, cost: 1800000 } });
  await db.resourceBooking.create({ data: { projectId: projGTB.id, name: "Line array PA", type: "SOUND", quantity: 1, cost: 650000 } });

  // ---------- VENDORS ----------
  const vendors = await Promise.all([
    db.vendor.create({ data: { name: "AViti Productions", category: "EQUIPMENT", contactName: "Ifeanyi Okeke", phone: "+234 805 222 0001", email: "ifeanyi@aviti.ng", rating: 4, totalSpent: 4200000, bankAccount: "0123456789 — GTB" } }),
    db.vendor.create({ data: { name: "PixelForge Studio", category: "EQUIPMENT", contactName: "Yinka Odumosu", phone: "+234 805 222 0002", email: "yinka@pixelforge.ng", rating: 5, totalSpent: 6100000, bankAccount: "9876543210 — Access" } }),
    db.vendor.create({ data: { name: "StageCraft NG", category: "STAGE", contactName: "Tonye Erekosima", phone: "+234 805 222 0003", email: "tonye@stagecraft.ng", rating: 4, totalSpent: 3300000, bankAccount: "5566778899 — Zenith" } }),
    db.vendor.create({ data: { name: "LEDHouse Lagos", category: "LED_SCREEN", contactName: "Mike Onuoha", phone: "+234 805 222 0004", email: "mike@ledhouse.ng", rating: 3, totalSpent: 5200000, bankAccount: "1122334455 — UBA" } }),
    db.vendor.create({ data: { name: "SoundBytes Pro Audio", category: "SOUND", contactName: "DJ Kola", phone: "+234 805 222 0005", email: "kola@soundbytes.ng", rating: 4, totalSpent: 2800000, bankAccount: "6677889900 — FirstBank" } }),
    db.vendor.create({ data: { name: "LightsUp Systems", category: "LIGHTING", contactName: "Engr. Patience", phone: "+234 805 222 0006", email: "patience@lightsup.ng", rating: 5, totalSpent: 3900000, bankAccount: "2233445566 — Stanbic" } }),
    db.vendor.create({ data: { name: "Royal Decor Lagos", category: "DECOR", contactName: "Mrs. Ekaette", phone: "+234 805 222 0007", email: "ekaette@royaldecor.ng", rating: 4, totalSpent: 1700000 } }),
    db.vendor.create({ data: { name: "MoveIt Logistics", category: "TRANSPORT", contactName: "Yusuf Bello", phone: "+234 805 222 0008", email: "yusuf@moveit.ng", rating: 3, totalSpent: 1400000 } }),
  ]);

  // ---------- RFQs + QUOTES ----------
  const rfq1 = await db.rfq.create({ data: { code: "RFQ-2025-018", projectId: projGTB.id, title: "LED Wall 6x4m + processor — 1 day", description: "Indoor LED wall for GTBank conference main stage", category: "LED_SCREEN", budget: 2000000, status: "QUOTES_RECEIVED", neededBy: daysFromNow(20) } });
  const q1a = await db.quote.create({ data: { rfqId: rfq1.id, vendorId: vendors[3].id, amount: 1800000, deliveryDays: 1, notes: "Includes setup + 1 spare module" } });
  const q1b = await db.quote.create({ data: { rfqId: rfq1.id, vendorId: vendors[1].id, amount: 2100000, deliveryDays: 1, notes: "P2.5 panel, backup processor included" } });
  const q1c = await db.quote.create({ data: { rfqId: rfq1.id, vendorId: vendors[0].id, amount: 1650000, deliveryDays: 2, notes: "P3.9 panel, used but serviced" } });
  await db.quote.update({ where: { id: q1c.id }, data: { isRecommended: true } });

  const rfq2 = await db.rfq.create({ data: { code: "RFQ-2025-019", projectId: projMTN.id, title: "Livestream bonded internet + encoding", category: "SOUND", budget: 500000, status: "OPEN", neededBy: daysFromNow(12) } });
  await db.quote.create({ data: { rfqId: rfq2.id, vendorId: vendors[4].id, amount: 450000, deliveryDays: 1, notes: "4G bonding + 1080p encoder" } });

  const rfq3 = await db.rfq.create({ data: { code: "RFQ-2025-020", title: "Stage build 12x8m truss", category: "STAGE", budget: 1500000, status: "OPEN", neededBy: daysFromNow(25) } });

  // ---------- PURCHASE ORDERS ----------
  const po1 = await db.purchaseOrder.create({ data: { code: "PO-2025-041", projectId: projMTN.id, vendorId: vendors[0].id, quoteId: null, amount: 300000, description: "Sony FX6 rental x2 + lenses", status: "ISSUED", issuedAt: daysAgo(2) } });
  const po2 = await db.purchaseOrder.create({ data: { code: "PO-2025-042", projectId: projLCC.id, vendorId: vendors[5].id, amount: 650000, description: "Lighting package — conference", status: "DELIVERED", issuedAt: daysAgo(12) } });
  const po3 = await db.purchaseOrder.create({ data: { code: "PO-2025-043", projectId: projLCC.id, vendorId: vendors[4].id, amount: 450000, description: "Sound reinforcement", status: "DELIVERED", issuedAt: daysAgo(12) } });
  const po4 = await db.purchaseOrder.create({ data: { code: "PO-2025-044", projectId: projTitle.id, vendorId: vendors[1].id, amount: 350000, description: "Stock footage + music license", status: "DRAFT" } });

  // ---------- PAYMENT REQUESTS (3-way segregation) ----------
  // requester ≠ approver ≠ payer
  const pr1 = await db.paymentRequest.create({ data: { code: "PR-2025-051", purchaseOrderId: po2.id, projectId: projLCC.id, amount: 650000, description: "Pay LightsUp for lighting package", status: "PENDING", requesterId: staff.id, approverId: null, payerId: null } });
  const pr2 = await db.paymentRequest.create({ data: { code: "PR-2025-052", purchaseOrderId: po3.id, projectId: projLCC.id, amount: 450000, description: "Pay SoundBytes for sound", status: "APPROVED", requesterId: staff.id, approverId: founder.id, payerId: null, approvedAt: daysAgo(1) } });
  const pr3 = await db.paymentRequest.create({ data: { code: "PR-2025-053", purchaseOrderId: po1.id, projectId: projMTN.id, amount: 300000, description: "Pay AViti 50% deposit for FX6 rental", status: "PENDING", requesterId: freelancers[0].id, approverId: null, payerId: null } });
  const pr4 = await db.paymentRequest.create({ data: { code: "PR-2025-050", purchaseOrderId: po2.id, projectId: projLCC.id, amount: 380000, description: "Pay StageCraft stage build", status: "PAID", requesterId: staff.id, approverId: founder.id, payerId: finance.id, approvedAt: daysAgo(8), paidAt: daysAgo(5) } });

  // approvals
  await db.approval.create({ data: { entityType: "PAYMENT_REQUEST", entityId: pr2.id, paymentRequestId: pr2.id, approverId: founder.id, decision: "APPROVED", comment: "Approved — within budget" } });
  await db.approval.create({ data: { entityType: "PAYMENT_REQUEST", entityId: pr4.id, paymentRequestId: pr4.id, approverId: founder.id, decision: "APPROVED", comment: "OK" } });

  // ---------- INVOICES ----------
  await db.invoice.create({ data: { code: "INV-2025-061", projectId: projLCC.id, accountId: accounts[2].id, amount: 4500000, tax: 337500, status: "OVERDUE", amountPaid: 0, issuedDate: daysAgo(30), dueDate: daysAgo(9) } });
  await db.invoice.create({ data: { code: "INV-2025-062", projectId: projMTN.id, accountId: accounts[1].id, amount: 12000000, tax: 0, status: "PARTIAL", amountPaid: 8000000, issuedDate: daysAgo(10), dueDate: daysFromNow(4) } });
  await db.invoice.create({ data: { code: "INV-2025-063", projectId: projShell.id, accountId: accounts[5].id, amount: 22000000, tax: 0, status: "PAID", amountPaid: 22000000, issuedDate: daysAgo(85), dueDate: daysAgo(70), paidDate: daysAgo(72) } });
  await db.invoice.create({ data: { code: "INV-2025-064", projectId: projTitle.id, amount: 1400000, tax: 105000, status: "SENT", amountPaid: 0, issuedDate: daysAgo(3), dueDate: daysFromNow(11) } });
  await db.invoice.create({ data: { code: "INV-2025-060", projectId: projLCC.id, accountId: accounts[2].id, amount: 1500000, tax: 0, status: "PAID", amountPaid: 1500000, issuedDate: daysAgo(40), dueDate: daysAgo(25), paidDate: daysAgo(22) } });

  // ---------- PAYMENT CONFIRMATIONS (Phase 3 — client portal) ----------
  const invLCC = await db.invoice.findFirst({ where: { code: "INV-2025-061" } });
  if (invLCC) {
    await db.paymentConfirmation.create({
      data: {
        invoiceId: invLCC.id,
        accountId: accounts[2].id,
        amount: 4500000,
        method: "BANK_TRANSFER",
        reference: "GTB/LCC/0042/25",
        note: "Full payment via GTBank transfer — screenshot attached",
        status: "PENDING",
        createdAt: daysAgo(1),
      },
    });
  }

  // ---------- EXPENSES ----------
  const expenses = [
    { projectId: projLCC.id, category: "CREW", description: "Camera ops x2 (2 days)", amount: 320000, expenseDate: daysAgo(6), isVerified: true },
    { projectId: projLCC.id, category: "VENDOR", description: "StageCraft stage build", amount: 380000, vendorId: vendors[2].id, expenseDate: daysAgo(7), isVerified: true },
    { projectId: projLCC.id, category: "VENDOR", description: "LightsUp lighting", amount: 650000, vendorId: vendors[5].id, expenseDate: daysAgo(6), isVerified: true },
    { projectId: projLCC.id, category: "VENDOR", description: "SoundBytes PA", amount: 450000, vendorId: vendors[4].id, expenseDate: daysAgo(6), isVerified: true },
    { projectId: projLCC.id, category: "LOGISTICS", description: "Crew transport", amount: 95000, expenseDate: daysAgo(6) },
    { projectId: projLCC.id, category: "EQUIPMENT", description: "Memory cards + batteries", amount: 60000, expenseDate: daysAgo(6), isVerified: true },
    { projectId: projMTN.id, category: "CREW", description: "PM + TD advance (3 days)", amount: 810000, expenseDate: daysAgo(3), isVerified: true },
    { projectId: projMTN.id, category: "EQUIPMENT", description: "FX6 rental deposit", amount: 300000, vendorId: vendors[0].id, expenseDate: daysAgo(2) },
    { projectId: projMTN.id, category: "LOGISTICS", description: "Location scout transport", amount: 45000, expenseDate: daysAgo(4) },
    { projectId: projShell.id, category: "VENDOR", description: "LED + AV package", amount: 8500000, vendorId: vendors[1].id, expenseDate: daysAgo(92), isVerified: true },
    { projectId: projShell.id, category: "CREW", description: "Full crew (5 days)", amount: 5400000, expenseDate: daysAgo(91), isVerified: true },
    { projectId: projShell.id, category: "LOGISTICS", description: "Flights + hotel PH", amount: 2800000, expenseDate: daysAgo(93), isVerified: true },
    { projectId: projTitle.id, category: "EQUIPMENT", description: "Stock + music licenses", amount: 350000, vendorId: vendors[1].id, expenseDate: daysAgo(5) },
    { projectId: projTitle.id, category: "CREW", description: "Editor + motion graphics", amount: 600000, expenseDate: daysAgo(3), isVerified: true },
    { category: "ADMIN", description: "Office rent (June)", amount: 850000, expenseDate: daysAgo(15), isVerified: true },
    { category: "ADMIN", description: "Software subscriptions", amount: 220000, expenseDate: daysAgo(10), isVerified: true },
    { category: "MARKETING", description: "Instagram ads + content", amount: 150000, expenseDate: daysAgo(8) },
  ];
  for (const e of expenses) await db.expense.create({ data: e });

  // ---------- BUDGETS ----------
  const budgetCats = ["CREW", "EQUIPMENT", "VENDOR", "LOGISTICS", "MARKETING", "ADMIN"];
  for (const pid of [projLCC.id, projMTN.id, projGTB.id, projShell.id, projTitle.id]) {
    const proj = await db.project.findUnique({ where: { id: pid } });
    if (!proj) continue;
    const split = { CREW: 0.32, EQUIPMENT: 0.2, VENDOR: 0.3, LOGISTICS: 0.1, MARKETING: 0.03, ADMIN: 0.05 };
    for (const cat of budgetCats) {
      await db.budget.create({ data: { projectId: pid, category: cat, amount: Math.round(proj.budget * split[cat as keyof typeof split]) } });
    }
  }

  // ---------- DAILY REPORTS ----------
  for (const intern of interns) {
    await db.dailyReport.create({
      data: {
        userId: intern.id,
        reportDate: daysAgo(0),
        tasksDone: "Updated vendor database (5 entries)\nSourced 3 LED quotes\nLogged expenses for LCC project",
        tasksPlanned: "Compare LED quotes\nDraft event run-sheet",
        blockers: "Waiting on LEDHouse to confirm availability",
        hoursWorked: 7,
        mood: "OK",
      },
    });
    await db.dailyReport.create({
      data: {
        userId: intern.id,
        reportDate: daysAgo(1),
        tasksDone: "Researched 8 event vendors\nHelped with proposal formatting\nOrganized asset library",
        tasksPlanned: "Vendor database update",
        blockers: "None",
        hoursWorked: 8,
        mood: "GREAT",
      },
    });
  }

  // ---------- WEEKLY REPORTS ----------
  for (const intern of interns) {
    await db.weeklyReport.create({
      data: {
        userId: intern.id,
        weekStart: daysAgo(7),
        weekEnd: daysAgo(0),
        achievements: "Built vendor shortlist of 25 suppliers\nCompleted Premiere Pro basics course",
        challenges: "Unclear on procurement approval steps",
        learnings: "Learned the difference between RFQ and PO",
        nextWeekPlan: "Own the LED sourcing end-to-end",
      },
    });
  }

  // ---------- SOPs ----------
  const sops = [
    { title: "Event Production Run-Sheet Template", category: "EVENT_CHECKLIST", content: "# Event Run-Sheet Template\n\n## T-14 Days\n- [ ] Confirm venue + signed contract\n- [ ] Lock production budget\n- [ ] Issue RFQs for all vendor categories\n\n## T-7 Days\n- [ ] Confirm crew (PM, TD, camera, sound, lighting)\n- [ ] Confirm equipment list\n- [ ] Share run-sheet with client\n\n## T-2 Days\n- [ ] Pre-light + tech check\n- [ ] Final vendor payments released\n- [ ] Backup plan reviewed\n\n## Event Day\n- [ ] 06:00 Crew call\n- [ ] 07:00 Load-in\n- [ ] 09:00 Tech rehearsal\n- [ ] 10:00 Doors\n- [ ] Post-event: handover assets within 48h", tags: "event, template, checklist" },
    { title: "Procurement & Vendor Payment Policy", category: "PROCUREMENT_POLICY", content: "# Procurement Policy\n\n## Principle: Requester ≠ Approver ≠ Payer\nNo single person may request, approve, AND pay a transaction.\n\n## Thresholds\n- Under ₦100,000: 1 quote, Ops Lead approves\n- ₦100,000 – ₦1,000,000: 2 quotes, Founder approves\n- Above ₦1,000,000: 3 quotes, Founder approves + Finance pays\n\n## Workflow\n1. RFQ raised in DOZ OS\n2. Minimum quotes collected (per threshold)\n3. Quote comparison reviewed\n4. PO issued\n5. Payment Request created (requester)\n6. Approval given (approver — cannot be requester)\n7. Payment made (payer — cannot be approver)\n8. Receipt uploaded + expense verified", tags: "procurement, finance, policy" },
    { title: "Proposal Template — Event Production", category: "PROPOSAL_TEMPLATE", content: "# [Client] — [Event Name]\n\n## 1. Executive Summary\n[One paragraph: what we'll deliver and why us]\n\n## 2. Scope of Work\n- Event production management\n- Stage + AV + lighting\n- Multicam coverage\n- Livestream (optional)\n- Post-event aftermovie\n\n## 3. Deliverables & Timeline\n| Deliverable | Due |\n|---|---|\n| Pre-production plan | T-14 |\n| Event execution | [Date] |\n| Aftermovie + photos | T+5 |\n\n## 4. Investment\n| Item | Amount (₦) |\n|---|---|\n| Production management | X |\n| Equipment + crew | X |\n| Post-production | X |\n| **Total** | **X** |\n\n## 5. Terms\n- 50% advance to confirm\n- 50% within 14 days post-event\n- Valid for 30 days", tags: "proposal, event, template" },
    { title: "Vendor Onboarding SOP", category: "VENDOR_SOP", content: "# Vendor Onboarding\n\n1. Vendor completes registration form\n2. Verify: company registration (CAC), bank details, past work\n3. Add to DOZ OS vendor database with category\n4. Request 2 references\n5. First job: capped at ₦500K exposure\n6. Rate vendor after each job (1-5 stars)\n7. Review vendor list quarterly; deactivate < 3-star vendors", tags: "vendor, onboarding" },
    { title: "Intern Onboarding & Learning Plan", category: "TRAINING", content: "# Intern Program — 12 Week Plan\n\n## Weeks 1-2: Foundations\n- Company orientation\n- DOZ OS walkthrough\n- Event industry primer\n\n## Weeks 3-6: Shadowing\n- Shadow founder on 2 proposals\n- Attend 1 event prep\n- Complete Premiere Pro + DaVinci basics\n\n## Weeks 7-10: Ownership\n- Own a vendor category\n- Source quotes independently\n- Draft a proposal section\n\n## Weeks 11-12: Evaluation\n- Lead a sub-task end-to-end\n- Performance review\n- Decision: hire / extend / exit", tags: "intern, training, learning" },
    { title: "Daily Reporting Standard", category: "PROCESS", content: "# Daily Report Standard\n\nEvery team member (interns + freelancers on active projects) submits a daily report by 6:00 PM:\n\n- Tasks completed today\n- Tasks planned for tomorrow\n- Blockers (if any)\n- Hours worked\n- Mood (Great / OK / Stressed)\n\nReports feed the founder's morning briefing. No report = flagged in command center.", tags: "process, reporting" },
    { title: "Cash Flow Monitoring Checklist", category: "PROCESS", content: "# Weekly Cash Flow Review\n\nEvery Monday:\n1. Check overdue invoices (> 0 days late)\n2. Check invoices due this week\n3. Review pending payment requests\n4. Confirm cash position vs. 30-day obligations\n5. Flag any project where expenses > 80% of revenue\n6. Update forecast in DOZ OS", tags: "finance, cashflow" },
  ];
  for (const s of sops) await db.sop.create({ data: { ...s, authorId: founder.id } });

  // ---------- AI INSIGHTS ----------
  await db.aIInsight.create({ data: { type: "OVERDUE", severity: "CRITICAL", title: "Invoice INV-2025-061 overdue 9 days", message: "Lagos Chamber of Commerce invoice (₦4,500,000) is 9 days overdue. Recommend escalation call to Dr. Chinyere Alu today." } });
  await db.aIInsight.create({ data: { type: "BUDGET_OVERRUN", severity: "WARNING", title: "LCC project expenses at 104% of budget", message: "Lagos Chamber project expenses (₦1,955,000) have exceeded the ₦3,200,000 budget threshold tracking. Verify all expenses are logged." } });
  await db.aIInsight.create({ data: { type: "RISK", severity: "WARNING", title: "MTN shoot in 14 days — crew not fully confirmed", message: "2 of 6 crew assignments still in ASSIGNED status. Confirm or find replacements." } });
  await db.aIInsight.create({ data: { type: "DISTRACTION", severity: "INFO", title: "14 unread WhatsApp messages flagged as distraction", message: "Batch these into a 30-min block at 4 PM instead of context-switching." } });
  await db.aIInsight.create({ data: { type: "OPPORTUNITY", severity: "INFO", title: "Shell opportunity worth ₦32M needs follow-up", message: "Last contact 6 days ago. Send revised scope today to keep momentum." } });
  await db.aIInsight.create({ data: { type: "OVERDUE", severity: "WARNING", title: "2 tasks overdue from yesterday", message: "Review overdue invoice + approve vendor payment carried over." } });

  // ---------- ACTIVITY LOG ----------
  await db.activityLog.create({ data: { userId: founder.id, action: "Sent proposal", entityType: "PROPOSAL", detail: "GTBank Annual Conference — ₦18.5M", createdAt: daysAgo(6) } });
  await db.activityLog.create({ data: { userId: staff.id, action: "Created RFQ", entityType: "RFQ", detail: "LED Wall for GTBank conference", createdAt: daysAgo(4) } });
  await db.activityLog.create({ data: { userId: founder.id, action: "Approved payment", entityType: "PAYMENT_REQUEST", detail: "StageCraft ₦380,000", createdAt: daysAgo(8) } });
  await db.activityLog.create({ data: { userId: interns[0].id, action: "Submitted daily report", entityType: "DAILY_REPORT", detail: "7h, 3 tasks done", createdAt: daysAgo(0) } });
  await db.activityLog.create({ data: { userId: founder.id, action: "Closed opportunity", entityType: "OPPORTUNITY", opportunityId: createdOpps[5].id, detail: "Lagos Chamber WON — ₦4.5M", createdAt: daysAgo(8) } });
  await db.activityLog.create({ data: { userId: freelancers[5].id, action: "Delivered asset", entityType: "DELIVERABLE", detail: "LCC Aftermovie v1", createdAt: daysAgo(3) } });

  // ---------- VENDOR APPLICATIONS (Phase 2) ----------
  await db.vendorApplication.create({
    data: {
      companyName: "CrystalVisuals NG",
      category: "EQUIPMENT",
      contactName: "Samuel Okwu",
      phone: "+234 807 444 0001",
      email: "samuel@crystalvisuals.ng",
      cacNumber: "BN-9876543",
      bankName: "GTBank",
      bankAccount: "0123456789",
      references: "Standard Chartered Gala 2024\nLagos Fashion Week 2024",
      notes: "Specializes in 4K cinema cameras + stabilizers. Can supply 2x FX6 + 1x Ronin.",
      status: "PENDING",
      createdAt: daysAgo(2),
    },
  });
  await db.vendorApplication.create({
    data: {
      companyName: "PowerSource Generators",
      category: "OTHER",
      contactName: "Ibrahim Sule",
      phone: "+234 807 444 0002",
      email: "ibrahim@powersource.ng",
      cacNumber: "RC-1122334",
      bankName: "Access Bank",
      bankAccount: "0099887766",
      references: "Eko Hotel backup power contracts\nOando events",
      notes: "Silent generators 5kVA-100kVA. Delivery + operator included.",
      status: "PENDING",
      createdAt: daysAgo(1),
    },
  });

  // ---------- MARKETING CAMPAIGNS (Task G3) ----------
  await db.marketingCampaign.create({
    data: {
      name: "Instagram Showcase Q3",
      channel: "SOCIAL",
      status: "ACTIVE",
      budget: 500000,
      spent: 180000,
      leadsGenerated: 9,
      conversions: 2,
      revenue: 5800000,
      startDate: daysAgo(28),
      endDate: daysFromNow(60),
      notes: "Reel series highlighting best event work. Boosted posts targeting Lagos corporate event planners.",
    },
  });
  await db.marketingCampaign.create({
    data: {
      name: "LinkedIn Thought Leadership",
      channel: "SOCIAL",
      status: "ACTIVE",
      budget: 0,
      spent: 0,
      leadsGenerated: 4,
      conversions: 1,
      revenue: 4500000,
      startDate: daysAgo(45),
      notes: "Founder posts on production process, vendor management, event ROI. 2 posts/week.",
    },
  });
  await db.marketingCampaign.create({
    data: {
      name: "Referral Reward Program",
      channel: "REFERRAL",
      status: "PLANNING",
      budget: 750000,
      spent: 0,
      leadsGenerated: 0,
      conversions: 0,
      revenue: 0,
      startDate: daysFromNow(14),
      notes: "₦100K credit for every qualified referral that converts. Target top 5 referrers first.",
    },
  });

  // ---------- CONTENT CALENDAR (Task G3) ----------
  await db.contentCalendarItem.create({
    data: {
      title: "Behind the scenes — MTN Brand Film shoot",
      platform: "INSTAGRAM",
      type: "REEL",
      status: "SCHEDULED",
      scheduledDate: daysFromNow(2),
      topic: "Behind the scenes",
      assigneeId: interns[2].id,
      notes: "60s cutdown from BTS footage. Founder voiceover intro.",
    },
  });
  await db.contentCalendarItem.create({
    data: {
      title: "How we sized the LED wall for GTBank Conference",
      platform: "LINKEDIN",
      type: "ARTICLE",
      status: "DRAFTING",
      scheduledDate: daysFromNow(5),
      topic: "Technical deep-dive",
      assigneeId: founder.id,
      notes: "1200 words. Include diagram + cost breakdown ranges.",
    },
  });
  await db.contentCalendarItem.create({
    data: {
      title: "Lagos Chamber Annual Lecture — aftermovie",
      platform: "INSTAGRAM",
      type: "REEL",
      status: "PUBLISHED",
      scheduledDate: daysAgo(3),
      publishedDate: daysAgo(2),
      topic: "Recent work",
      assigneeId: freelancers[5].id,
    },
  });
  await db.contentCalendarItem.create({
    data: {
      title: "Why 70% of our business comes from referrals",
      platform: "LINKEDIN",
      type: "POST",
      status: "IDEA",
      scheduledDate: daysFromNow(9),
      topic: "Founder voice",
      assigneeId: founder.id,
      notes: "Honest post about referral dependency + what we're doing to diversify.",
    },
  });
  await db.contentCalendarItem.create({
    data: {
      title: "5 questions to ask your event production vendor",
      platform: "EMAIL_NEWSLETTER",
      type: "NEWSLETTER",
      status: "DRAFTING",
      scheduledDate: daysFromNow(7),
      topic: "Lead magnet",
      assigneeId: staff.id,
      notes: "Bi-weekly newsletter to past-clients list (~80 contacts).",
    },
  });

  // ---------- REFERRAL SOURCES (Task G3) ----------
  // Lai Mohammed — referred Dangote documentary (₦12M)
  await db.referralSource.create({
    data: {
      name: "Lai Mohammed",
      contact: "+234 803 111 0008 · lai@consults.ng",
      relationship: "INDUSTRY_CONTACT",
      totalValue: 12000000,
      referralCount: 1,
      lastContactAt: daysAgo(35),
      nextNurtureDate: daysAgo(5),  // overdue
      notes: "Independent consultant. Referred Dangote sustainability doc. Suggested follow-up: share documentary link + impact metrics.",
    },
  });
  // Yetunde Bello (MTN) — referred Access Bank year-end (₦9.5M)
  await db.referralSource.create({
    data: {
      name: "Yetunde Bello",
      contact: "+234 803 111 0002 · yetunde.bello@mtn.com",
      relationship: "CLIENT",
      totalValue: 9500000,
      referralCount: 1,
      lastContactAt: daysAgo(20),
      nextNurtureDate: daysFromNow(3),
      notes: "Events Manager at MTN. Currently producing MTN Brand Film. Send wrap-up gift after delivery.",
    },
  });
  // Femi Adeola (GTBank) — referred MTN brand film (₦24M)
  await db.referralSource.create({
    data: {
      name: "Femi Adeola",
      contact: "+234 803 111 0001 · femi.adeola@gtbank.com",
      relationship: "CLIENT",
      totalValue: 24000000,
      referralCount: 1,
      lastContactAt: daysAgo(10),
      nextNurtureDate: daysFromNow(11),
      notes: "Head of Brand GTBank. Highest-value referrer. Quarterly coffee + production capacity update.",
    },
  });
  // 4th referral source — partner contact with no recent touchpoint
  await db.referralSource.create({
    data: {
      name: "Toks Adeniyi",
      contact: "+234 805 999 0001 · toks@eventpartners.ng",
      relationship: "PARTNER",
      totalValue: 3500000,
      referralCount: 2,
      lastContactAt: daysAgo(48),
      nextNurtureDate: daysAgo(2),  // overdue
      notes: "Runs an event planning agency. Two referrals last year. Could become a formal partnership — explore rev-share.",
    },
  });

  // ---------- ROUTINES (business rhythm) ----------
  const routines = [
    {
      name: "Morning Briefing",
      description: "Start every day with focus. 5 minutes to align before the chaos begins.",
      frequency: "DAILY",
      steps: JSON.stringify([
        "Review today's top 3 priorities",
        "Check pending approvals & payment requests",
        "Scan overdue invoices and tasks",
        "Review intern daily reports from yesterday",
        "Confirm today's event schedule / crew call times",
        "Set phone to Do Not Disturb for deep work block",
      ]),
      icon: "Sunrise",
      color: "amber",
    },
    {
      name: "End of Day Wrap",
      description: "Close out the day so nothing falls through the cracks.",
      frequency: "DAILY",
      steps: JSON.stringify([
        "Update task statuses (done / carried over)",
        "Log any new expenses or receipts",
        "Confirm intern EOD reports submitted",
        "Note tomorrow's #1 priority",
        "Clear inbox to under 10 unread",
      ]),
      icon: "Moon",
      color: "violet",
    },
    {
      name: "Weekly Business Review",
      description: "Every Monday morning. Review the business, not just the tasks.",
      frequency: "WEEKLY",
      steps: JSON.stringify([
        "Review cash position vs 30-day obligations",
        "Check overdue invoices — escalate any >14 days",
        "Review pipeline: which opportunities need follow-up?",
        "Review project profitability — flag any <20% margin",
        "Review intern performance & assign weekly tasks",
        "Update weekly objective progress",
        "Plan top 3 outcomes for the week",
      ]),
      icon: "CalendarDays",
      color: "emerald",
    },
    {
      name: "Event Day Run-Sheet",
      description: "Execute every event with the same discipline.",
      frequency: "EVENT_DAY",
      steps: JSON.stringify([
        "06:00 Crew call — confirm everyone on site",
        "07:00 Load-in & equipment verification",
        "08:00 Power / generator confirmed",
        "09:00 Sound check complete",
        "09:30 Lighting check complete",
        "09:45 Camera positions locked",
        "10:00 Client briefing & walk-through",
        "10:15 Livestream test (if applicable)",
        "10:30 Doors open",
        "Post-event: handover assets receipt signed",
        "Post-event: crew debrief (15 min)",
      ]),
      icon: "Clapperboard",
      color: "teal",
    },
    {
      name: "Monthly Close",
      description: "Close the books and review the month. Last Friday of every month.",
      frequency: "MONTHLY",
      steps: JSON.stringify([
        "Reconcile all expenses with receipts",
        "Verify all invoices sent for the month",
        "Calculate monthly P&L (revenue - expenses)",
        "Review project P&L — identify profit & loss projects",
        "Review vendor performance — rate & cull",
        "Update annual goal progress",
        "Review team capacity & workload",
        "Plan next month's top 3 priorities",
      ]),
      icon: "Wallet",
      color: "rose",
    },
    {
      name: "Sales Pipeline Review",
      description: "Keep the pipeline healthy. Twice a week (Tue & Fri).",
      frequency: "WEEKLY",
      steps: JSON.stringify([
        "Review all open opportunities — which need action?",
        "Follow up on proposals sent >3 days ago",
        "Check proposals near expiry — extend or re-engage",
        "Identify 3 new leads to pursue",
        "Update probability & expected close dates",
        "Nurture top 3 referral sources",
      ]),
      icon: "TrendingUp",
      color: "amber",
    },
  ];
  for (const r of routines) {
    await db.routine.create({ data: r });
  }

  console.log("Seed complete.");
  console.log({ founder: founder.id, interns: interns.length, freelancers: freelancers.length, accounts: accounts.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
