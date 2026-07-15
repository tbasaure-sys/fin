import { NextResponse } from "next/server";
import {
  LANGUAGE_COOKIE_KEY,
  LANGUAGE_REQUEST_HEADER,
  resolveRequestLocale,
  shouldPersistQueryLocale,
} from "@/lib/i18n/locale";

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

  const queryLanguage = request.nextUrl.searchParams.get("lang");
  const locale = resolveRequestLocale({
    pathname,
    queryLanguage,
    cookieLanguage: request.cookies.get(LANGUAGE_COOKIE_KEY)?.value,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LANGUAGE_REQUEST_HEADER, locale);

  const finalize = (response) => {
    if (shouldPersistQueryLocale({ pathname, queryLanguage })) {
      response.cookies.set(LANGUAGE_COOKIE_KEY, locale, {
        httpOnly: false,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return response;
  };

  const cookieName = (process.env.BLS_PRIME_SESSION_COOKIE_NAME || "bls_prime_session").trim() || "bls_prime_session";
  const bypassValue = String(process.env.BLS_PRIME_E2E_AUTH_BYPASS || "").trim().toLowerCase();
  const hasE2EBypass = process.env.NODE_ENV !== "production" && (
    bypassValue === "1" ||
    bypassValue === "true" ||
    bypassValue === "yes"
  );
  const hasSession = hasE2EBypass || Boolean(request.cookies.get(cookieName)?.value);

  if (pathname === "/valuation-os-lab") {
    const auroraUrl = request.nextUrl.clone();
    auroraUrl.pathname = "/aurora";
    return finalize(NextResponse.redirect(auroraUrl, 308));
  }

  if (pathname === "/access") {
    return finalize(NextResponse.redirect(new URL("/aurora", request.url)));
  }

  if ((pathname === "/app" || pathname.startsWith("/app/")) && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    const appNext = `${request.nextUrl.pathname}${request.nextUrl.search || ""}`;
    loginUrl.searchParams.set("next", appNext === "/app" ? "/app#holdings" : appNext);
    loginUrl.searchParams.set("lang", locale);
    return finalize(NextResponse.redirect(loginUrl));
  }

  if (pathname === "/legacy" && !hasSession) {
    return finalize(NextResponse.redirect(new URL("/aurora", request.url)));
  }

  return finalize(NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  }));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
