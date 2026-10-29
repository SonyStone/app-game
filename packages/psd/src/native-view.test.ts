import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { openPsd, openPsdSource, photoshopDefaultSettings } from './viewer';

it('keeps native regions, typed preflight and bounded source reads consistent with the saved planes', async () => {
  const bytes = await readFile(
    new URL('../../../apps/psd-viewer/src/features/examples/assets/layer-comps.psd', import.meta.url)
  );
  const opened = await openPsd(bytes);
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }

  const doc = opened.value;
  const rect = { left: 2, top: 3, width: 4, height: 5 };
  const plan = doc.regionCapability(rect, photoshopDefaultSettings);
  expect(plan).toMatchObject({ ok: true, value: { refusal: null } });
  const native = doc.renderNativeRegion(rect, photoshopDefaultSettings);
  expect(native).toMatchObject({ ok: true, value: { encoding: 'rgba8', ...rect } });
  const saved = doc.savedRegion(rect, Uint16Array.of(0));
  const reads: number[] = [];
  const source = await openPsdSource((offset, length) => {
    reads.push(length);
    return bytes.subarray(Number(offset), Number(offset) + length);
  }, BigInt(bytes.length));
  if (!source.ok) {
    throw new Error(source.error.message);
  }

  expect(source.value.info.resources.offset).toEqual(expect.any(BigInt));
  expect(source.value.savedRegion(rect, Uint16Array.of(0))).toEqual(saved);
  const grid = source.value.savedOverview(3, Uint16Array.of(0));
  expect(grid).toMatchObject({ ok: true });
  if (grid.ok) {
    const probe = doc.savedRegion({ left: 3, top: 6, width: 1, height: 1 }, Uint16Array.of(0));
    expect(probe.ok).toBe(true);
    if (probe.ok) {
      expect(grid.value.planes[0]!.bytes[2 * Math.ceil(doc.info.width / 3) + 1]).toBe(probe.value.planes[0]!.bytes[0]);
    }
  }
  expect(Math.max(...reads)).toBeLessThan(bytes.length);
  const layers = source.value.layerInfo();
  expect(layers.ok).toBe(true);
  if (layers.ok && layers.value[0]) {
    const first = layers.value[0];
    expect(first.channels[0]?.offset).toEqual(expect.any(BigInt));
    const ids = Int16Array.from(first.channels.map((channel) => channel.id));
    expect(source.value.layerRegion(first.index, rect, ids)).toEqual(doc.layerRegion(first.index, rect, ids));
  }

  expect(doc.regionCapability(rect, { budget: { liveBytes: 1 } })).toMatchObject({
    ok: true,
    value: { refusal: { kind: 'budget', resource: 'live bytes' } }
  });
  expect(doc.savedPaths()).toMatchObject({ ok: true });
  source.value.close();
  source.value.close();
  expect(source.value.savedRegion(rect, Uint16Array.of(0)).ok).toBe(false);
  doc.close();
  expect(doc.renderNativeRegion(rect).ok).toBe(false);
});
