import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// CRM Create endpoint — single POST handler that dispatches by `action`.
// All actions require an authenticated session (getSessionUser()).
// Returns the created record (with light relation includes where useful).

// Default probability per stage — used when creating an opportunity without
// an explicit probability (the UI form does not collect probability).
const PROBABILITY_BY_STAGE: Record<string, number> = {
  DISCOVERY: 20,
  QUALIFIED: 40,
  PROPOSAL: 60,
  NEGOTIATION: 80,
  WON: 100,
  LOST: 0,
};

export async function POST(req: Request) {
  // ---- auth ----
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ---- parse body ----
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action } = body as { action?: string };
  if (!action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  try {
    switch (action) {
      case "create_account":
        return await createAccount(body);
      case "create_opportunity":
        return await createOpportunity(body);
      case "create_proposal":
        return await createProposal(body);
      case "create_followup":
        return await createFollowUp(body);
      case "create_referral":
        return await createReferral(body);
      case "create_lead":
        return await createLead(body);
      case "create_contact":
        return await createContact(body);
      case "create_contract":
        return await createContract(body, sessionUser);
      case "update_contract":
        return await updateContract(body, sessionUser);
      case "delete_account":
        return await deleteAccount(body);
      case "delete_opportunity":
        return await deleteOpportunity(body);
      case "delete_proposal":
        return await deleteProposal(body);
      case "delete_followup":
        return await deleteFollowUp(body);
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ============================================================
// create_account
// Body: { name, industry?, website?, isStrategic? }
// ============================================================
async function createAccount(body: any) {
  const { name, industry, website, isStrategic } = body as {
    name?: string;
    industry?: string;
    website?: string;
    isStrategic?: boolean;
  };

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const account = await db.account.create({
    data: {
      name: name.trim(),
      industry: industry?.trim() || null,
      website: website?.trim() || null,
      isStrategic: Boolean(isStrategic),
    },
  });

  return NextResponse.json({ ok: true, account }, { status: 201 });
}

// ============================================================
// create_opportunity
// Body: { name, accountId?, value, stage?, serviceType?, expectedClose?, source? }
// ============================================================
async function createOpportunity(body: any) {
  const { name, accountId, value, stage, serviceType, expectedClose, source } =
    body as {
      name?: string;
      accountId?: string;
      value?: number | string;
      stage?: string;
      serviceType?: string;
      expectedClose?: string;
      source?: string;
    };

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const numericValue =
    typeof value === "string" ? parseFloat(value) : Number(value ?? 0);
  if (Number.isNaN(numericValue) || numericValue < 0) {
    return NextResponse.json(
      { error: "value must be a non-negative number" },
      { status: 400 }
    );
  }

  const finalStage = stage || "DISCOVERY";
  const probability =
    stage && PROBABILITY_BY_STAGE[stage] !== undefined
      ? PROBABILITY_BY_STAGE[stage]
      : PROBABILITY_BY_STAGE.DISCOVERY;

  // Optional: validate the account exists if provided
  if (accountId) {
    const acct = await db.account.findUnique({ where: { id: accountId } });
    if (!acct) {
      return NextResponse.json(
        { error: "Referenced account not found" },
        { status: 404 }
      );
    }
  }

  const opportunity = await db.opportunity.create({
    data: {
      name: name.trim(),
      accountId: accountId || null,
      value: numericValue,
      stage: finalStage,
      probability,
      serviceType: serviceType?.trim() || null,
      expectedClose: expectedClose ? new Date(expectedClose) : null,
      source: source || "REFERRAL",
    },
    include: { account: true },
  });

  return NextResponse.json({ ok: true, opportunity }, { status: 201 });
}

// ============================================================
// create_proposal
// Body: { opportunityId, title, amount, validUntil? }
// ============================================================
async function createProposal(body: any) {
  const { opportunityId, title, amount, validUntil } = body as {
    opportunityId?: string;
    title?: string;
    amount?: number | string;
    validUntil?: string;
  };

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!opportunityId) {
    return NextResponse.json(
      { error: "opportunityId is required" },
      { status: 400 }
    );
  }

  const numericAmount =
    typeof amount === "string" ? parseFloat(amount) : Number(amount ?? 0);
  if (Number.isNaN(numericAmount) || numericAmount < 0) {
    return NextResponse.json(
      { error: "amount must be a non-negative number" },
      { status: 400 }
    );
  }

  const opp = await db.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opp) {
    return NextResponse.json(
      { error: "Referenced opportunity not found" },
      { status: 404 }
    );
  }

  const proposal = await db.proposal.create({
    data: {
      opportunityId,
      title: title.trim(),
      amount: numericAmount,
      status: "DRAFT",
      validUntil: validUntil ? new Date(validUntil) : null,
    },
    include: { opportunity: { include: { account: true } } },
  });

  return NextResponse.json({ ok: true, proposal }, { status: 201 });
}

// ============================================================
// create_followup
// Body: { opportunityId?, contactId?, type, subject, dueDate, notes? }
// ============================================================
async function createFollowUp(body: any) {
  const { opportunityId, contactId, type, subject, dueDate, notes } = body as {
    opportunityId?: string;
    contactId?: string;
    type?: string;
    subject?: string;
    dueDate?: string;
    notes?: string;
  };

  if (!subject || typeof subject !== "string" || !subject.trim()) {
    return NextResponse.json({ error: "subject is required" }, { status: 400 });
  }
  if (!dueDate) {
    return NextResponse.json({ error: "dueDate is required" }, { status: 400 });
  }

  const validTypes = ["CALL", "EMAIL", "MEETING", "WHATSAPP"];
  const finalType = type && validTypes.includes(type) ? type : "CALL";

  // Validate optional relations if provided
  if (opportunityId) {
    const opp = await db.opportunity.findUnique({
      where: { id: opportunityId },
    });
    if (!opp) {
      return NextResponse.json(
        { error: "Referenced opportunity not found" },
        { status: 404 }
      );
    }
  }
  if (contactId) {
    const c = await db.contact.findUnique({ where: { id: contactId } });
    if (!c) {
      return NextResponse.json(
        { error: "Referenced contact not found" },
        { status: 404 }
      );
    }
  }

  let parsedDue: Date;
  try {
    parsedDue = new Date(dueDate);
    if (Number.isNaN(parsedDue.getTime())) throw new Error("bad date");
  } catch {
    return NextResponse.json(
      { error: "dueDate must be a valid ISO date" },
      { status: 400 }
    );
  }

  const followUp = await db.followUp.create({
    data: {
      opportunityId: opportunityId || null,
      contactId: contactId || null,
      type: finalType,
      subject: subject.trim(),
      notes: notes?.trim() || null,
      dueDate: parsedDue,
      completed: false,
      assigneeId: body.assigneeId || null,
    },
    include: {
      contact: true,
      opportunity: { include: { account: true } },
    },
  });

  return NextResponse.json({ ok: true, followUp }, { status: 201 });
}

// ============================================================
// create_referral
// Body: { referrerName, fromAccountId?, toAccountId?, value?, note? }
// ============================================================
async function createReferral(body: any) {
  const { referrerName, fromAccountId, toAccountId, value, note } = body as {
    referrerName?: string;
    fromAccountId?: string;
    toAccountId?: string;
    value?: number | string;
    note?: string;
  };

  if (!referrerName || typeof referrerName !== "string" || !referrerName.trim()) {
    return NextResponse.json(
      { error: "referrerName is required" },
      { status: 400 }
    );
  }

  const numericValue =
    typeof value === "string" ? parseFloat(value) : Number(value ?? 0);
  if (Number.isNaN(numericValue) || numericValue < 0) {
    return NextResponse.json(
      { error: "value must be a non-negative number" },
      { status: 400 }
    );
  }

  // Validate optional account relations
  if (fromAccountId) {
    const a = await db.account.findUnique({ where: { id: fromAccountId } });
    if (!a) {
      return NextResponse.json(
        { error: "Referenced fromAccount not found" },
        { status: 404 }
      );
    }
  }
  if (toAccountId) {
    const a = await db.account.findUnique({ where: { id: toAccountId } });
    if (!a) {
      return NextResponse.json(
        { error: "Referenced toAccount not found" },
        { status: 404 }
      );
    }
  }

  const referral = await db.referral.create({
    data: {
      referrerName: referrerName.trim(),
      fromAccountId: fromAccountId || null,
      toAccountId: toAccountId || null,
      value: numericValue,
      note: note?.trim() || null,
    },
    include: { toAccount: true, fromAccount: true, referrer: true },
  });

  return NextResponse.json({ ok: true, referral }, { status: 201 });
}

// ============================================================
// create_lead
// Body: { contactName, company?, source?, sourceDetail?, serviceInterest?, value?, direction?, accountId? }
// ============================================================
// A lead is the one-line capture: an inbound enquiry or an outbound target.
// Only `contactName` is required — capture must take seconds, not minutes.
async function createLead(body: any) {
  const { contactName, company, source, sourceDetail, serviceInterest, value, direction, accountId } = body;

  if (!contactName || typeof contactName !== "string" || !contactName.trim()) {
    return NextResponse.json({ error: "contactName is required" }, { status: 400 });
  }

  const dir = direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND";

  if (accountId) {
    const account = await db.account.findUnique({ where: { id: accountId } });
    if (!account) {
      return NextResponse.json({ error: "account not found" }, { status: 404 });
    }
  }

  const lead = await db.lead.create({
    data: {
      contactName: contactName.trim(),
      company: company?.trim() || null,
      source: typeof source === "string" && source.trim() ? source.trim() : "REFERRAL",
      sourceDetail: sourceDetail?.trim() || null,
      serviceInterest: serviceInterest?.trim() || null,
      value: Number(value) || 0,
      direction: dir,
      accountId: accountId || null,
      status: "NEW",
    },
  });

  return NextResponse.json({ ok: true, lead }, { status: 201 });
}

// ============================================================
// create_contact
// Body: { name, accountId?, title?, email?, phone?, isDecisionMaker? }
// ============================================================
// Adding a second contact to an account is how single-threading gets fixed,
// so this stays deliberately minimal: a name and an account.
async function createContact(body: any) {
  const { name, accountId, title, email, phone, isDecisionMaker } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (accountId) {
    const account = await db.account.findUnique({ where: { id: accountId } });
    if (!account) {
      return NextResponse.json({ error: "account not found" }, { status: 404 });
    }
  }

  const contact = await db.contact.create({
    data: {
      name: name.trim(),
      accountId: accountId || null,
      title: title?.trim() || null,
      email: email?.trim().toLowerCase() || null,
      phone: phone?.trim() || null,
      isDecisionMaker: Boolean(isDecisionMaker),
    },
  });

  return NextResponse.json({ ok: true, contact }, { status: 201 });
}

// ============================================================
// create_contract / update_contract
// Body (create): { accountId, title, value?, status?, isRecurring?, startDate?, endDate?, renewalDate?, notes? }
// Body (update): { contractId, title?, value?, status?, isRecurring?, startDate?, endDate?, renewalDate?, notes? }
// ============================================================
const CONTRACT_STATUSES = new Set(["DRAFT", "SENT", "SIGNED", "ACTIVE", "EXPIRED", "TERMINATED"]);

// Contracts move money and define the company's recurring revenue, so they are
// FOUNDER-only. A retainer has an accountId and no projectId.
async function createContract(body: any, sessionUser: { role: string }) {
  if (sessionUser.role !== "FOUNDER") {
    return NextResponse.json({ error: "forbidden — founder only" }, { status: 403 });
  }
  const { accountId, title, value, status, isRecurring, startDate, endDate, renewalDate, notes } = body;

  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }
  if (!title || !String(title).trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) {
    return NextResponse.json({ error: "account not found" }, { status: 404 });
  }
  const nextStatus = CONTRACT_STATUSES.has(status) ? status : "DRAFT";

  const contract = await db.contract.create({
    data: {
      accountId,
      projectId: null,
      title: String(title).trim(),
      value: Number(value) || 0,
      status: nextStatus,
      isRecurring: isRecurring !== false,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      renewalDate: renewalDate ? new Date(renewalDate) : null,
      notes: notes?.trim() || null,
    },
  });

  return NextResponse.json({ ok: true, contract }, { status: 201 });
}

