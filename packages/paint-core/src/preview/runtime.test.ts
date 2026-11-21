import { syntheticPath } from '@app-game/abr-brush/stroke';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultBrush } from '../brush';
import type { PaintRenderer } from '../composition/contracts';
import { studioBrushRecipe } from '../composition/studioBrushRecipe';
import { applyPressureCurve } from '../pressureCurve';
import { createPreviewRuntime, samplePath } from './runtime';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('opens an ABR stabilizer preview with Paint’s stabilizer processor', async () => {
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      transferToImageBitmap() {
        return {};
      }
    }
  );
  const brush = defaultBrush();
  const preset = prepareAbrBrush({
    id: 'preview',
    name: 'Preview',
    preset: { kind: 'brush', sourceId: 'fixture', tip: { kind: 'computed' } },
    resources: [],
    source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() }
  });
  brush.engine = preset.engine;
  brush.stroke.mode = 'stabilizer';
  const stabilize = vi.spyOn(studioBrushRecipe.processors, 'stabilizer');
  const renderer = {
    begin() {},
    preview() {},
    cancel() {},
    restoreTools() {},
    setLinearBlending() {},
    clipStroke() {},
    render() {},
    releaseLayer() {},
    destroy() {}
  } as unknown as PaintRenderer;
  const preview = createPreviewRuntime(async () => renderer);
  try {
    const reply = await preview.run({
      action: 'begin',
      id: 1,
      revision: 1,
      target: 1,
      points: [],
      configuration: {
        kind: 'brush',
        brush,
        resources: preset.resources,
        width: 8,
        height: 8,
        dpr: 1,
        background: '#ffffff'
      }
    });
    expect(reply.type).toBe('image');
    expect(stabilize).toHaveBeenCalledWith(brush, 1);
  } finally {
    preview.dispose();
  }
});

it.each(['eraser', 'clear'] as const)(
  'erases from a wash over a checkerboard, so the erased shape shows on white paper (%s)',
  async (kind) => {
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        transferToImageBitmap() {
          return {};
        }
      }
    );
    const brush = defaultBrush();
    const preset = prepareAbrBrush({
      id: 'preview',
      name: 'Preview',
      preset: { kind: 'brush', sourceId: 'fixture', tip: { kind: 'computed' } },
      resources: [],
      source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() }
    });
    if (kind === 'eraser') {
      brush.tool = 'eraser';
    } else {
      // The eraser's version of a brush it erases with: the same ABR brush in the Clear mode.
      brush.engine = { ...preset.engine, settings: { ...(preset.engine.settings as object), blendMode: 'Cler' } };
    }
    const render = vi.fn();
    const renderer = {
      begin() {},
      preview() {},
      cancel() {},
      restoreTools() {},
      setLinearBlending() {},
      clipStroke() {},
      render,
      releaseLayer() {},
      destroy() {}
    } as unknown as PaintRenderer;
    const preview = createPreviewRuntime(async () => renderer);
    try {
      const reply = await preview.run({
        action: 'begin',
        id: 1,
        revision: 1,
        target: 1,
        points: [],
        configuration: {
          kind: 'brush',
          brush,
          resources: kind === 'clear' ? preset.resources : [],
          width: 8,
          height: 8,
          dpr: 1,
          background: '#ffffff'
        }
      });
      expect(reply.type === 'error' ? reply.message : reply.type).toBe('image');
      const layers = render.mock.calls[0]![0] as { name: string; tiles: Map<string, Uint8Array> }[];
      expect(layers.map((layer) => layer.name)).toEqual(['checker', 'paint']);
      const wash = layers[1]!.tiles.get('0,0')!;
      // A mid-tone, well apart from the white paper and the light checks.
      expect(wash[0]).toBeLessThan(200);
      expect(wash[3]).toBe(255);
    } finally {
      preview.dispose();
    }
  }
);

it('maps the sample path through the pen pressure curve', () => {
  const curve = {
    points: [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.1 },
      { x: 1, y: 1 }
    ]
  };
  const raw = syntheticPath();
  const mapped = samplePath({ pressureCurve: curve });
  expect(mapped.map((point) => point.pressure)).toEqual(raw.map((point) => applyPressureCurve(curve, point.pressure)));
  expect(mapped.some((point, index) => point.pressure !== raw[index]!.pressure)).toBe(true);
  expect(samplePath({})).toEqual(raw);
});
