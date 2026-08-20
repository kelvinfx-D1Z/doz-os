import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { getRealSessionUser, hashPassword, verifyPassword } from "@/lib/auth";

// ============================================================
// ACCOUNT RECOVERY CODES
//
// The founder has nobody above them. Everyone else can be reset from Team
// Management; the founder cannot, so a lost laptop or forgotten password would
// lock the owner out of their own company for good.
//
// There is no email provider here, so a reset link is not an option. Recovery
// codes need no infrastructure: generate a set, keep them somewhere physical,
// and exchange one for a new password.
//
//   GET    -> how many unused codes do I have (authenticated)
//   POST   -> generate a fresh set, shown ONCE (authenticated)
//   PUT    -> redeem a code to set a new password (UNAUTHENTICATED, by design)
// ============================================================

const CODE_COUNT = 8;

/** Human-transcribable: no 0/O/1/I/L, grouped for reading aloud. */
function generateCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = () =>
    alphabet[crypto.randomInt(0, alphabet.length)];
  const group = () => Array.from({ length: 4 }, pick).join("");
  return `${group()}-${group()}-${group()}`;
}

export async function GET() {
  const user = await getRealSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [unused, total] = await Promise.all([
    db.recoveryCode.count({ where: { userId: user.id, usedAt: null } }),
    db.recoveryCode.count({ where: { userId: user.id } }),
  ]);
  return NextResponse.json({ unused, total, used: total - unused });
}

export async function POST() {
  const user = await getRealSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const codes = Array.from({ length: CODE_COUNT }, generateCode);
  const label = `generated ${new Date().toISOString().slice(0, 10)}`;

  // Generating a new set invalidates the old one, so a printout that has been
  // lost or photographed stops working the moment a replacement is made.
  await db.$transaction([
    db.recoveryCode.deleteMany({ where: { userId: user.id } }),
    db.recoveryCode.createMany({
      data: codes.map((c) => ({ userId: user.id, codeHash: hashPassword(c), label })),
    }),
  ]);

  try {
    await db.activityLog.create({
      data: {
        userId: user.id,
        action: "GENERATED_RECOVERY_CODES",
        detail: `Generated ${CODE_COUNT} recovery codes; any previous set was invalidated`,
      },
    });
  } catch {}

  // The ONLY time the plaintext exists. Nothing stores it.
  return NextResponse.json({ codes, count: codes.length });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").toLowerCase().trim();
  const code = String(body?.code ?? "").toUpperCase().trim();
  const newPassword = String(body?.newPassword ?? "");

  if (!email || !code || !newPassword) {
    return NextResponse.json({ error: "email, code and new password are required" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "new password must be at least 8 characters" }, { status: 400 });
  }

  // Deliberately identical response for "no such user", "wrong code" and
  // "already used". Anything more specific tells an attacker which half of the
  // pair they got right, and confirms whether an email exists.
  const invalid = () =>
    NextResponse.json({ error: "That code is not valid, or has already been used." }, { status: 403 });

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, isActive: true },
  });
  if (!user || !user.isActive) return invalid();

  const candidates = await db.recoveryCode.findMany({
    where: { userId: user.id, usedAt: null },
    select: { id: true, codeHash: true },
  });

  // Check every candidate rather than breaking early, so the work done does not
  // depend on which code matched.
  let matchId: string | null = null;
  for (const c of candidates) {
    if (verifyPassword(code, c.codeHash) && matchId === null) matchId = c.id;
  }
  if (!matchId) return invalid();

  // Consume the code and set the password together — a half-applied recovery
  // would either burn the code without helping or leave it reusable.
  await db.$transaction([
    db.recoveryCode.update({ where: { id: matchId }, data: { usedAt: new Date() } }),
    db.user.update({ where: { id: user.id }, data: { password: hashPassword(newPassword) } }),
  ]);

  try {
    await db.activityLog.create({
      data: {
        userId: user.id,
        action: "PASSWORD_RECOVERED",
        detail: `${user.name} recovered their account using a recovery code`,
      },
    });
  } catch {}

  const remaining = await db.recoveryCode.count({ where: { userId: user.id, usedAt: null } });
  return NextResponse.json({ ok: true, remaining });
}
