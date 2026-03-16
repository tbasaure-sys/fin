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

function safeDecode(value) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function middleware(request) {
  const token = (process.env.BLS_PRIME_SHARED_ACCESS_TOKEN || "").trim();
  const refreshToken = (process.env.BLS_PRIME_REFRESH_TOKEN || "").trim();
  if (!token || isStaticAsset(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const queryKey = (process.env.BLS_PRIME_SHARED_ACCESS_QUERY_KEY || "alpha").trim() || "alpha";
  const cookieName = (process.env.BLS_PRIME_SHARED_ACCESS_COOKIE_NAME || "bls_prime_access").trim() || "bls_prime_access";
  const refreshQueryToken = request.nextUrl.searchParams.get("refresh");
  const refreshHeaderToken = request.headers.get("x-bls-refresh-token");
  const queryToken = request.nextUrl.searchParams.get(queryKey);
  const cookieToken = safeDecode(request.cookies.get(cookieName)?.value);
  const authorized = queryToken === token || cookieToken === token;
  const refreshAuthorized =
    request.nextUrl.pathname === "/api/refresh"
    && Boolean(refreshToken)
    && (refreshQueryToken === refreshToken || refreshHeaderToken === refreshToken);

  if (request.nextUrl.pathname === "/access") {
    if (authorized) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!authorized) {
    if (refreshAuthorized) {
      return NextResponse.next();
    }
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({ error: "Private alpha access required. Open the shared invitation link first." }),
        {
          status: 401,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        },
      );
    }

    const accessUrl = request.nextUrl.clone();
    accessUrl.pathname = "/access";
    accessUrl.search = "";
    accessUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(accessUrl);
  }

  const response = NextResponse.next();
  if (queryToken === token && cookieToken !== token) {
    response.cookies.set(cookieName, encodeURIComponent(token), {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
