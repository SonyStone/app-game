import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { largePsb } from '../test/largePsb';
import { openPsd, openPsdLikePhotoshop, photoshopDefaultSettings, type PsdResult } from './viewer';

it.each([
  'adjustment-stack.psd',
  'pass-through-groups.psd',
  'type-with-layer-styles.psd',
  'rotated-smart-object.psd',
  'cmyk-levels.psd',
  'layer-comps.psd'
])('assembles regions and overview samples identical to the whole render: %s', async (name) => {
  const bytes = await readFile(
    new URL(`../../../apps/psd-viewer/src/features/examples/assets/${name}`, import.meta.url)
  );
  const document = value(await openPsd(bytes));
  try {
    const settings = { ...photoshopDefaultSettings, approximate: true };
    const whole = value(document.render(settings));
    const assembled = new Uint8Array(whole.pixels.length);
    const rectangles = [];
    for (let top = 0; top < whole.height; top += 31) {
      for (let left = 0; left < whole.width; left += 31) {
        rectangles.push({
          left,
          top,
          width: Math.min(31, whole.width - left),
          height: Math.min(31, whole.height - top)
        });
      }
    }

    for (let i = 0; i < rectangles.length; i += 256) {
      for (const tile of value(document.renderRegions(rectangles.slice(i, i + 256), settings))) {
        expect(tile).toMatchObject({
          step: 1,
          source: 'layers',
          exactToLayerRender: true,
          approximations: whole.approximations
        });
        for (let y = 0; y < tile.height; y++) {
          assembled.set(
            tile.pixels.subarray(y * tile.width * 4, (y + 1) * tile.width * 4),
            ((tile.top + y) * whole.width + tile.left) * 4
          );
        }
      }
    }

    expect(assembled).toEqual(whole.pixels);
    const overview = value(document.renderOverview(7, settings));
    for (let y = 0; y < overview.height; y++) {
      for (let x = 0; x < overview.width; x++) {
        const offset = (y * 7 * whole.width + x * 7) * 4;
        expect(overview.pixels.subarray((y * overview.width + x) * 4, (y * overview.width + x + 1) * 4)).toEqual(
          whole.pixels.subarray(offset, offset + 4)
        );
      }
    }

    const saved = value(document.savedOverview(7));
    expect(saved).toMatchObject({ source: 'savedComposite', exactToLayerRender: false, step: 7 });
    whole.dispose();
  } finally {
    document.close();
  }
});

it('renders a generated highly compressed PSB beyond wasm32 canvas indices without allocating its canvas', async () => {
  const bytes = largePsb();
  expect(bytes.length).toBeLessThan(1024);
  const document = value(await openPsd(bytes));
  expect(document.info).toMatchObject({ width: 300000, height: 300000, psb: true });
  const tile = value(
    document.renderRegion({ left: 299000, top: 299000, width: 144, height: 144 }, photoshopDefaultSettings)
  );
  expect(tile).toMatchObject({ strategy: 'window', step: 1, source: 'layers', exactToLayerRender: true });
  expect([...tile.pixels.subarray((8 * 144 + 8) * 4, (8 * 144 + 8) * 4 + 4)]).toEqual([255, 0, 0, 255]);
  expect([...tile.pixels.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
  const overview = value(document.renderOverview(512, photoshopDefaultSettings));
  expect(overview).toMatchObject({ width: 586, height: 586, step: 512 });
  expect([...overview.pixels.subarray((584 * 586 + 584) * 4, (584 * 586 + 584) * 4 + 4)]).toEqual([255, 0, 0, 255]);
  document.close();
  expect(document.renderOverview(512, photoshopDefaultSettings)).toMatchObject({
    ok: false,
    error: { kind: 'invalid' }
  });
});

it('preserves typed budget refusals for strict and recovery opening before copying host input', async () => {
  const bytes = largePsb();
  for (const result of [
    await openPsd(bytes, { allocationBytes: 1 }),
    await openPsdLikePhotoshop(bytes, {}, { allocationBytes: 1 })
  ]) {
    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'budget',
        resource: 'allocation bytes',
        requested: BigInt(bytes.byteLength),
        limit: 1n,
        message: expect.stringContaining("exceeds the viewer's resource budget")
      }
    });
  }

  value(await openPsd(bytes)).close();
});

it('reports window admission failures and allows a subsequent render', async () => {
  const document = value(await openPsd(largePsb()));
  try {
    const rectangle = { left: 299000, top: 299000, width: 144, height: 144 };
    const settings = { ...photoshopDefaultSettings, budget: { liveBytes: 1 } };
    for (const result of [
      document.renderRegion(rectangle, settings),
      document.renderRegions([rectangle], settings),
      document.renderOverview(512, settings),
      document.savedOverview(512, 0, { liveBytes: 1 })
    ]) {
      expect(result).toMatchObject({ ok: false, error: { kind: 'budget', resource: 'live bytes', limit: 1n } });
    }

    expect(value(document.renderRegion(rectangle, photoshopDefaultSettings)).pixels).toHaveLength(144 * 144 * 4);
  } finally {
    document.close();
  }
});

it('bounds batch work and restores visibility after a failed batch', async () => {
  const document = value(
    await openPsd(
      await readFile(
        new URL('../../../apps/psd-viewer/src/features/examples/assets/adjustment-stack.psd', import.meta.url)
      )
    )
  );
  const rect = { left: 0, top: 0, width: 16, height: 16 };
  const original = value(document.renderRegion(rect, photoshopDefaultSettings));
  expect(
    document.renderRegions([rect, rect], { ...photoshopDefaultSettings, maxWorkPixels: 256 }, [[0, false]])
  ).toMatchObject({ ok: false, error: { kind: 'invalid' } });
  expect(value(document.renderRegion(rect, photoshopDefaultSettings)).pixels).toEqual(original.pixels);
  document.close();
});

function value<T>(result: PsdResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value;
}
