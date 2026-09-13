/** A view into immutable eight-pixel perspective blocks for one scan row.
 * offset is measured in pixels from the first block and survives tile cropping.
 * Each block stores six signed words: 16.16 x/y and advances, then 8.8 mip level
 * and its per-pixel advance. No source pixels or GPU resources are retained.
 */
export type TipProjectionBlocks = { data: Int32Array; offset: number };

/** Word offsets for the packed CPU/GPU record; each field is one storage i32. */
export const projectionBlockWords = { x: 0, y: 1, dx: 2, dy: 3, level: 4, levelStep: 5, stride: 6 } as const;
