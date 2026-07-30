import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// ============================================================
// INTERNAL MESSAGING — two-way direct messages.
//
// A "thread" is just every message exchanged between two people; there
// is no Thread row to keep in sync.
//
// GET  -> ?with=USER_ID  a single thread, and marks the other side's
//                        messages to you as read
//         (no param)     one summary row per person you can talk to,
//                        with the last message and unread count
// POST -> { recipientId, body } send a message
//
// Who can message whom: the FOUNDER can message any active user.
// Everyone else can only message the FOUNDER. That keeps this a
// founder-to-team channel rather than an unmoderated staff chat, which
// is what was asked for — and it means an intern cannot DM a client
// contact or another intern.
// ============================================================

const MAX_BODY = 4000;

async function founderId(): Promise<string | null> {
  const f = await db.user.findFirst({
    where: { role: "FOUNDER", isActive: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return f?.id ?? null;
}

export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const withUser = searchParams.get("with");
  const isFounder = session.role === "FOUNDER";

  if (withUser) {
    // Non-founders may only open the thread with the founder.
    if (!isFounder) {
      const fid = await founderId();
      if (withUser !== fid) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }
    const other = await db.user.findUnique({
      where: { id: withUser },
      select: { id: true, name: true, role: true, title: true, avatar: true },
    });
    if (!other) return NextResponse.json({ error: "user not found" }, { status: 404 });

    const messages = await db.message.findMany({
      where: {
        OR: [
          { senderId: session.id, recipientId: withUser },
          { senderId: withUser, recipientId: session.id },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 300,
    });

    // Mark their messages to me as read.
    await db.message.updateMany({
      where: { senderId: withUser, recipientId: session.id, readAt: null },
      data: { readAt: new Date() },
    });

    return NextResponse.json({
      with: other,
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        readAt: m.readAt,
        mine: m.senderId === session.id,
      })),
    });
  }

  // Thread list. Founder sees everyone; everyone else sees just the founder.
  const people = isFounder
    ? await db.user.findMany({
        where: { isActive: true, id: { not: session.id } },
        select: { id: true, name: true, role: true, title: true, avatar: true },
        orderBy: [{ role: "asc" }, { name: "asc" }],
      })
    : await db.user.findMany({
        where: { isActive: true, role: "FOUNDER" },
        select: { id: true, name: true, role: true, title: true, avatar: true },
      });

  const threads = await Promise.all(
    people.map(async (p) => {
      const [last, unread] = await Promise.all([
        db.message.findFirst({
          where: {
            OR: [
              { senderId: session.id, recipientId: p.id },
              { senderId: p.id, recipientId: session.id },
            ],
          },
          orderBy: { createdAt: "desc" },
        }),
        db.message.count({
          where: { senderId: p.id, recipientId: session.id, readAt: null },
        }),
      ]);
      return {
        user: p,
        lastMessage: last ? { body: last.body, createdAt: last.createdAt, mine: last.senderId === session.id } : null,
        unread,
      };
    }),
  );

  // People you've actually talked to float to the top, then unread, then name.
  threads.sort((a, b) => {
    if (b.unread !== a.unread) return b.unread - a.unread;
    const at = a.lastMessage?.createdAt?.getTime() ?? 0;
    const bt = b.lastMessage?.createdAt?.getTime() ?? 0;
    if (bt !== at) return bt - at;
    return a.user.name.localeCompare(b.user.name);
  });

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);
  return NextResponse.json({ threads, totalUnread });
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const recipientId = body?.recipientId;
  const text = typeof body?.body === "string" ? body.body.trim() : "";

  if (!recipientId) return NextResponse.json({ error: "recipientId required" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });
  if (text.length > MAX_BODY) {
    return NextResponse.json({ error: `Message is too long (max ${MAX_BODY} characters)` }, { status: 400 });
  }
  if (recipientId === session.id) {
    return NextResponse.json({ error: "You can't message yourself" }, { status: 400 });
  }

  const recipient = await db.user.findUnique({
    where: { id: recipientId },
    select: { id: true, name: true, isActive: true, role: true },
  });
  if (!recipient) return NextResponse.json({ error: "recipient not found" }, { status: 404 });
  if (!recipient.isActive) {
    return NextResponse.json({ error: `${recipient.name} is deactivated` }, { status: 409 });
  }

  // Non-founders may only write to the founder.
  if (session.role !== "FOUNDER" && recipient.role !== "FOUNDER") {
    return NextResponse.json(
      { error: "You can only message the founder" },
      { status: 403 },
    );
  }

  const message = await db.message.create({
    data: { senderId: session.id, recipientId, body: text },
  });

  return NextResponse.json({ ok: true, message: { id: message.id, body: message.body, createdAt: message.createdAt, mine: true } }, { status: 201 });
}
