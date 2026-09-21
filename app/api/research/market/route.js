import { requireApiAuthSession } from "@/lib/server/auth/session";
import { readOwnedPortfolio } from "@/lib/server/thesis-financials";
import { researchMarketService } from "@/lib/server/research-market-service";
import { createResearchMarketHttp } from "@/lib/server/research-market-http";
import { consumePublicRateLimit } from "@/lib/server/data/public-rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const local =
  process.env.NODE_ENV !== "production" &&
  process.env.BLS_PRIME_STORAGE_BACKEND === "memory";
export const GET = createResearchMarketHttp({
  authenticate: requireApiAuthSession,
  service: researchMarketService,
  consume: consumePublicRateLimit,
  readPortfolio: local
    ? async () => ({ status: "available", holdings: [] })
    : readOwnedPortfolio,
});
