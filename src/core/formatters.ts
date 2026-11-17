/**
 * Returns the numeric percentage value rounded to specified decimal places (e.g. 39.5).
 * Useful for sorting, progress bars, and numeric comparisons.
 */
export function getProbValue(prob: number | null | undefined, decimals: number = 1): number {
  if (prob === null || prob === undefined || isNaN(prob)) {
    return 0;
  }
  const normalized = prob > 1.0 ? prob : prob * 100;
  const factor = Math.pow(10, decimals);
  return Math.round(normalized * factor) / factor;
}
