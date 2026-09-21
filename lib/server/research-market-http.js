import "server-only";
const headers = { "Cache-Control": "private, no-store" };
export function createResearchMarketHttp({
  authenticate,
  service,
  readPortfolio,
  consume = async () => ({ allowed: true }),
}) {
  return async function GET(request) {
    const session = await authenticate(request);
    if (session instanceof Response) {
      session.headers.set("Cache-Control", "private, no-store");
      return session;
    }
    const p = new URL(request.url).searchParams,
      kind = p.get("kind") || "news";
    try {
      const portfolioScan = kind === "news" && p.get("scope") === "portfolio";
      const quota = await consume({
        request,
        scope: portfolioScan
          ? "research-portfolio-news"
          : "research-market-data",
        limit: portfolioScan ? 6 : 60,
        windowMs: 300000,
      });
      if (!quota.allowed)
        return Response.json(
          { error: "BUSY" },
          {
            status: 429,
            headers: {
              ...headers,
              "Retry-After": String(quota.retryAfterSeconds || 60),
            },
          },
        );
      let result;
      if (kind === "news") {
        const scope = p.get("scope") || "stock";
        if (!["stock", "portfolio", "market"].includes(scope))
          throw Error("INVALID_SCOPE");
        if (scope === "portfolio") {
          if (!session.user?.id || !session.workspace?.id)
            return Response.json(
              { error: "AUTH_REQUIRED" },
              { status: 401, headers },
            );
          const owned = await readPortfolio(
            session.user.id,
            session.workspace.id,
          );
          if (owned.status !== "available" || !Array.isArray(owned.holdings))
            throw Error("PORTFOLIO_UNAVAILABLE");
          result = await service.portfolio(owned.holdings);
        } else
          result = await service.news(
            scope === "market" ? null : p.get("ticker") || "!",
          );
      } else
        result = await service.fundamentals(p.get("ticker"), kind, {
          year: p.get("year"),
          quarter: p.get("quarter"),
        });
      return Response.json(result, { headers });
    } catch (error) {
      const code = [
        "INVALID_TICKER",
        "INVALID_SECTION",
        "INVALID_SCOPE",
        "INVALID_PERIOD",
        "BUSY",
        "PORTFOLIO_UNAVAILABLE",
      ].includes(error.message)
        ? error.message
        : "SOURCE_UNAVAILABLE";
      return Response.json(
        { error: code },
        {
          status: code.startsWith("INVALID")
            ? 400
            : code === "BUSY"
              ? 429
              : 503,
          headers,
        },
      );
    }
  };
}
