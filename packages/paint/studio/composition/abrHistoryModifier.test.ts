import { expect, it, vi } from 'vitest';
import { defaultBrush } from '../brush';
import { viewerBrush } from '../brushLibrary/viewerBrush';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { abrBrush } from './abrBrushEngine';
import { createBrushResources } from './brushResources';
import type { PaintRenderer } from './contracts';

it.each(['ErTl', 'PbTl', 'PcTl', 'SmTl', 'MixB', 'BlTl', 'ShTl'])(
  'temporary history mode affects only the Eraser, without editing %s settings',
  (type) => {
    const preset = viewerBrush({
      id: 'modifier',
      name: 'Modifier',
      type: 'computed',
      diameter: 16,
      spacing: 10,
      settings: { toolOptions: { __classId: type, MgcE: false } }
    });
    const saved = structuredClone(preset.engine.settings);
    const cache = createBrushResources();
    preset.resources.forEach((resource) => cache.put(resource));
    const resources = cache.open();
    const layer = createDocument().active;
    const historySource = { ...layer, tiles: new Map(layer.tiles) };
    const begin = vi.fn<PaintRenderer['begin']>();
    const renderer = { begin, cancel() {} } as unknown as PaintRenderer;
    const context = {
      settings: preset.engine.settings,
      brush: { ...defaultBrush(), engine: preset.engine },
      resources,
      layer,
      historySource,
      renderer,
      processor: createRawProcessor()
    };
    try {
      for (const altKey of [true, false]) {
        const session = abrBrush.engine({ ...context, modifiers: { altKey } });
        expect(begin.mock.lastCall?.[3]?.historySource).toBe(type === 'ErTl' && altKey ? historySource : undefined);
        session.cancel();
      }
      if (type === 'ErTl') {
        begin.mockClear();
        expect(() => abrBrush.engine({ ...context, historySource: undefined, modifiers: { altKey: true } })).toThrow(
          'does not contain this layer'
        );
        expect(begin).not.toHaveBeenCalled();
        preset.engine.settings.values.tool.eraseToHistory = true;
        const session = abrBrush.engine({ ...context, modifiers: { altKey: false } });
        expect(begin.mock.lastCall?.[3]?.historySource).toBe(historySource);
        session.cancel();
        preset.engine.settings.values.tool.eraseToHistory = false;
      }
      expect(preset.engine.settings).toEqual(saved);
    } finally {
      resources.release();
      cache.dispose();
    }
  }
);
