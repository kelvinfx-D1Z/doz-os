import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// ============================================================
// MY PROFILE — the employment record each person maintains themselves.
//
// Every other place team data lives (Team Management, Staff Hub) is
// FOUNDER-only, so before this route a member had no way to enter or
// correct their own details.
//
// GET   -> the signed-in user's own record.
//          ?userId=xxx lets the FOUNDER read someone else's.
// PATCH -> update your OWN record only. The user id always comes from
//          the session, never from the body, so nobody can write to
//          another person's profile by guessing an id.
//
// BANK DETAILS visibility:
//   - you always see your own
//   - the FOUNDER sees everyone's
//   - anyone with `canViewBankDetails` granted sees everyone's
//     (this is how an accountant gets payment access without being
//     handed a STAFF role and everything that comes with it)
// Role is NOT editable here — only the founder can change roles, from
// Team Management.
// ============================================================

const BANK_FIELDS = ["bankName", "bankAccount", "bankAccountName"] as const;

function shape(u: any, includeBank: boolean) {
  const base = {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    title: u.title,
    phone: u.phone,
    address: u.address,
    avatar: u.avatar,
    capacity: u.capacity,
    isActive: u.isActive,
    dateOfBirth: u.dateOfBirth,
    startDate: u.startDate,
    idNumber: u.idNumber,
    emergencyName: u.emergencyName,
    emergencyPhone: u.emergencyPhone,
    emergencyRelationship: u.emergencyRelationship,
    nextOfKinName: u.nextOfKinName,
    nextOfKinPhone: u.nextOfKinPhone,
    nextOfKinRelationship: u.nextOfKinRelationship,
    guarantorName: u.guarantorName,
    guarantorPhone: u.guarantorPhone,
    guarantorAddress: u.guarantorAddress,
    canViewBankDetails: u.canViewBankDetails,
  };
  if (!includeBank) return base;
  return { ...base, bankName: u.bankName, bankAccount: u.bankAccount, bankAccountName: u.bankAccountName };
}

export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestedId = searchParams.get("userId");
  const isFounder = session.role === "FOUNDER";

  // Reading someone else's profile is founder-only.
  if (requestedId && requestedId !== session.id && !isFounder) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const targetId = requestedId || session.id;

  const user = await db.user.findUnique({ where: { id: targetId } });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Bank visibility: own record, founder, or explicitly granted.
  const viewer = isFounder
    ? { canViewBankDetails: true }
    : await db.user.findUnique({
        where: { id: session.id },
        select: { canViewBankDetails: true },
      });
  const includeBank =
    targetId === session.id || isFounder || Boolean(viewer?.canViewBankDetails);

  return NextResponse.json({ profile: shape(user, includeBank), canEdit: targetId === session.id });
}

export async function PATCH(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const text = (v: unknown) =>
    v === undefined ? undefined : typeof v === "string" && v.trim() ? v.trim() : null;
  const date = (v: unknown) => {
    if (v === undefined) return undefined;
    if (!v) return null;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? undefined : d;
  };

  const data: Record<string, unknown> = {};
  // Name is required if sent — an empty name breaks every list in the app.
  if (body.name !== undefined) {
    const n = typeof body.name === "string" ? body.name.trim() : "";
    if (!n) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    data.name = n;
  }
  for (const f of ["title", "phone", "address", "idNumber",
    "emergencyName", "emergencyPhone", "emergencyRelationship",
    "nextOfKinName", "nextOfKinPhone", "nextOfKinRelationship",
    "guarantorName", "guarantorPhone", "guarantorAddress",
    ...BANK_FIELDS]) {
    const v = text(body[f]);
    if (v !== undefined) data[f] = v;
  }
  for (const f of ["dateOfBirth", "startDate"]) {
    const v = date(body[f]);
    if (v !== undefined) data[f] = v;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  // Always the session user — never an id from the request body.
  const updated = await db.user.update({ where: { id: session.id }, data });
  return NextResponse.json({ ok: true, profile: shape(updated, true) });
}
