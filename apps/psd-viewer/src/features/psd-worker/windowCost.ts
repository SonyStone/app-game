import type { PsdRegionCapability } from '@app-game/psd/viewer';

/**
 * Compares tiled source/support work with one whole composite. Repeated support is charged once per tile;
 * output pixels are charged once either way. Timings, when available, replace the cold work estimate.
 * The caller must separately enforce the whole-canvas memory/size limit.
 */
export function preferWholeRender(
  size: { width: number; height: number },
  region: PsdRegionCapability,
  whole: PsdRegionCapability,
  measured?: { wholeMilliseconds: number; windowMilliseconds: number }
): boolean {
  if (region.strategy !== 'window') {
    return true;
  }

  const tiles = Math.ceil(size.width / 512) * Math.ceil(size.height / 512);
  if (measured) {
    return measured.windowMilliseconds * tiles >= measured.wholeMilliseconds;
  }

  const output = size.width * size.height;
  const tiledWork = Number(region.sourceWorkPixels) * tiles + output;
  const wholeWork = Number(whole.sourceWorkPixels) + output;
  return tiledWork >= wholeWork;
}
