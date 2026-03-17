import { getWorkspaceState } from "@/lib/server/dashboard-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function buildContractHeaders(payload) {
  const probabilistic = payload?.probabilistic_state || {};
  const uncertainty = payload?.uncertainty || payload?.bls_state_v1?.uncertainty || {};
  const metrics = uncertainty?.probability_package_metrics || [];
  const metric = metrics.find((item) => item?.target === "portfolio_recoverability") || metrics[0] || {};
  return {
    "Cache-Control": "no-store",
    "X-BLS-Contract-Version": String(payload?.contract_version || payload?.bls_state_v1?.contract_version || ""),
    "X-BLS-Model-Version": String(payload?.model_version || payload?.bls_state_v1?.model_version || ""),
    "X-BLS-Contract-Status": String(payload?.status?.contract_status || payload?.bls_state_v1?.status?.contract_status || ""),
    "X-BLS-Probability-Source": String(probabilistic?.source || payload?.bls_state_v1?.probabilistic_state?.source || ""),
    "X-BLS-Model-Package": String(probabilistic?.model_package_version || payload?.bls_state_v1?.probabilistic_state?.model_package_version || ""),
    "X-BLS-Fold-Count": String(metric?.fold_count || ""),
    "X-BLS-Brier-OOF": String(metric?.brier_oof_calibrated || ""),
    "X-BLS-Sample-Count": String(metric?.sample_count || ""),
  };
}

export async function GET(_request, { params }) {
  const payload = await getWorkspaceState(params.workspaceId);
  return Response.json(payload, { headers: buildContractHeaders(payload) });
}
