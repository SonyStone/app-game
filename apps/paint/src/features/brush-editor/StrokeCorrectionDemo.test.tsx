// @vitest-environment jsdom
import { defaultBrush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
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

it('restarts on settings changes, suspends offscreen/hidden, holds reduced motion and cancels on disposal', () => {
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
  const id = next;
  callbacks.get(id)!(performance.now() + 1700);
  expect(Number(canvas.dataset.time)).toBeGreaterThan(1600);
  // A browser removes a dispatched RAF callback before calling it.
  callbacks.delete(id);
  setBrush({ ...brush(), stroke: { ...brush().stroke, mode: 'smooth', catchUp: false } });
  flush();
  expect(canvas.dataset.time).toBe('0');
  expect(host.textContent).toContain('stops short');
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
