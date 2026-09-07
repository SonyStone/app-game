import { expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';
import { defaultBrush } from '../brush';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { createBrushResources } from './brushResources';
import type { BrushEngine, PaintRenderer } from './contracts';
import { defineBrushEngine } from './defineBrushEngine';
import { roundBrush } from './roundBrushEngine';

it('infers settings and snapshots them on selection and on stroke creation', () => {
  const schema = z.object({ tipId: z.string(), dynamics: z.object({ jitter: z.number().finite() }) });
  let captured: z.infer<typeof schema> | undefined;
  const engine = defineBrushEngine({
    id: 'textured',
    parse: (input) => schema.parse(input),
    create({ settings }) {
      expectTypeOf(settings).toEqualTypeOf<z.infer<typeof schema>>();
      captured = settings;
      return { add: async () => {}, preview() {}, finish: async () => [], cancel() {} };
    }
  });
  const settings = { tipId: 'tip-1', dynamics: { jitter: 0.2 } };
  const selection = engine.select(settings);
  expectTypeOf(selection.id).toEqualTypeOf<'textured'>();
  settings.dynamics.jitter = 0.9;
  expect(selection.settings.dynamics.jitter).toBe(0.2);
  engine.engine(context(selection.settings));
  selection.settings.dynamics.jitter = 0.8;
  expect(captured!.dynamics.jitter).toBe(0.2);
});

it('rejects malformed settings before starting the engine and validates cloneability', () => {
  const create = vi.fn(() => ({ add: async () => {}, preview() {}, finish: async () => [], cancel() {} }));
  const engine = defineBrushEngine({
    id: 'custom',
    parse: (input) => z.object({ count: z.number().int().positive() }).parse(input),
    create
  });
  expect(() => engine.engine(context({ count: -1 }))).toThrow();
  expect(create).not.toHaveBeenCalled();
  const noncloneable = defineBrushEngine({ id: 'invalid', parse: (_input: unknown) => ({ callback() {} }), create });
  expect(() => noncloneable.select({ callback() {} })).toThrow();
});

it('applies typed round presets and keeps controls for undefined overrides', async () => {
  const begin = vi.fn();
  const paint = vi.fn<PaintRenderer['paint']>(async () => {});
  const renderer = { begin, paint, preview() {}, finish: async () => [], cancel() {} } as unknown as PaintRenderer;
  const brush = defaultBrush();
  const ctx = { ...context(undefined), brush, renderer };
  roundBrush.engine({ ...ctx, settings: { hardness: undefined, spacing: undefined } });
  expect(begin).toHaveBeenLastCalledWith(
    ctx.layer,
    expect.objectContaining({ spacing: brush.spacing, hardness: brush.hardness })
  );
  const session = roundBrush.engine({ ...ctx, settings: roundBrush.select({ hardness: 1, spacing: 0.5 }).settings });
  expect(begin).toHaveBeenLastCalledWith(ctx.layer, expect.objectContaining({ hardness: 1, spacing: 0.5 }));
  await session.add([
    { x: 0, y: 0, pressure: 1, time: 0 },
    { x: 32, y: 0, pressure: 1, time: 1 }
  ]);
  expect(paint.mock.calls[0]![0]).toHaveLength(3);
  expect(() => roundBrush.engine({ ...ctx, settings: { spacing: 0 } })).toThrow();
  expect(begin).toHaveBeenCalledTimes(2);
});

function context(settings: unknown): Parameters<BrushEngine>[0] {
  return {
    settings,
    resources: createBrushResources().open(),
    brush: defaultBrush(),
    layer: createDocument().active,
    processor: createRawProcessor(),
    renderer: {} as PaintRenderer
  };
}
