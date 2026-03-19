import { NextResponse } from "next/server";

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/images") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js")
  );
}

export function middleware(request) {
  const pathname = request.nextUrl.pathname;
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const cookieName = (process.env.BLS_PRIME_SESSION_COOKIE_NAME || "bls_prime_session").trim() || "bls_prime_session";
  const hasSession = Boolean(request.cookies.get(cookieName)?.value);

  if (pathname === "/access") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if ((pathname === "/app" || pathname.startsWith("/app/") || pathname === "/legacy") && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
