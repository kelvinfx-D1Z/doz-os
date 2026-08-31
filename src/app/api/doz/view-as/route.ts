import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getRealSessionUser, VIEW_AS_COOKIE, VIEW_AS_INFO_COOKIE } from "@/lib/auth";
import { serialiseViewAsInfo } from "@/lib/view-as-cookie";

// Founder-only impersonation.
//
//   GET    -> who am I really, and who am I viewing as? plus the pickable list
//   POST   -> { userId } start viewing as that person
//   DELETE -> stop
//
// Deliberately uses getRealSessionUser(), never getSessionUser(): the latter
// already resolves to the impersonated user, so authorising with it would let
// an impersonated session change who it is impersonating.

async function requireRealFounder() {
  const real = await getRealSessionUser();
  if (!real) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (real.role !== "FOUNDER") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { real };
}

export async function GET() {
  const auth = await requireRealFounder();
  if ("error" in auth) {
    // Non-founders simply are not impersonating; not an error worth surfacing.
    return NextResponse.json({ impersonating: false, viewingAs: null, users: [] });
  }

  const jar = await cookies();
  const targetId = jar.get(VIEW_AS_COOKIE)?.value ?? null;

  const [users, target] = await Promise.all([
    db.user.findMany({
      where: { isActive: true, id: { not: auth.real.id } },
      select: { id: true, name: true, email: true, role: true, title: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    targetId
      ? db.user.findUnique({
          where: { id: targetId },
          select: { id: true, name: true, email: true, role: true },
        })
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    impersonating: Boolean(target),
    viewingAs: target,
    realUser: { id: auth.real.id, name: auth.real.name },
    users,
  });
}

export async function POST(req: Request) {
  const auth = await requireRealFounder();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const userId = String(body?.userId ?? "").trim();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (userId === auth.real.id) {
    return NextResponse.json({ error: "you are already yourself" }, { status: 400 });
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, isActive: true, permissions: true, title: true, email: true },
  });
  if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });
  if (!target.isActive) {
    return NextResponse.json({ error: `${target.name} is deactivated and cannot be viewed as` }, { status: 400 });
  }

  const jar = await cookies();
  jar.set(VIEW_AS_COOKIE, target.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60, // an hour is plenty; it should never be left on by accident
  });

  // A second, deliberately READABLE cookie carrying only what the UI needs to
  // render as this person. Without it the client keeps rendering the founder
  // layout — which expects revenue and margin the server has already stripped
  // — and crashes on undefined.
  //
  // Not a security boundary: the httpOnly cookie above is the authority, and
  // the server shapes every response from it. Tampering with this one only
  // gives the tamperer a wrong-looking UI in their own browser.
  //
  // Serialised through src/lib/view-as-cookie.ts, which the client reads with
  // the matching parser. Do NOT encode it here: `jar.set` percent-encodes on
  // the way out, and pre-encoding made the browser store a doubly-encoded
  // value that the client's single decode could never parse — so the shell
  // silently fell back to the founder and view-as never worked.
  jar.set(VIEW_AS_INFO_COOKIE, serialiseViewAsInfo({
    id: target.id,
    name: target.name,
    email: target.email,
    role: target.role,
    title: target.title ?? undefined,
    permissions: target.permissions ? JSON.parse(target.permissions) : null,
  }), {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  });

  // Logged against the FOUNDER, so the trail shows who looked, not a phantom
  // action by the person being viewed.
  try {
    await db.activityLog.create({
      data: {
        userId: auth.real.id,
        action: "VIEWED_AS_USER",
        detail: `Started viewing the app as ${target.name} (${target.role})`,
      },
    });
  } catch {}

  return NextResponse.json({ ok: true, viewingAs: { id: target.id, name: target.name, role: target.role } });
}

export async function DELETE() {
  const auth = await requireRealFounder();
  if ("error" in auth) return auth.error;
  const jar = await cookies();
  jar.delete(VIEW_AS_COOKIE);
  jar.delete(VIEW_AS_INFO_COOKIE);
  return NextResponse.json({ ok: true });
}
