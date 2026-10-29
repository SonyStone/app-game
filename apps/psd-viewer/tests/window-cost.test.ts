import type { PsdRegionCapability } from '@app-game/psd/viewer';
import { expect, it } from 'vitest';
import { preferWholeRender } from '../src/features/psd-worker/windowCost';

const plan = (sourceWorkPixels: bigint): PsdRegionCapability => ({
  strategy: 'window',
  allocationBytes: 0n,
  liveBytes: 0n,
  sourceWorkPixels,
  causes: [],
  refusal: null
});

it('charges full-support dependencies per tile, but keeps cheap local windows', () => {
  expect(preferWholeRender({ width: 1600, height: 1200 }, plan(143766n), plan(143766n))).toBe(true);
  expect(preferWholeRender({ width: 1600, height: 1200 }, plan(100n), plan(100000n))).toBe(false);
});

it('uses measured whole-render cost when an admitted window is slower', () => {
  const size = { width: 1600, height: 1200 };
  expect(preferWholeRender(size, plan(100n), plan(100000n), { wholeMilliseconds: 100, windowMilliseconds: 20 })).toBe(
    true
  );
  expect(preferWholeRender(size, plan(100n), plan(100n), { wholeMilliseconds: 100, windowMilliseconds: 1 })).toBe(
    false
  );
});
