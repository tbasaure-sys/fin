import MosaicWorkspace from "@/components/mosaic-workspace";
import { requireServerAuthSession } from "@/lib/server/auth/session";
import { loadMacroBrainSnapshot } from "@/lib/server/macro-brain";
import { contextualizeMosaicSnapshot, loadMosaicSnapshot } from "@/lib/server/mosaic-observatory";
import { sanitizePublicSnapshotPayload } from "@/lib/server/public-snapshot-sanitizer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "MOSAIC | Global Macro Workspace",
  description: "Auditable global pressure, liquidity, market drivers, source health, and evidence gaps.",
  robots: { index: false, follow: false },
};

export default async function MosaicPage() {
  const auth = await requireServerAuthSession("/mosaic");
  const [baseSnapshot, macro] = await Promise.all([
    loadMosaicSnapshot(),
    loadMacroBrainSnapshot(),
  ]);
  const snapshot = contextualizeMosaicSnapshot(baseSnapshot, macro);

  return (
    <MosaicWorkspace
      initialMacro={sanitizePublicSnapshotPayload(macro)}
      initialSnapshot={sanitizePublicSnapshotPayload(snapshot)}
      workspaceName={auth.workspace?.name || "BLS Prime"}
    />
  );
}
