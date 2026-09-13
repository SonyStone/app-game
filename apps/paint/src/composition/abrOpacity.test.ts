import { expect, it, vi } from 'vitest';
import { defaultBrush } from '../brush';
import { viewerBrush } from '../brushLibrary/viewerBrush';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { abrBrush } from './abrBrushEngine';
import { createBrushResources } from './brushResources';
import type { PaintRenderer } from './contracts';

it.each(['PbTl', 'PcTl', 'SmTl'])(
  '%s passes global opacity to the renderer only when its stamps exclude it',
  (type) => {
    const preset = viewerBrush({
      id: 'opacity', name: 'Opacity', type: 'computed', diameter: 16, spacing: 10,
      settings: { toolOptions: { __classId: type } }
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
