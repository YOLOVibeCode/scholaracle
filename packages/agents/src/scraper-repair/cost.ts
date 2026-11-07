/** Deterministic test-friendly cost estimate from token counts (USD). */
export function estimateRelayCostUsd(inputTokens: number, outputTokens: number): number {
  const usd = inputTokens * 0.000001 + outputTokens * 0.000003;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
