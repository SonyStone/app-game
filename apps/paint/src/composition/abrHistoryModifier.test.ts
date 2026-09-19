import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { createBrushResources } from '@app-game/abr-paint/resources';
import { percent, pixels } from '@app-game/abr-parser';
import { defaultBrush } from '@app-game/paint-core/brush';
import { abrBrush } from '@app-game/paint-core/composition/abrBrushEngine';
import type { PaintRenderer } from '@app-game/paint-core/composition/contracts';
import { createDocument } from '@app-game/paint-core/document';
import { createRawProcessor } from '@app-game/paint-core/strokeProcessors';
import { expect, it, vi } from 'vitest';

it.each(['ErTl', 'PbTl', 'PcTl', 'SmTl', 'MixB', 'BlTl', 'ShTl'])(
  'temporary history mode affects only the Eraser, without editing %s settings',
  (type) => {
    const preset = prepareAbrBrush({
      id: 'modifier',
      name: 'Modifier',
      preset: {
        kind: 'brush',
        sourceId: 'fixture',
        ...{ toolOptions: { kind: type, eraseToHistory: false } },
        tip: { kind: 'computed', diameter: pixels(16), spacing: percent(10) }
      },
      resources: [],
      source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
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
