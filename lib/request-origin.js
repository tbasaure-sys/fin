export function getRequestOrigin(request) {
  const originHeader = request?.headers?.get?.("origin");
  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {}
  }

  const forwardedProto = request?.headers?.get?.("x-forwarded-proto");
  const forwardedHost = request?.headers?.get?.("x-forwarded-host");
  if (forwardedHost) {
    const protocol = forwardedProto || "https";
    return `${protocol}://${forwardedHost}`;
  }

  const host = request?.headers?.get?.("host");
  if (host) {
    const protocol = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${protocol}://${host}`;
  }

  const requestUrl = request?.url;
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {}
  }

  return "";
}

export function resolveAppUrl(request, fallbackAppUrl) {
  return getRequestOrigin(request) || fallbackAppUrl;
}
