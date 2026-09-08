import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";
import { validateSignature } from "@/lib/signature-image";

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
  "logoUrl", "defaultPaymentTerms", "signatureName",
] as const;

// signatureUrl is deliberately NOT in EDITABLE. Every field above is a
// short piece of text that only has to be trimmed; the signature is an
// uploaded image arriving as a data URL, and it gets its own validation —
// format allowlist and size cap — before it can be written. Handling it
// with the same one-line trim as a phone number is how a route ends up
// storing an SVG, or a 4MB photograph, in the render path of every
// document. See src/lib/signature-image.ts.

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

  // Absent means this form did not touch the signature and whatever is
  // stored stays. An empty string or null is the founder deliberately
  // removing it — the two are not the same, and conflating them would let
  // any partial update silently wipe the signature off every document.
  if (body.signatureUrl !== undefined) {
    const sig = validateSignature(body.signatureUrl);
    if ("error" in sig) {
      return NextResponse.json({ error: sig.error }, { status: 400 });
    }
    data.signatureUrl = sig.value;
  }
  if (!data.legalName) delete data.legalName;

  await loadCompany();
  const company = await db.companySettings.update({
    where: { id: SINGLETON },
    data,
  });
  return NextResponse.json({ ok: true, company });
}
