import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { gpuCompositeAdmission, prepareGpuLayers } from './gpu';
import { openPsd, photoshopDefaultSettings } from './viewer';

it('prepares native source channels only inside the requested region', async () => {
  const opened = await openPsd(await readFile(new URL('../test/editor/flat-rgb8.psd', import.meta.url)));
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }
  const document = opened.value;
  try {
    const rect = { left: 3, top: 2, width: 5, height: 4 };
    const prepared = prepareGpuLayers(document, rect, photoshopDefaultSettings);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.value.rect).toEqual(rect);
    for (const layer of prepared.value.layers) {
      const read = document.layerRegion(layer.index, layer.bounds, new Int16Array([0, 1, 2, -1]));
      expect(read.ok).toBe(true);
      if (read.ok) {
        const red = read.value.planes.find((plane) => plane.id === 0)!;
        expect(layer.samples[0]! & 255).toBe(red.bytes[0]);
      }
      expect(layer.samples.byteLength).toBeLessThanOrEqual(5 * 4 * 8);
    }
    const node = document.layers[0]!;
    const detail = document.layerDetail(node.index);
    let reads = 0;
    const refused = prepareGpuLayers(
      {
        ...document,
        info: { ...document.info, width: 1024, height: 1024 },
        layers: Array.from({ length: 3 }, (_, index) => ({
          ...node,
          index,
          bounds: { left: 0, top: 0, right: 1024, bottom: 1024 }
        })),
        layerDetail: () => detail,
        layerRegion: () => {
          reads++;
          throw new Error('Preparation must refuse before reading any plane.');
        }
      },
      { left: 0, top: 0, width: 1024, height: 1024 },
      photoshopDefaultSettings
    );
    expect(refused).toMatchObject({ ok: false, error: { kind: 'budget', requested: 40_894_464n, limit: 33_554_432n } });
    expect(reads).toBe(0);
    const details = new Map();
    for (const layer of document.layers) {
      const detail = document.layerDetail(layer.index);
      if (detail.ok) {
        details.set(layer.index, detail.value);
      }
    }
    expect(
      gpuCompositeAdmission(document.info, document.layers, details, {
        ...photoshopDefaultSettings,
        state: { frame: 1 }
      })
    ).not.toEqual([]);
    expect(
      gpuCompositeAdmission({ ...document.info, mode: 4 }, document.layers, details, photoshopDefaultSettings)
    ).not.toEqual([]);
    expect(gpuCompositeAdmission(document.info, [], details, photoshopDefaultSettings)).not.toEqual([]);
    expect(
      gpuCompositeAdmission(
        document.info,
        document.layers.map((node) => ({ ...node, keys: [...node.keys, 'lrFX'] })),
        details,
        photoshopDefaultSettings
      )
    ).not.toEqual([]);
    expect(
      gpuCompositeAdmission(
        { ...document.info, resources: [{ id: 1039, name: '', label: '', signature: '8BIM', size: 1 }] },
        document.layers,
        details,
        { ...photoshopDefaultSettings, linearBlending: true }
      )
    ).not.toEqual([]);
  } finally {
    document.close();
  }
});
