/** Accumulates an affine secondary-tip sample into an 8-bit mask.
 * Both inputs must be bytes. Photoshop's affine callbacks use rounded source-over;
 * its perspective callback instead replaces samples and must not call this helper.
 */
export function accumulateAffineSecondary(source: number, destination: number): number {
  const product = source * (255 - destination) + 128;
  return destination + ((product + (product >> 8)) >> 8);
}

/** Sampling policy for Photoshop's affine secondary callbacks, on CPU or GPU spans.
 * They always filter, even at native size, and test both mip bounds independently.
 * Primary horizontal-row rejection would discard valid coarse-level edge coverage.
 */
export const affineSecondarySampling = {
  allowCopy: false, fractionBias: 1, rowSpecialization: false
} as const;

/** Affine secondary GPU masks use byte render targets with premultiplied coverage.
 * This fixed-function blend implements the rounded byte operation above after
 * the fragment quantizes its source. Perspective sampling requires a separate path.
 */
export const affineSecondaryBlend = {
  color: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
  alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
} as const;
