import { PublicHomeExperience } from "@/components/public-home-experience";
import { getServerAuthSession } from "@/lib/server/auth/session";
import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const config = getServerConfig();
  const session = await getServerAuthSession();
  const publicBrand = /allocator workspace/i.test(config.appName) ? "BLS Prime" : config.appName;

  return <PublicHomeExperience brand={publicBrand} isAuthenticated={Boolean(session)} />;
}
