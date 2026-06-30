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
