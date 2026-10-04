// @vitest-environment jsdom
import type { ColorSample } from '@app-game/paint-core/colorSample';
import { err, ok, type Result } from 'neverthrow';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { engineError, type PaintError } from '../../shared/errors';
import { firstCanvasAction } from '../canvas/firstCanvasAction';
import { createCanvasColorPicker } from './createCanvasColorPicker';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  localStorage.clear();
});

it('picks with Alt only for painting tools, or once after arming', () => {
  let paints = true;
  const { picker } = setup(() => paints);
  expect(picker.canvasAction.enabled({ altKey: false })).toBe(false);
  expect(picker.canvasAction.enabled({ altKey: true })).toBe(true);
  paints = false;
  expect(picker.canvasAction.enabled({ altKey: true })).toBe(false);

  picker.arm();
  expect(picker.canvasAction.enabled({ altKey: false })).toBe(true);
  picker.canvasAction.run({ x: 10, y: 20 });
  flush();
  expect(picker.armed()).toBe(false);
});

it('previews colors from the presented frame while held and applies an exact pick on release', async () => {
  const { picker, pick, apply } = setup(() => true);
  let answer!: (result: Result<string | null, PaintError>) => void;
  pick.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
  picker.canvasAction.run({ x: 10, y: 20 });
  flush();
  expect(picker.preview()).toEqual({ point: { x: 20, y: 40 }, color: undefined, current: '#000000' });
  expect(pick).toHaveBeenLastCalledWith({ x: 20, y: 40 }, { source: 'view', size: 1, exact: false });

  // Moves while a sample is in flight are sampled once it arrives, at the latest point only.
  picker.canvasAction.move!({ x: 11, y: 20 });
  picker.canvasAction.move!({ x: 12, y: 20 });
  expect(pick).toHaveBeenCalledTimes(1);
  answer(ok('#112233'));
  await vi.waitFor(() => expect(pick).toHaveBeenCalledTimes(2));
  expect(pick).toHaveBeenLastCalledWith({ x: 24, y: 40 }, { source: 'view', size: 1, exact: false });
  // The preview shows the latest sample.
  await vi.waitFor(() => {
    flush();
    expect(picker.preview()).toMatchObject({ point: { x: 24, y: 40 }, color: '#336699' });
  });

  picker.settings.update({ source: 'layer', size: 5 });
  picker.canvasAction.end!(false);
  flush();
  expect(picker.preview()).toBeUndefined();
  await vi.waitFor(() => expect(apply).toHaveBeenCalledWith('#336699'));
  expect(pick).toHaveBeenLastCalledWith({ x: 24, y: 40 }, { source: 'layer', size: 5, exact: true });
});

it('picks nothing when cancelled or over a layer without paint, and follows a held finger', async () => {
  const { picker, pick, apply } = setup(() => true);
  picker.canvasAction.run({ x: 0, y: 0 });
  picker.canvasAction.end!(true);
  await Promise.resolve();
  expect(pick).toHaveBeenCalledTimes(1);

  pick.mockResolvedValue(ok(null));
  const drag = picker.hold({ x: 5, y: 5 });
  drag.move({ x: 6, y: 5 });
  drag.end(false);
  await vi.waitFor(() => expect(pick.mock.calls.at(-1)![1].exact).toBe(true));
  await Promise.resolve();
  expect(apply).not.toHaveBeenCalled();
});

it('reports a failed pick and drops a color arriving after disposal', async () => {
  const failure = engineError('failed', 'The drawing engine is not ready.');
  const { picker, pick, apply, onError } = setup(() => true);
  pick.mockResolvedValueOnce(ok('#000000')).mockResolvedValueOnce(err(failure));
  picker.canvasAction.run({ x: 0, y: 0 });
  picker.canvasAction.end!(false);
  await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));

  picker.canvasAction.run({ x: 0, y: 0 });
  picker.canvasAction.end!(false);
  dispose?.();
  dispose = undefined;
  await new Promise((resolve) => setTimeout(resolve));
  expect(apply).not.toHaveBeenCalled();
});

it('keeps the sampling settings across editors', () => {
  setup(() => true).picker.settings.update({ source: 'layer', size: 3 });
  dispose?.();
  const { picker } = setup(() => true);
  expect(picker.settings.sample()).toEqual({ source: 'layer', size: 3 });
});

it('runs the first canvas action enabled at contact, and gives it the drag and release', () => {
  const mixer = { enabled: vi.fn(() => false), run: vi.fn() };
  const picker = { enabled: vi.fn(() => true), run: vi.fn(), move: vi.fn(), end: vi.fn() };
  const action = firstCanvasAction(mixer, picker);
  expect(action.enabled({ altKey: true, pointerType: 'pen' })).toBe(true);
  action.run({ x: 1, y: 2 });
  action.move!({ x: 2, y: 2 });
  action.end!(false);
  expect(picker.run).toHaveBeenCalledWith({ x: 1, y: 2 });
  expect(picker.move).toHaveBeenCalledWith({ x: 2, y: 2 });
  expect(picker.end).toHaveBeenCalledWith(false);
  expect(mixer.run).not.toHaveBeenCalled();

  mixer.enabled.mockReturnValue(true);
  action.enabled({ altKey: true, pointerType: 'pen' });
  action.run({ x: 3, y: 4 });
  action.move!({ x: 5, y: 4 });
  action.end!(true);
  expect(mixer.run).toHaveBeenCalledWith({ x: 3, y: 4 });
  expect(picker.move).toHaveBeenCalledTimes(1);
});

it('previews the color under a hovering pointer while Alt is held, without picking', async () => {
  const { picker, pick, apply, setHovered } = setup(() => true);
  setHovered({ x: 30, y: 30 });
  flush();
  expect(picker.preview()).toBeUndefined();

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }));
  flush();
  expect(picker.preview()).toMatchObject({ point: { x: 30, y: 30 } });
  expect(pick).toHaveBeenLastCalledWith({ x: 30, y: 30 }, { source: 'view', size: 1, exact: false });
  await vi.waitFor(() => {
    flush();
    expect(picker.preview()?.color).toBe('#336699');
  });
  setHovered({ x: 40, y: 30 });
  flush();
  expect(picker.preview()?.point).toEqual({ x: 40, y: 30 });

  // Leaving the canvas or releasing Alt ends the preview; nothing is picked.
  setHovered(undefined);
  flush();
  expect(picker.preview()).toBeUndefined();
  setHovered({ x: 50, y: 30 });
  flush();
  expect(picker.preview()).toBeDefined();
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }));
  flush();
  expect(picker.preview()).toBeUndefined();
  expect(apply).not.toHaveBeenCalled();
});

function setup(paints: () => boolean) {
  const pick = vi.fn<
    (point: { x: number; y: number }, sample: ColorSample) => Promise<Result<string | null, PaintError>>
  >(async () => ok('#336699'));
  const apply = vi.fn();
  const onError = vi.fn();
  const [hovered, setHovered] = createSignal<{ x: number; y: number }>();
  const picker = createRoot((stop) => {
    dispose = stop;
    return createCanvasColorPicker({
      paints,
      hovered,
      toScreen: (point) => ({ x: point.x * 2, y: point.y * 2 }),
      pick,
      current: () => '#000000',
      apply,
      onError
    });
  });
  return { picker, pick, apply, onError, setHovered };
}
