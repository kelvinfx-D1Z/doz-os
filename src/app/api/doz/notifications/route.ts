import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { generateProactiveInsights } from "@/lib/didi-engine";

// GET — notifications for current user
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Fetch stored notifications
  const notifications = await db.notificationLog.findMany({
    where: { userId: user.id, isRead: false },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Also generate live notifications from DIDI's proactive engine
  let liveNotifications: any[] = [];
  try {
    const insights = await generateProactiveInsights(user.id);
    liveNotifications = insights.filter(i => i.severity === "CRITICAL" || i.severity === "ACTION").map(insight => ({
      id: `live_${insight.type}_${Date.now()}`,
      type: insight.type,
      title: insight.title,
      message: insight.message,
      severity: insight.severity,
      recommendedAction: insight.recommendedAction,
      isRead: false,
      createdAt: new Date().toISOString(),
      source: "DIDI_LIVE",
    }));
  } catch {
    // If DIDI engine fails, still return stored notifications
  }

  return NextResponse.json({
    notifications: [...liveNotifications, ...notifications.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      severity: n.severity,
      isRead: n.isRead,
      createdAt: n.createdAt,
      source: "STORED",
    }))],
    unreadCount: liveNotifications.length + notifications.filter(n => !n.isRead).length,
  });
}

// POST — mark as read, create notification
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  if (body.action === "mark_read") {
    if (!body.notificationId) return NextResponse.json({ error: "notificationId required" }, { status: 400 });
    // Only mark stored notifications (live ones don't have DB records)
    if (!body.notificationId.startsWith("live_")) {
      await db.notificationLog.update({ where: { id: body.notificationId }, data: { isRead: true } });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "mark_all_read") {
    await db.notificationLog.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
