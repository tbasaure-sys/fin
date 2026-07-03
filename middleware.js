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
  const bypassValue = String(process.env.BLS_PRIME_E2E_AUTH_BYPASS || "").trim().toLowerCase();
  const hasE2EBypass = process.env.NODE_ENV !== "production" && (
    bypassValue === "1" ||
    bypassValue === "true" ||
    bypassValue === "yes"
  );
  const hasSession = hasE2EBypass || Boolean(request.cookies.get(cookieName)?.value);

  if (pathname === "/access") {
    return NextResponse.redirect(new URL("/valuation-os-lab", request.url));
  }

  if ((pathname === "/app" || pathname.startsWith("/app/")) && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    const appNext = `${request.nextUrl.pathname}${request.nextUrl.search || ""}`;
    loginUrl.searchParams.set("next", appNext === "/app" ? "/app#risk" : appNext);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/legacy" && !hasSession) {
    return NextResponse.redirect(new URL("/valuation-os-lab", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
