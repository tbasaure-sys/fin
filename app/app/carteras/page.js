import PrivateCarterasDashboard from "@/components/private-carteras-dashboard";
import { requireServerAuthSession } from "@/lib/server/auth/session";
import { getCarterasDashboard } from "@/lib/server/carteras-api";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Carteras | BLS Prime",
  robots: { index: false, follow: false },
};

export default async function PrivateCarterasPage() {
  const authSession = await requireServerAuthSession("/app/carteras");
  const initialData = await getCarterasDashboard("USD");
  return <PrivateCarterasDashboard initialData={initialData} user={authSession.user} />;
}
