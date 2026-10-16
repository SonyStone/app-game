// @vitest-environment jsdom
import { defaultBrush } from '@app-game/paint-core/brush';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createInkTrail } from './createInkTrail';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('starts the trail from drawn events in the brush color, opacity and size, never for erasers, and hides it for withheld ones', async () => {
  const update = vi.fn();
  const requestPresenter = vi.fn(async () => ({ updateInkTrailStartPoint: update }));
  vi.stubGlobal('navigator', { ...navigator, ink: { requestPresenter } });
  const canvas = document.createElement('canvas');
  const [enabled, setEnabled] = createSignal(true);
  const { trail, dispose } = createRoot((dispose) => ({
    trail: createInkTrail({ canvas: () => canvas, enabled, zoom: () => 2 }),
    dispose
  }));
  flush();
  await Promise.resolve();
  expect(requestPresenter).toHaveBeenCalledExactlyOnceWith({ presentationArea: canvas });

  const event = new MouseEvent('pointermove') as PointerEvent;
  Object.defineProperties(event, { pointerType: { value: 'pen' }, pressure: { value: 0.5 } });
  const brush = { ...defaultBrush(), color: '#112233', opacity: 0.5, size: 10 };
  trail.drawn(event, brush);
  expect(update).toHaveBeenCalledExactlyOnceWith(event, { color: '#11223380', diameter: 10 });

  // A stroke the engine no longer receives hides the trail.
  trail.withheld(event);
  expect(update).toHaveBeenLastCalledWith(event, { color: 'transparent', diameter: 1 });
  update.mockClear();

  trail.drawn(event, { ...brush, tool: 'eraser' });
  trail.drawn(event, { ...brush, engine: { id: 'abr', settings: { blendMode: 'Cler' } } });
  expect(update).not.toHaveBeenCalled();

  setEnabled(false);
  flush();
  trail.drawn(event, brush);
  trail.withheld(event);
  expect(update).not.toHaveBeenCalled();
  dispose();
});
