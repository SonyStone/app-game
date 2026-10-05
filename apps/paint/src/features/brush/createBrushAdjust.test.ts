// @vitest-environment jsdom
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { createBrushAdjust } from './createBrushAdjust';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
});

it('scales size by horizontal drag and opacity by vertical drag, relative to the brush at contact', () => {
  const { adjust, brush } = setup({ size: 40, opacity: 0.5 });
  expect(adjust.adjust.enabled({ altKey: true, ctrlKey: true, metaKey: false })).toBe(true);
  expect(adjust.adjust.enabled({ altKey: true, ctrlKey: false, metaKey: true })).toBe(true);
  expect(adjust.adjust.enabled({ altKey: true, ctrlKey: false, metaKey: false })).toBe(false);

  adjust.adjust.begin({ x: 100, y: 100 });
  flush();
  expect(adjust.anchor()).toEqual({ x: 100, y: 100 });
  adjust.adjust.move({ x: 220, y: 50 });
  flush();
  expect(brush()).toMatchObject({ size: 80, opacity: 0.7 });
  adjust.adjust.move({ x: -20, y: 100 });
  flush();
  expect(brush()).toMatchObject({ size: 20, opacity: 0.5 });
  adjust.adjust.move({ x: 100, y: 100 });
  flush();
  expect(brush()).toMatchObject({ size: 40, opacity: 0.5 });

  adjust.adjust.end();
  flush();
  expect(adjust.anchor()).toBeUndefined();
});

it('keeps size and opacity within their limits and is unavailable without a brush tool', () => {
  const { adjust, brush, setAvailable } = setup({ size: 400, opacity: 0.9 });
  adjust.adjust.begin({ x: 0, y: 0 });
  adjust.adjust.move({ x: 1000, y: -1000 });
  flush();
  expect(brush()).toMatchObject({ size: 512, opacity: 1 });
  adjust.adjust.move({ x: -5000, y: 5000 });
  flush();
  expect(brush()).toMatchObject({ size: 1, opacity: 0.01 });

  setAvailable(false);
  flush();
  expect(adjust.adjust.enabled({ altKey: true, ctrlKey: true, metaKey: false })).toBe(false);
});

function setup(initial: Partial<Brush>) {
  return createRoot((stop) => {
    dispose = stop;
    const [brush, setBrush] = createSignal<Brush>({ ...defaultBrush(), ...initial });
    const [available, setAvailable] = createSignal(true);
    const adjust = createBrushAdjust({
      brush,
      update: (patch) => setBrush((value) => ({ ...value, ...patch })),
      available
    });
    return { adjust, brush, setAvailable };
  });
}
