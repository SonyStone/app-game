// @vitest-environment jsdom
import { defaultBrush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import * as simulation from './correctionDemoSimulation';
import { StrokeCorrectionDemo } from './StrokeCorrectionDemo';

const controls = vi.hoisted(() => ({ visible: (): boolean => true, reduced: (): boolean => false }));
vi.mock('@solid-primitives/intersection-observer', () => ({
  createVisibilityObserver: () => () => controls.visible()
}));
vi.mock('@solid-primitives/media', () => ({ createMediaQuery: () => () => controls.reduced() }));
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('keeps time and caches full replays on settings changes, suspends offscreen/hidden, holds reduced motion and cancels on disposal', () => {
  const prepare = vi.spyOn(simulation, 'prepareStrokeCorrection');
  vi.stubGlobal('IntersectionObserver', class {});
  vi.stubGlobal('matchMedia', () => ({}));
  const callbacks = new Map<number, FrameRequestCallback>();
  let next = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.set(++next, callback);
    return next;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  const context = {
    setLineDash() {},
    scale() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    arc() {}
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as ReturnType<HTMLCanvasElement['getContext']>
  );
  const [visible, setVisible] = createSignal(true);
  const [reduced, setReduced] = createSignal(false);
  const [brush, setBrush] = createSignal(defaultBrush());
  controls.visible = visible;
  controls.reduced = reduced;
  let hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <StrokeCorrectionDemo brush={brush()} />, host);
  flush();
  const canvas = host.querySelector('canvas')!;
  expect(callbacks.size).toBe(1);
  const initialComputations = prepare.mock.calls.length;
  const id = next;
  callbacks.get(id)!(performance.now() + 1700);
  flush();
  expect(Number(canvas.dataset.time)).toBeGreaterThan(1600);
  // A browser removes a dispatched RAF callback before calling it.
  callbacks.delete(id);
  const timeBeforeChange = canvas.dataset.time;
  const requestBeforeChange = next;
  setBrush({ ...brush(), stroke: { ...brush().stroke, mode: 'smooth', catchUp: false } });
  flush();
  expect(Number(canvas.dataset.time)).toBeGreaterThan(1600);
  expect(canvas.dataset.time).toBe(timeBeforeChange);
  expect(next).toBe(requestBeforeChange);
  expect(prepare).toHaveBeenCalledTimes(initialComputations + 1);
  expect(host.textContent).toBe('');
  expect(host.querySelector('figcaption')).toBeNull();
  expect(canvas.getAttribute('aria-label')).toBe('Stroke correction demonstration');
  const frameId = next;
  callbacks.get(frameId)!(performance.now() + 1800);
  callbacks.delete(frameId);
  expect(prepare).toHaveBeenCalledTimes(initialComputations + 1);
  setVisible(false);
  flush();
  expect(callbacks.size).toBe(0);
  setVisible(true);
  flush();
  expect(callbacks.size).toBe(1);
  hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  flush();
  expect(callbacks.size).toBe(0);
  hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  setReduced(true);
  flush();
  expect(callbacks.size).toBe(0);
  expect(canvas.dataset.phase).toBe('lifted');
  setReduced(false);
  flush();
  expect(callbacks.size).toBe(1);
  dispose();
  dispose = undefined;
  expect(callbacks.size).toBe(0);
});
