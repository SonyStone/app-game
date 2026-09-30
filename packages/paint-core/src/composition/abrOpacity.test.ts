import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { createBrushResources } from '@app-game/abr-paint/resources';
import { percent, pixels } from '@app-game/abr-parser';
import { defaultBrush } from '../brush';
import { abrBrush } from './abrBrushEngine';
import type { PaintRenderer } from './contracts';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { expect, it, vi } from 'vitest';

it.each(['PbTl', 'PcTl', 'SmTl'])(
  '%s passes global opacity to the renderer only when its stamps exclude it',
  (type) => {
    const preset = prepareAbrBrush({
      id: 'opacity',
      name: 'Opacity',
      preset: {
        kind: 'brush',
        sourceId: 'fixture',
        ...{ toolOptions: { kind: type } },
        tip: { kind: 'computed', diameter: pixels(16), spacing: percent(10) }
      },
      resources: [],
      source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
    });
    const cache = createBrushResources();
    preset.resources.forEach((resource) => cache.put(resource));
    const resources = cache.open();
    const begin = vi.fn<PaintRenderer['begin']>();
    const renderer = { begin, cancel() {} } as unknown as PaintRenderer;
    try {
      const session = abrBrush.engine({
        settings: preset.engine.settings,
        brush: { ...defaultBrush(), opacity: 0.5, engine: preset.engine },
        resources,
        layer: createDocument().active,
        renderer,
        processor: createRawProcessor()
      });
      expect(begin.mock.lastCall?.[3]?.compositeOpacity).toBe(type === 'PbTl' ? 128 / 255 : 1);
      session.cancel();
    } finally {
      resources.release();
      cache.dispose();
    }
  }
);
