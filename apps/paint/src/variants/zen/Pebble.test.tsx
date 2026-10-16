// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Pebble } from './Pebble';

const center = { x: 1200, y: 400 };
let calls: ReturnType<typeof renderPebble>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  calls = renderPebble();
});

afterEach(() => {
  calls.dispose();
  vi.useRealTimers();
  document.body.replaceChildren();
});

it('opens the fan on a tap, also one that trembles a few pixels', () => {
  press('pointerdown', 1200, 400);
  press('pointermove', 1204, 403);
  press('pointerup', 1204, 403);
  expect(calls.onTap).toHaveBeenCalledOnce();
  expect(calls.onCarry).not.toHaveBeenCalled();
});

it('carries the pebble with a drag, held where it was grabbed, and rests it where it is let go', () => {
  press('pointerdown', 1210, 390, 'pen');
  press('pointermove', 1100, 300, 'pen');
  expect(calls.onCarry).toHaveBeenLastCalledWith({ x: 1090, y: 310 });
  expect(pebble().hasAttribute('data-lifted')).toBe(true);
  press('pointermove', 640, 420, 'pen');
  press('pointerup', 640, 420, 'pen');
  expect(calls.onDrop).toHaveBeenCalledWith({ x: 630, y: 430 });
  expect(calls.onTap).not.toHaveBeenCalled();
  expect(calls.onAdjust).not.toHaveBeenCalled();
  expect(pebble().hasAttribute('data-lifted')).toBe(false);
});

it('wakes the brush controls on a held press, then sets the size up and down and the opacity sideways', () => {
  press('pointerdown', 1200, 400, 'touch');
  vi.advanceTimersByTime(400);
  flush();
  expect(pebble().hasAttribute('data-adjusting')).toBe(true);
  expect(document.body.textContent).toContain('10 px');

  press('pointermove', 1200, 310, 'touch');
  expect(calls.onAdjust).toHaveBeenLastCalledWith({ size: expect.any(Number) });
  const size = calls.onAdjust.mock.lastCall![0].size!;
  expect(size).toBeGreaterThan(10);
  press('pointerup', 1200, 310, 'touch');
  expect(calls.onAdjusted).toHaveBeenCalledWith({ size });
  expect(calls.onCarry).not.toHaveBeenCalled();
  expect(calls.onTap).not.toHaveBeenCalled();
  expect(pebble().hasAttribute('data-adjusting')).toBe(false);

  press('pointerdown', 1200, 400, 'touch');
  vi.advanceTimersByTime(400);
  press('pointermove', 1100, 405, 'touch');
  expect(calls.onAdjust).toHaveBeenLastCalledWith({ opacity: expect.any(Number) });
  expect(calls.onAdjust.mock.lastCall![0].opacity!).toBeLessThan(1);
  press('pointerup', 1100, 405, 'touch');
});

it('does nothing when a held press lifts without moving', () => {
  press('pointerdown', 1200, 400);
  vi.advanceTimersByTime(400);
  press('pointerup', 1200, 400);
  expect(calls.onTap).not.toHaveBeenCalled();
  expect(calls.onAdjusted).not.toHaveBeenCalled();
});

it('carries instead when the brush cannot change', () => {
  calls.dispose();
  calls = renderPebble({ adjustable: false });
  press('pointerdown', 1200, 400);
  vi.advanceTimersByTime(400);
  press('pointermove', 1200, 300);
  press('pointerup', 1200, 300);
  expect(calls.onAdjust).not.toHaveBeenCalled();
  expect(calls.onDrop).toHaveBeenCalledWith({ x: 1200, y: 300 });
});

function renderPebble(options: { adjustable?: boolean } = {}) {
  const handlers = {
    onTap: vi.fn<() => void>(),
    onCarry: vi.fn<(center: { x: number; y: number }) => void>(),
    onDrop: vi.fn<(center: { x: number; y: number }) => void>(),
    onAdjust: vi.fn<(patch: { size?: number; opacity?: number }) => void>(),
    onAdjusted: vi.fn<(patch: { size?: number; opacity?: number }) => void>()
  };
  const host = document.body.appendChild(document.createElement('div'));
  const dispose = render(
    () => (
      <Pebble
        center={center}
        view={{ width: 1280, height: 800 }}
        hand="left"
        hidden={false}
        open={false}
        lifted={false}
        brush={{ size: 10, opacity: 1, color: '#123456' }}
        erasing={false}
        zoom={1}
        maxSize={512}
        adjustable={options.adjustable ?? true}
        {...handlers}
      />
    ),
    host
  );
  flush();
  return { ...handlers, dispose };
}

function pebble() {
  return document.querySelector<HTMLElement>('[role="button"][aria-label^="Tools"]')!;
}

/** Dispatches a pointer event of pointer 1 on the pebble, as pointer capture would deliver it. */
function press(type: string, clientX: number, clientY: number, pointerType = 'mouse') {
  pebble().dispatchEvent(
    Object.assign(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1
      }),
      { pointerId: 1, pointerType }
    )
  );
  flush();
}
