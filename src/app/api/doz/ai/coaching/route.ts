import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const nudges = await db.aICoachingNudge.findMany({
    where: { isRead: false },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json({ nudges, unreadCount: nudges.length });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.nudgeId) return NextResponse.json({ error: "nudgeId required" }, { status: 400 });

  await db.aICoachingNudge.update({
    where: { id: body.nudgeId },
    data: { isRead: true },
  });

  return NextResponse.json({ ok: true });
}
