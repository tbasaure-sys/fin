import { VERDICT } from "@/lib/aurora-copy-map";

export function AuroraVerdictCard({ tier, reason, nextStep, className = "" }) {
  const verdict = VERDICT[tier] || VERDICT.ABSTAIN;

  return (
    <section className={className} data-tone={verdict.tone} aria-label="Veredicto AURORA">
      <span>{verdict.label}</span>
      <h2>{verdict.headline}</h2>
      <p>{verdict.sub}</p>
      {reason ? <p><strong>Motivo:</strong> {reason}</p> : null}
      {nextStep ? <p><strong>Proximo paso:</strong> {nextStep}</p> : null}
    </section>
  );
}
