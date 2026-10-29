import { writePsd, type PsdLayer } from '@app-game/psd';
import { gpuBlendModes, prepareGpuLayers } from '@app-game/psd/gpu';
import { openPsd, photoshopDefaultSettings } from '@app-game/psd/viewer';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { cpuCompositeReference } from './cpuCompositeReference';
import { withModernTop, withTopBlendKey } from './patchedPsd';

/** Photoshop's stored blend keys, in the GPU capability's stable mode order. */
const blendKeys = [
  'norm',
  'dark',
  'lite',
  'mul ',
  'scrn',
  'idiv',
  'lbrn',
  'div ',
  'lddg',
  'over',
  'sLit',
  'hLit',
  'vLit',
  'lLit',
  'pLit',
  'hMix',
  'diff',
  'smud',
  'fsub',
  'fdiv'
];

it('matches CPU integer equations for all byte pairs and all admitted blend modes', async () => {
  const width = 256;
  const height = 256;
  for (const variant of [0, 1, 2, 4, 5, 6, 7, 8]) {
    const bottom = new Uint8Array(width * height * 4);
    const top = new Uint8Array(bottom.length);
    for (let b = 0; b < 256; b++) {
      for (let s = 0; s < 256; s++) {
        const at = (b * width + s) * 4;
        bottom.set([b, 255 - b, s, variant === 0 ? 255 : (b * 17 + s * 31) % 256], at);
        top.set([s, b, 255 - s, variant === 0 ? 255 : (s * 13 + b * 7) % 256], at);
      }
    }
    const layer = (name: string, pixels: Uint8Array, opacity: number, fill: number): PsdLayer => ({
      name,
      pixels,
      left: 0,
      top: 0,
      width,
      height,
      opacity,
      fill,
      visible: true,
      blend: 'normal',
      clipping: false,
      transparencyLocked: false
    });
    const bytes = await writePsd(
      {
        width,
        height,
        layers: [
          layer('bottom', bottom, 1, 1),
          layer(
            'top',
            top,
            [255, 77, 255, 255, 0, 1, 127, 254, 255][variant] / 255,
            [255, 255, 128, 255, 255, 1, 77, 200, 254][variant] / 255
          )
        ]
      },
      bottom
    );
    for (const [mode, key] of blendKeys.entries()) {
      const opened = await openPsd(withTopBlendKey(withModernTop(bytes), key));
      expect(opened.ok).toBe(true);
      if (!opened.ok) {
        continue;
      }
      for (const gamma of [false, true]) {
        const settings = { ...photoshopDefaultSettings, linearBlending: gamma };
        const rect = { left: 0, top: 0, width, height };
        const source = prepareGpuLayers(opened.value, rect, settings);
        const strict = opened.value.renderRegion(rect, settings);
        expect(source.ok, gpuBlendModes[mode]).toBe(true);
        expect(strict.ok, gpuBlendModes[mode]).toBe(true);
        if (source.ok && strict.ok) {
          expect(source.value.layers.at(-1)!.mode).toBe(mode);
          const actual = cpuCompositeReference(source.value, gamma);
          const first = actual.findIndex((v, i) => v !== strict.value.pixels[i]);
          expect(
            first,
            `${gpuBlendModes[mode]} gamma=${gamma} variant=${variant}: ${actual[first]} != ${strict.value.pixels[first]}`
          ).toBe(-1);
        }
      }
      opened.value.close();
    }
  }
}, 120_000);

it('reads bounded source planes and rejects unsupported mask, text, color and group semantics', async () => {
  for (const name of ['flat-rgb8', 'masks', 'groups', 'rgb16', 'carried-type']) {
    const opened = await openPsd(
      await readFile(new URL(`../../../packages/psd/test/editor/${name}.psd`, import.meta.url))
    );
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      continue;
    }
    const rect = {
      left: 0,
      top: 0,
      width: Math.min(9, opened.value.info.width),
      height: Math.min(7, opened.value.info.height)
    };
    const result = prepareGpuLayers(opened.value, rect, photoshopDefaultSettings);
    if (result.ok) {
      for (const layer of result.value.layers) {
        expect(layer.samples.byteLength).toBeLessThanOrEqual(rect.width * rect.height * 8);
      }
      const strict = opened.value.renderRegion(rect, photoshopDefaultSettings);
      expect(strict.ok).toBe(true);
      if (strict.ok) {
        expect(cpuCompositeReference(result.value, false)).toEqual(strict.value.pixels);
      }
    } else {
      expect(result.error.kind).toBe('unsupported');
    }
    opened.value.close();
  }
});
