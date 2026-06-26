// One-off targeted seed for the Marketing & Growth module (Task G3).
// Inserts only MarketingCampaign / ContentCalendarItem / ReferralSource rows.
// Safe to re-run: clears these three tables first.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const now = new Date();
const daysFromNow = (n: number) => new Date(now.getTime() + n * 86400000);
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);

async function main() {
  console.log("Seeding marketing data (Task G3)...");

  // Wipe marketing tables (idempotent re-run)
  await db.referralSource.deleteMany({});
  await db.contentCalendarItem.deleteMany({});
  await db.marketingCampaign.deleteMany({});

  // ---------- USERS lookup (assignee references) ----------
  const founder = await db.user.findFirst({ where: { role: "FOUNDER" } });
  const staff = await db.user.findFirst({ where: { role: "STAFF" } });
  const interns = await db.user.findMany({ where: { role: "INTERN" } });
  const freelancers = await db.user.findMany({ where: { role: "FREELANCER" } });
  if (!founder || !staff || interns.length < 1 || freelancers.length < 6) {
    throw new Error("Required users not found — run main seed first.");
  }

  // ---------- MARKETING CAMPAIGNS ----------
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

  // ---------- CONTENT CALENDAR ----------
  await db.contentCalendarItem.create({
    data: {
      title: "Behind the scenes — MTN Brand Film shoot",
      platform: "INSTAGRAM",
      type: "REEL",
      status: "SCHEDULED",
      scheduledDate: daysFromNow(2),
      topic: "Behind the scenes",
      assigneeId: interns[0].id,
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

  // ---------- REFERRAL SOURCES ----------
  await db.referralSource.create({
    data: {
      name: "Lai Mohammed",
      contact: "+234 803 111 0008 · lai@consults.ng",
      relationship: "INDUSTRY_CONTACT",
      totalValue: 12000000,
      referralCount: 1,
      lastContactAt: daysAgo(35),
      nextNurtureDate: daysAgo(5), // overdue
      notes: "Independent consultant. Referred Dangote sustainability doc. Suggested follow-up: share documentary link + impact metrics.",
    },
  });
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
  await db.referralSource.create({
    data: {
      name: "Toks Adeniyi",
      contact: "+234 805 999 0001 · toks@eventpartners.ng",
      relationship: "PARTNER",
      totalValue: 3500000,
      referralCount: 2,
      lastContactAt: daysAgo(48),
      nextNurtureDate: daysAgo(2), // overdue
      notes: "Runs an event planning agency. Two referrals last year. Could become a formal partnership — explore rev-share.",
    },
  });

  console.log("Marketing seed complete.");
  console.log({
    campaigns: 3,
    contentItems: 5,
    referralSources: 4,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
