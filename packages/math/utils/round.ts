/**
 * Symmetric round
 * see https://www.npmjs.com/package/round-half-up-symmetric#user-content-detailed-background
 *
 * @param a value to round
 */
export function round(a: number): number {
  if (a >= 0) {
    return Math.round(a);
  }

  return a % 0.5 === 0 ? Math.floor(a) : Math.round(a);
}
