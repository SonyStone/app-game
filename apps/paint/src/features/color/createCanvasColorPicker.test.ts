// @vitest-environment jsdom
import { err, ok, type Result } from 'neverthrow';
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { engineError, type PaintError } from '../../shared/errors';
import { firstCanvasAction } from '../canvas/firstCanvasAction';
import { createCanvasColorPicker } from './createCanvasColorPicker';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
});

it('picks with Alt only for painting tools, or once after arming, at the canvas point', async () => {
  let paints = true;
  const { picker, pick, apply } = setup(() => paints);
  expect(picker.canvasAction.enabled({ altKey: false })).toBe(false);
  expect(picker.canvasAction.enabled({ altKey: true })).toBe(true);
  paints = false;
  expect(picker.canvasAction.enabled({ altKey: true })).toBe(false);

  picker.arm();
  flush();
  expect(picker.canvasAction.enabled({ altKey: false })).toBe(true);
  await picker.canvasAction.run({ x: 10, y: 20 });
  expect(pick).toHaveBeenCalledWith({ x: 20, y: 40 });
  expect(apply).toHaveBeenCalledWith('#336699');
  flush();
  expect(picker.armed()).toBe(false);
});

it('reports a failed pick and drops a color arriving after disposal', async () => {
  const failure = engineError('failed', 'The drawing engine is not ready.');
  const { picker, pick, apply, onError } = setup(() => true);
  pick.mockResolvedValueOnce(err(failure));
  await picker.canvasAction.run({ x: 0, y: 0 });
  expect(onError).toHaveBeenCalledWith(failure);

  const late = picker.canvasAction.run({ x: 0, y: 0 });
  dispose?.();
  dispose = undefined;
  await late;
  expect(apply).not.toHaveBeenCalled();
});

it('runs the first canvas action enabled at contact', () => {
  const mixer = { enabled: vi.fn(() => false), run: vi.fn() };
  const picker = { enabled: vi.fn(() => true), run: vi.fn() };
  const action = firstCanvasAction(mixer, picker);
  expect(action.enabled({ altKey: true, pointerType: 'pen' })).toBe(true);
  action.run({ x: 1, y: 2 });
  expect(picker.run).toHaveBeenCalledWith({ x: 1, y: 2 });
  expect(mixer.run).not.toHaveBeenCalled();

  mixer.enabled.mockReturnValue(true);
  action.enabled({ altKey: true, pointerType: 'pen' });
  action.run({ x: 3, y: 4 });
  expect(mixer.run).toHaveBeenCalledWith({ x: 3, y: 4 });
});

function setup(paints: () => boolean) {
  const pick = vi.fn<(point: { x: number; y: number }) => Promise<Result<string, PaintError>>>(async () =>
    ok('#336699')
  );
  const apply = vi.fn();
  const onError = vi.fn();
  const picker = createRoot((stop) => {
    dispose = stop;
    return createCanvasColorPicker({
      paints,
      toScreen: (point) => ({ x: point.x * 2, y: point.y * 2 }),
      pick,
      apply,
      onError
    });
  });
  return { picker, pick, apply, onError };
}