async function updateContract(body: any, sessionUser: { role: string }) {
  if (sessionUser.role !== "FOUNDER") {
    return NextResponse.json({ error: "forbidden — founder only" }, { status: 403 });
  }
  const { contractId, title, value, status, isRecurring, startDate, endDate, renewalDate, notes } = body;

  if (!contractId) {
    return NextResponse.json({ error: "contractId is required" }, { status: 400 });
  }
  const existing = await db.contract.findUnique({ where: { id: contractId } });
  if (!existing) {
    return NextResponse.json({ error: "contract not found" }, { status: 404 });
  }

  const data: any = {};
  if (title !== undefined) {
    // title is a required, non-nullable column — an explicit null/empty is a
    // client error, not a request to clear the field. Reject rather than
    // silently writing the literal string "null" or silently ignoring it.
    if (title === null || !String(title).trim()) {
      return NextResponse.json({ error: "title cannot be null or empty" }, { status: 400 });
    }
    data.title = String(title).trim();
  }
  if (value !== undefined) data.value = Number(value) || 0;
  if (status !== undefined && CONTRACT_STATUSES.has(status)) data.status = status;
  if (isRecurring !== undefined) data.isRecurring = Boolean(isRecurring);
  if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
  if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
  if (renewalDate !== undefined) data.renewalDate = renewalDate ? new Date(renewalDate) : null;
  if (notes !== undefined) data.notes = notes?.trim() || null;

  const contract = await db.contract.update({ where: { id: contractId }, data });
  return NextResponse.json({ ok: true, contract });
}

// ============================================================
// DELETE FUNCTIONS
// ============================================================

async function deleteAccount(body: any) {
  const { accountId } = body;
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });
  await db.account.delete({ where: { id: accountId } });
  return NextResponse.json({ ok: true });
}

async function deleteOpportunity(body: any) {
  const { opportunityId } = body;
  if (!opportunityId) return NextResponse.json({ error: "opportunityId required" }, { status: 400 });
  await db.opportunity.delete({ where: { id: opportunityId } });
  return NextResponse.json({ ok: true });
}

async function deleteProposal(body: any) {
  const { proposalId } = body;
  if (!proposalId) return NextResponse.json({ error: "proposalId required" }, { status: 400 });
  await db.proposal.delete({ where: { id: proposalId } });
  return NextResponse.json({ ok: true });
}

async function deleteFollowUp(body: any) {
  const { followUpId } = body;
  if (!followUpId) return NextResponse.json({ error: "followUpId required" }, { status: 400 });
  await db.followUp.delete({ where: { id: followUpId } });
  return NextResponse.json({ ok: true });
}
