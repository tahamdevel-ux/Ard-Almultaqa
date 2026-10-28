import { NextResponse, type NextRequest } from "next/server";

/** Cheap gate: real validation (expiry, permissions) happens server-side in requirePage/requirePermission. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/fonts/") || pathname.startsWith("/brand/")) return NextResponse.next();
  if (!req.cookies.get("ard_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
