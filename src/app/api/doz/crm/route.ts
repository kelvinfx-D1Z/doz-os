import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// CRM & Sales Engine — pipeline, accounts, contacts, leads, proposals, follow-ups, referrals
export async function GET() {
  const now = new Date();

  const [opportunities, accounts, contacts, leads, proposals, followUps, referrals] =
    await Promise.all([
      db.opportunity.findMany({
        include: {
          account: true,
          contact: true,
          proposals: true,
          followUps: { orderBy: { dueDate: "asc" } },
        },
        orderBy: { value: "desc" },
      }),
      db.account.findMany({
        include: {
          _count: { select: { opportunities: true, projects: true } },
        },
        orderBy: { lifetimeValue: "desc" },
      }),
      db.contact.findMany({
        include: { account: true },
        orderBy: { name: "asc" },
      }),
      db.lead.findMany({
        include: { contact: true },
        orderBy: { createdAt: "desc" },
      }),
      db.proposal.findMany({
        include: { opportunity: { include: { account: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.followUp.findMany({
        include: {
          contact: true,
          opportunity: { include: { account: true } },
        },
        orderBy: { dueDate: "asc" },
      }),
      db.referral.findMany({
        include: { toAccount: true, fromAccount: true, referrer: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  // ---- compute stats ----
  const openOpps = opportunities.filter((o) => !["WON", "LOST"].includes(o.stage));
  const wonOpps = opportunities.filter((o) => o.stage === "WON");
  const lostOpps = opportunities.filter((o) => o.stage === "LOST");

  const totalPipeline = openOpps.reduce((s, o) => s + o.value, 0);
  const weightedPipeline = openOpps.reduce((s, o) => s + (o.value * o.probability) / 100, 0);

  const proposalsSent = proposals.filter((p) => p.status === "SENT");
  const proposalsAccepted = proposals.filter((p) => p.status === "ACCEPTED");
  const conversionRate =
    proposals.length > 0 ? (proposalsAccepted.length / proposals.length) * 100 : 0;

  const openFollowUps = followUps.filter((f) => !f.completed);
  const overdueFollowUps = openFollowUps.filter((f) => new Date(f.dueDate) < now);

  const strategicAccounts = accounts.filter((a) => a.isStrategic).length;
  const totalReferralValue = referrals.reduce((s, r) => s + r.value, 0);

  // ---- pipeline by stage (open opportunities only) ----
  const STAGES = ["DISCOVERY", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON"];
  const pipelineByStage = STAGES.map((stage) => {
    const items = opportunities.filter((o) => o.stage === stage);
    return {
      stage,
      count: items.length,
      value: items.reduce((s, o) => s + o.value, 0),
    };
  });

  // ---- shape opportunities for response (flatten includes) ----
  const shapedOpps = opportunities.map((o) => ({
    id: o.id,
    name: o.name,
    stage: o.stage,
    value: o.value,
    probability: o.probability,
    expectedClose: o.expectedClose,
    source: o.source,
    serviceType: o.serviceType,
    account: o.account
      ? { name: o.account.name, isStrategic: o.account.isStrategic }
      : null,
    contact: o.contact ? { name: o.contact.name } : null,
    proposals: o.proposals.map((p) => ({
      id: p.id,
      title: p.title,
      amount: p.amount,
      status: p.status,
    })),
    followUps: o.followUps.map((f) => ({
      id: f.id,
      subject: f.subject,
      dueDate: f.dueDate,
      completed: f.completed,
    })),
  }));

  const shapedAccounts = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    industry: a.industry,
    isStrategic: a.isStrategic,
    lifetimeValue: a.lifetimeValue,
    _count: { opportunities: a._count.opportunities, projects: a._count.projects },
  }));

  const shapedContacts = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    email: c.email,
    phone: c.phone,
    isDecisionMaker: c.isDecisionMaker,
    account: c.account ? { name: c.account.name } : null,
  }));

  const shapedLeads = leads.map((l) => ({
    id: l.id,
    contactName: l.contactName,
    company: l.company,
    source: l.source,
    sourceDetail: l.sourceDetail,
    status: l.status,
    value: l.value,
    serviceInterest: l.serviceInterest,
    createdAt: l.createdAt,
  }));

  const shapedProposals = proposals.map((p) => ({
    id: p.id,
    title: p.title,
    amount: p.amount,
    status: p.status,
    sentDate: p.sentDate,
    responseDate: p.responseDate,
    validUntil: p.validUntil,
    opportunity: p.opportunity
      ? { name: p.opportunity.name, account: p.opportunity.account ? { name: p.opportunity.account.name } : null }
      : null,
  }));

  const shapedFollowUps = followUps.map((f) => ({
    id: f.id,
    type: f.type,
    subject: f.subject,
    notes: f.notes,
    dueDate: f.dueDate,
    completed: f.completed,
    contact: f.contact ? { name: f.contact.name } : null,
    opportunity: f.opportunity
      ? { name: f.opportunity.name, account: f.opportunity.account ? { name: f.opportunity.account.name } : null }
      : null,
  }));

  const shapedReferrals = referrals.map((r) => ({
    id: r.id,
    referrerName: r.referrerName ?? r.referrer?.name ?? "—",
    value: r.value,
    note: r.note,
    toAccount: r.toAccount ? { name: r.toAccount.name } : null,
    createdAt: r.createdAt,
  }));

  return NextResponse.json({
    stats: {
      totalPipeline,
      weightedPipeline,
      openOpps: openOpps.length,
      wonOpps: wonOpps.length,
      lostOpps: lostOpps.length,
      proposalsSent: proposalsSent.length,
      proposalsAccepted: proposalsAccepted.length,
      conversionRate,
      openFollowUps: openFollowUps.length,
      overdueFollowUps: overdueFollowUps.length,
      strategicAccounts,
      totalReferralValue,
    },
    opportunities: shapedOpps,
    accounts: shapedAccounts,
    contacts: shapedContacts,
    leads: shapedLeads,
    proposals: shapedProposals,
    followUps: shapedFollowUps,
    referrals: shapedReferrals,
    pipelineByStage,
  });
}
