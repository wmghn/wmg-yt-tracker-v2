import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const { auth } = NextAuth(authConfig);

const ROLE_HOME: Record<string, string> = {
  DIRECTOR: "/director",
  MANAGER: "/manager",
  STAFF: "/staff",
};

export default auth(function middleware(
  req: NextRequest & { auth: { user?: { role?: string } } | null }
) {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Nếu đã đăng nhập mà vào /login → redirect về dashboard
  if (pathname.startsWith("/login") && session?.user) {
    const role = session.user.role ?? "";
    return NextResponse.redirect(new URL(ROLE_HOME[role] ?? "/", req.url));
  }

  // Protect authenticated-only routes
  const protectedPaths = ["/director", "/manager", "/staff", "/dashboard"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (!session?.user) {
    if (isProtected) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  const role = session.user.role ?? "";

  // Role-based access control
  if (pathname.startsWith("/director") && role !== "DIRECTOR") {
    return NextResponse.redirect(new URL(ROLE_HOME[role] ?? "/login", req.url));
  }

  if (
    pathname.startsWith("/manager") &&
    role !== "MANAGER" &&
    role !== "DIRECTOR"
  ) {
    return NextResponse.redirect(new URL(ROLE_HOME[role] ?? "/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
