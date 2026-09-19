import { brushToFormValues } from '@app-game/abr-brush/form';
import { loadBrushLibrary } from '@app-game/abr-brush/library';
import { adaptiveBrushQuality } from '@app-game/abr-paint/adaptiveQuality';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { createBrushResources } from '@app-game/abr-paint/resources';
import { initAbr } from '@app-game/abr-parser';
import { defaultBrush, type Dab } from '@app-game/paint-core/brush';
import { abrBrush } from '@app-game/paint-core/composition/abrBrushEngine';
import type { PaintRenderer } from '@app-game/paint-core/composition/contracts';
import { createResourceSession } from '@app-game/paint-core/composition/resourceSession';
import { createDocument } from '@app-game/paint-core/document';
import { createRawProcessor } from '@app-game/paint-core/strokeProcessors';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';

await initAbr(
  readFileSync(new URL('../../../../packages/abr-parser/wasm/pkg/photoshop_abr_wasm_bg.wasm', import.meta.url))
);

it('gives every bundled preset the same LOD sampling budget, including special tool paths', () => {
  expect(megapack.brushes).toHaveLength(465);
  for (const brush of megapack.brushes) {
    const values = brushToFormValues(brush);
    for (const mixing of ['classic', 'linear'] as const) {
      for (const [lod, spacing] of [
        [0, 1],
        [1, 2],
        [3, 8],
        [6, 64]
      ] as const)
        expect(adaptiveBrushQuality(true, values, lod, values.tool.mode, mixing)?.minimumSpacing, brush.name).toBe(
          spacing
        );
      expect(adaptiveBrushQuality(false, values, 3)).toBeUndefined();
    }
  }
});

it.each([
  ['KYLE Ultimate 2B Pencil', 222, 0, 450],
  ['KYLE Ultimate 2B Pencil', 222, 1, 450],
  ['KYLE Ultimate 2B Pencil', 222, 3, 450],
  ['KYLE Ultimate 2B Pencil', 9, 0, 10500],
  ['KYLE Ultimate 2B Pencil', 9, 3, 5500],
  ["Kyle's Paintbox - Wet Blender", 222, 0, 4500],
  ["Kyle's Paintbox - Wet Blender", 222, 3, 2700]
] as const)('bounds real %s (%ipx) long-stroke work at LOD %i', async (name, size, lod, limit) => {
  const source = megapack.brushes.find((brush) => brush.name === name)!;
  const preset = prepareAbrBrush(source);
  const cache = createBrushResources();
  preset.resources.forEach((resource) => cache.put(resource));
  for (const mixing of ['classic', 'linear'] as const) {
    const dabs: Dab[] = [];
    const begin = vi.fn();
    const renderer = {
      begin,
      paint: async (batch: readonly Dab[]) => {
        dabs.push(...batch);
      },
      preview: vi.fn(),
      cancel: vi.fn(),
      finish: async () => []
    } as unknown as PaintRenderer;
    const stroke = createResourceSession(cache, (resources) =>
      abrBrush.engine({
        settings: { ...preset.engine.settings, seed: 12345 },
        resources,
        renderer,
        brush: { ...defaultBrush(), size, mixing },
        layer: createDocument().active,
        processor: createRawProcessor(),
        adaptiveQuality: true,
        lod
      })
    );
    try {
      await stroke.add([
        { x: 0, y: 0, pressure: 1, time: 0 },
        { x: 6000, y: 0, pressure: 1, time: 1000 }
      ]);
      await stroke.finish();
      expect(dabs.length).toBeGreaterThan(100);
      expect(dabs.length).toBeLessThan(limit);
      // A dropped/truncated gesture must never count as a successful optimization.
      expect(Math.max(...dabs.map((dab) => dab.x))).toBeGreaterThan(5900);
      const options = begin.mock.calls[0]![3];
      if (name === 'KYLE Ultimate 2B Pencil') expect(options.tipLodBias).toBe(lod);
      else expect(options.smudge.pickupScale).toBe(lod > 0 && mixing === 'linear' ? 0.125 : undefined);
    } finally {
      stroke.cancel();
    }
    expect(cache.stats().pinnedBytes).toBe(0);
  }
});

const megapack = loadBrushLibrary(
  readFileSync(new URL('../../../abr-viewer/src/assets/examples/megapack.abr', import.meta.url))
);
