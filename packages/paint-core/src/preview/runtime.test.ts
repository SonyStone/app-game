import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultBrush } from '../brush';
import type { PaintRenderer } from '../composition/contracts';
import { studioBrushRecipe } from '../composition/studioBrushRecipe';
import { createPreviewRuntime } from './runtime';

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
