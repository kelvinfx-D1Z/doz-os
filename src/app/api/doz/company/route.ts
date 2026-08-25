import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";

const SINGLETON = "singleton";

/** The one company record every document reads from. Created on first access. */
async function loadCompany() {
  return db.companySettings.upsert({
    where: { id: SINGLETON },
    update: {},
    create: { id: SINGLETON },
  });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ company: await loadCompany() });
}

const EDITABLE = [
  "legalName", "tradingName", "address", "phone", "email", "website",
  "rcNumber", "tin", "bankName", "bankAccount", "bankAccountName",
  "logoUrl", "defaultPaymentTerms",
] as const;

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "FOUNDER") {
    return NextResponse.json(
      { error: "Only the founder can change company details" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: Record<string, string | boolean | null> = {};
  for (const key of EDITABLE) {
    if (body[key] !== undefined) {
      const v = body[key];
      data[key] = typeof v === "string" ? v.trim() || null : null;
    }
  }
  if (typeof body.vatRegistered === "boolean") {
    data.vatRegistered = body.vatRegistered;
  }
  if (!data.legalName) delete data.legalName;

  await loadCompany();
  const company = await db.companySettings.update({
    where: { id: SINGLETON },
    data,
  });
  return NextResponse.json({ ok: true, company });
}
