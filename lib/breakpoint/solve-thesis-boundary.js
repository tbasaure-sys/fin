// Bracketed reverse valuation. A missing root stays missing.
export function solveThesisBoundary({ evaluate, target, min, max, iterations = 80, tolerance = 1e-7 }) {
  if (typeof evaluate !== 'function' || ![target, min, max].every(v => typeof v === 'number' && Number.isFinite(v)) || min >= max) return null;
  let low = min;
  let high = max;
  let a = evaluate(low) - target;
  const b = evaluate(high) - target;
  if (![a, b].every(Number.isFinite) || a * b > 0) return null;
  if (Math.abs(a) < tolerance) return low;
  if (Math.abs(b) < tolerance) return high;
  for (let i = 0; i < iterations; i++) {
    const mid = (low + high) / 2;
    const delta = evaluate(mid) - target;
    if (!Number.isFinite(delta)) return null;
    if (Math.abs(delta) < tolerance) return mid;
    if (delta * a > 0) { low = mid; a = delta; } else high = mid;
  }
  const result = (low + high) / 2;
  return Math.abs(evaluate(result) - target) < tolerance * 10 ? result : null;
}
