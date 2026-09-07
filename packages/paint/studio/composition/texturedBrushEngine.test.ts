import { expect, it, vi } from 'vitest';
import { defaultBrush } from '../brush';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { createBrushResources } from './brushResources';
import type { PaintRenderer } from './contracts';
import { createResourceSession } from './resourceSession';
import { texturedBrush } from './texturedBrushEngine';

it('resolves tips before creating renderer state, preserving pressure and native aspect bounds', async () => {
  const cache = createBrushResources();
  const begin = vi.fn(),
    paint = vi.fn<PaintRenderer['paint']>(async () => {});
  const renderer = {
    begin,
    paint,
    preview: vi.fn(),
    finish: async () => [],
    cancel: vi.fn()
  } as unknown as PaintRenderer;
  const brush = { ...defaultBrush(), size: 100, pressureSize: true, pressureFlow: true };
  const create = () =>
    createResourceSession(cache, (resources) =>
      texturedBrush.engine({
        brush,
        layer: createDocument().active,
        processor: createRawProcessor(),
        renderer,
        resources,
        settings: texturedBrush.select({ tipId: 'tip' }).settings
      })
    );
  expect(create).toThrow('not loaded');
  expect(begin).not.toHaveBeenCalled();
  cache.put({ id: 'tip', width: 2, height: 1, pixels: new Uint8Array([255, 0]), format: 'r8unorm' });
  const stroke = create();
  expect(begin).toHaveBeenCalledWith(expect.anything(), brush, expect.objectContaining({ angle: 0 }));
  await stroke.add([{ x: 0, y: 0, pressure: 0.5, time: 0 }]);
  expect(paint.mock.calls[0]![0][0]!.radius).toBeCloseTo((25 * Math.hypot(2, 1)) / 2);
  expect(paint.mock.calls[0]![0][0]!.flow).toBeCloseTo(brush.flow * 0.5);
  await stroke.finish();
  expect(cache.stats().pinnedBytes).toBe(0);
});

it('rejects invalid angle and spacing instead of passing NaN into GPU uniforms', () => {
  expect(() => texturedBrush.select({ tipId: 'a', angle: NaN })).toThrow();
  expect(() => texturedBrush.select({ tipId: 'a', spacing: 0 })).toThrow();
});
