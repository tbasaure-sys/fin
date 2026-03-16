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
  const token = process.env.BLS_PRIME_SHARED_ACCESS_TOKEN || "";
  if (!token || isStaticAsset(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const queryKey = process.env.BLS_PRIME_SHARED_ACCESS_QUERY_KEY || "alpha";
  const cookieName = process.env.BLS_PRIME_SHARED_ACCESS_COOKIE_NAME || "bls_prime_access";
  const queryToken = request.nextUrl.searchParams.get(queryKey);
  const cookieToken = request.cookies.get(cookieName)?.value;
  const authorized = queryToken === token || cookieToken === token;

  if (request.nextUrl.pathname === "/access") {
    if (authorized) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!authorized) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Private alpha access required. Open the shared invitation link first." },
        { status: 401 },
      );
    }

    const accessUrl = new URL("/access", request.url);
    accessUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.rewrite(accessUrl);
  }

  const response = NextResponse.next();
  if (queryToken === token && cookieToken !== token) {
    response.cookies.set(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
