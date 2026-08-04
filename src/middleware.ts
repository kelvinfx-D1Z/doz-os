import { NextResponse, type NextRequest } from "next/server";

// While the founder is viewing the app as someone else, every request that
// could CHANGE something is rejected. Impersonation exists to answer "what
// does this person see?", not to act on their behalf — an action taken while
// impersonating would be attributed to them in the activity log, which is
// exactly the confusion this feature must not create.
//
// Enforced here rather than in each route so a new endpoint cannot forget it.
// The exception is the view-as endpoint itself: you must be able to stop.
const VIEW_AS_COOKIE = "doz-view-as";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function middleware(req: NextRequest) {
  const impersonating = Boolean(req.cookies.get(VIEW_AS_COOKIE)?.value);
  if (!impersonating) return NextResponse.next();
  if (SAFE_METHODS.has(req.method)) return NextResponse.next();

  // Always allow stopping, and never block auth (signing out must work).
  const path = req.nextUrl.pathname;
  if (path.startsWith("/api/doz/view-as") || path.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  return NextResponse.json(
    {
      error:
        "You're viewing as another user, so this is read-only. Stop viewing as them to make changes.",
    },
    { status: 403 },
  );
}

export const config = {
  matcher: ["/api/:path*"],
};
