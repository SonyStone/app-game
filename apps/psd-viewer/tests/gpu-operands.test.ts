import { prepareGpuLayers } from '@app-game/psd/gpu';
import { openPsd, photoshopDefaultSettings } from '@app-game/psd/viewer';
import { expect, it } from 'vitest';
import { cpuCompositeReference } from './cpuCompositeReference';
import { operandControls } from './operandControls';

it('matches strict clipping and adjustment returns at alpha, Fill, opacity and threshold edges', async () => {
  for (const control of await operandControls()) {
    const opened = await openPsd(control.bytes);
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    const doc = opened.value;
    try {
      const rect = { left: 0, top: 0, width: doc.info.width, height: doc.info.height };
      for (const linearBlending of [false, true]) {
        const settings = { ...photoshopDefaultSettings, linearBlending };
        const prepared = prepareGpuLayers(doc, rect, settings);
        expect(prepared.ok, control.name).toBe(true);
        if (!prepared.ok) {
          continue;
        }
        for (const visibility of [[], ...doc.layers.map((node) => [[node.index, false] as const])]) {
          const strict = doc.renderRegion(rect, settings, visibility);
          expect(strict.ok, control.name).toBe(true);
          if (strict.ok) {
            expect(
              cpuCompositeReference(prepared.value, linearBlending, visibility),
              `${control.name} gamma=${linearBlending}`
            ).toEqual(strict.value.pixels);
          }
        }
      }
    } finally {
      doc.close();
    }
  }
});
