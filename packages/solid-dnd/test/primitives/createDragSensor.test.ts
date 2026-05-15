import { createRoot } from 'solid-js';
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from 'src/primitives/createDragSensor';
import { createDragSensor } from 'src/primitives/createDragSensor';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MARK: Helpers — Synthetic PointerEvent
// ============================================================================

/** jsdom doesn't support PointerEvent, so we polyfill it. */
class MockPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;

  constructor(type: string, init: PointerEventInit & { isPrimary?: boolean } = {}) {
    super(type, { bubbles: true, cancelable: true, ...init });
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
    this.isPrimary = init.isPrimary ?? true;
  }
}

// Assign it globally so setPointerCapture etc. can be used
if (typeof globalThis.PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = MockPointerEvent;
}

// Polyfill pointer capture methods for JSDOM (needed for proxy element tests)
if (typeof HTMLElement.prototype.setPointerCapture === 'undefined') {
  HTMLElement.prototype.setPointerCapture = function () {};
  HTMLElement.prototype.releasePointerCapture = function () {};
}

/**
 * Creates a PointerEvent with clientX/clientY set.
 * Adds `currentTarget` via defineProperty since it's read-only.
 */
function pointer(
  type: string,
  x: number,
  y: number,
  opts: Partial<PointerEventInit & { isPrimary?: boolean; button?: number }> = {}
): PointerEvent {
  return new MockPointerEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'mouse',
    ...opts
  }) as unknown as PointerEvent;
}

/**
 * Creates a mock DOM element with setPointerCapture/releasePointerCapture stubs,
 * and full addEventListener/removeEventListener/dispatchEvent support.
 */
function createMockElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
  return el;
}

/**
 * Fires a pointerdown on the element, setting currentTarget correctly.
 * Returns the element for chaining.
 */
function firePointerDown(el: HTMLElement, x: number, y: number, opts?: Partial<PointerEventInit>): void {
  const ev = pointer('pointerdown', x, y, opts);
  // SolidJS-style: call onPointerDown directly, but we need currentTarget.
  // So we dispatch on the element, which sets currentTarget automatically.
  // But first, we need to attach the handler. Let's use dispatchEvent.
  el.dispatchEvent(ev);
}

function firePointerMove(el: HTMLElement, x: number, y: number, opts?: Partial<PointerEventInit>): void {
  el.dispatchEvent(pointer('pointermove', x, y, opts));
}

function firePointerUp(el: HTMLElement, x: number, y: number, opts?: Partial<PointerEventInit>): void {
  el.dispatchEvent(pointer('pointerup', x, y, opts));
}

function firePointerCancel(el: HTMLElement): void {
  el.dispatchEvent(pointer('pointercancel', 0, 0));
}

function fireEscapeKey(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

// ============================================================================
// MARK: Tests
// ============================================================================

describe('createDragSensor', () => {
  let dispose: () => void;

  afterEach(() => {
    dispose?.();
  });

  /**
   * Helper that creates a drag sensor inside a reactive root,
   * attaches it to a mock element, and returns everything for testing.
   */
  function setup(opts: Parameters<typeof createDragSensor>[0] = {}) {
    let sensor!: ReturnType<typeof createDragSensor>;
    const el = createMockElement();

    dispose = createRoot((d) => {
      sensor = createDragSensor(opts);
      // Attach the sensor's onPointerDown to the element via addEventListener.
      // This way, dispatching a pointerdown on el will invoke the sensor.
      el.addEventListener('pointerdown', sensor.onPointerDown);
      return d;
    });

    return { sensor, el };
  }

  // ── Basic lifecycle ───────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts idle', () => {
      const { sensor } = setup();
      expect(sensor.isDragging()).toBe(false);
      expect(sensor.position()).toBeNull();
      expect(sensor.delta()).toBeNull();
      expect(sensor.pointerType()).toBe('mouse');
    });
  });

  // ── Threshold detection ───────────────────────────────────────────────

  describe('threshold detection', () => {
    it('does not start drag when movement is below threshold', () => {
      const onDragStart = vi.fn();
      const { sensor, el } = setup({ onDragStart, threshold: 10 });

      firePointerDown(el, 100, 100);
      // Move 5px — below the 10px threshold
      firePointerMove(el, 105, 100);

      expect(onDragStart).not.toHaveBeenCalled();
      expect(sensor.isDragging()).toBe(false);
    });

    it('starts drag when movement exceeds threshold', () => {
      const onDragStart = vi.fn();
      const { sensor, el } = setup({ onDragStart, threshold: 10 });

      firePointerDown(el, 100, 100);
      // Move 15px horizontally — exceeds 10px threshold
      firePointerMove(el, 115, 100);

      expect(onDragStart).toHaveBeenCalledOnce();
      expect(sensor.isDragging()).toBe(true);
    });

    it('uses Euclidean distance (diagonal)', () => {
      const onDragStart = vi.fn();
      const { el } = setup({ onDragStart, threshold: 10 });

      firePointerDown(el, 100, 100);
      // Move 7px diagonal: sqrt(7² + 7²) ≈ 9.9 — below threshold
      firePointerMove(el, 107, 107);
      expect(onDragStart).not.toHaveBeenCalled();

      // Move 8px diagonal: sqrt(8² + 8²) ≈ 11.3 — above threshold
      firePointerMove(el, 108, 108);
      expect(onDragStart).toHaveBeenCalledOnce();
    });

    it('uses default threshold of 8 when not specified', () => {
      const onDragStart = vi.fn();
      const { el } = setup({ onDragStart });

      firePointerDown(el, 100, 100);
      // Move exactly 7px — below default 8px threshold
      firePointerMove(el, 107, 100);
      expect(onDragStart).not.toHaveBeenCalled();

      // Move 9px
      firePointerMove(el, 109, 100);
      expect(onDragStart).toHaveBeenCalledOnce();
    });
  });

  // ── Drag start event ──────────────────────────────────────────────────

  describe('onDragStart event', () => {
    it('provides correct position and origin', () => {
      let captured: DragStartEvent | undefined;
      const { el } = setup({
        onDragStart: (e) => {
          captured = e;
        },
        threshold: 5
      });

      firePointerDown(el, 100, 200);
      firePointerMove(el, 110, 200);

      expect(captured).toBeDefined();
      expect(captured!.origin).toEqual({ x: 100, y: 200 });
      expect(captured!.position).toEqual({ x: 110, y: 200 });
    });

    it('includes the original PointerEvent', () => {
      let captured: DragStartEvent | undefined;
      const { el } = setup({
        onDragStart: (e) => {
          captured = e;
        },
        threshold: 5
      });

      firePointerDown(el, 100, 200);
      firePointerMove(el, 110, 200);

      expect(captured!.pointerEvent).toBeDefined();
      // The pointerEvent is the original pointerdown event
      expect(captured!.pointerEvent.clientX).toBe(100);
      expect(captured!.pointerEvent.clientY).toBe(200);
    });
  });

  // ── Drag move ─────────────────────────────────────────────────────────

  describe('onDragMove', () => {
    it('fires with correct position and delta', () => {
      const moves: DragMoveEvent[] = [];
      const { sensor, el } = setup({
        onDragMove: (e) => moves.push(e),
        threshold: 5
      });

      firePointerDown(el, 100, 100);
      // Move past threshold
      firePointerMove(el, 110, 100);
      // Now move further
      firePointerMove(el, 120, 130);

      expect(moves).toHaveLength(1); // First move was the threshold-crossing one (no onDragMove for it)
      expect(moves[0].position).toEqual({ x: 120, y: 130 });
      // Delta is from origin (100, 100) — not from the threshold-crossing point
      expect(moves[0].delta).toEqual({ x: 20, y: 30 });

      // Check reactive state
      expect(sensor.position()).toEqual({ x: 120, y: 130 });
      expect(sensor.delta()).toEqual({ x: 20, y: 30 });
    });

    it('does not fire before threshold is exceeded', () => {
      const onDragMove = vi.fn();
      const { el } = setup({ onDragMove, threshold: 100 });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 105, 100);
      firePointerMove(el, 110, 100);
      firePointerMove(el, 115, 100);

      expect(onDragMove).not.toHaveBeenCalled();
    });
  });

  // ── Drag end ──────────────────────────────────────────────────────────

  describe('onDragEnd', () => {
    it('fires with final position and delta on pointerup', () => {
      let captured: DragEndEvent | undefined;
      const { sensor, el } = setup({
        onDragEnd: (e) => {
          captured = e;
        },
        threshold: 5
      });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100); // start drag
      firePointerMove(el, 150, 160); // move
      firePointerUp(el, 150, 160); // end

      expect(captured).toBeDefined();
      expect(captured!.position).toEqual({ x: 150, y: 160 });
      // Delta from origin (100, 100)
      expect(captured!.delta).toEqual({ x: 50, y: 60 });

      // Sensor resets
      expect(sensor.isDragging()).toBe(false);
      expect(sensor.position()).toBeNull();
      expect(sensor.delta()).toBeNull();
    });

    it('does not fire if drag was never started (click)', () => {
      const onDragEnd = vi.fn();
      const { el } = setup({ onDragEnd, threshold: 10 });

      firePointerDown(el, 100, 100);
      // Small move — below threshold
      firePointerMove(el, 102, 100);
      firePointerUp(el, 102, 100);

      expect(onDragEnd).not.toHaveBeenCalled();
    });
  });

  // ── Cancellation ──────────────────────────────────────────────────────

  describe('cancellation', () => {
    it('fires onDragCancel on pointercancel', () => {
      const onDragCancel = vi.fn();
      const { sensor, el } = setup({ onDragCancel, threshold: 5 });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100); // start drag
      firePointerCancel(el);

      expect(onDragCancel).toHaveBeenCalledOnce();
      expect(sensor.isDragging()).toBe(false);
    });

    it('fires onDragCancel on Escape key', () => {
      const onDragCancel = vi.fn();
      const { sensor, el } = setup({ onDragCancel, threshold: 5 });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100); // start drag
      fireEscapeKey();

      expect(onDragCancel).toHaveBeenCalledOnce();
      expect(sensor.isDragging()).toBe(false);
    });

    it('cancels tracking (pre-threshold) on Escape without calling onDragCancel', () => {
      const onDragCancel = vi.fn();
      const onDragStart = vi.fn();
      const { el } = setup({ onDragCancel, onDragStart, threshold: 100 });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 105, 100); // still below threshold
      fireEscapeKey();

      // Not a drag cancel because drag never started — but tracking stops
      expect(onDragCancel).not.toHaveBeenCalled();
      // Subsequent movement should not trigger drag
      firePointerMove(el, 500, 500);
      expect(onDragStart).not.toHaveBeenCalled();
    });

    it('cancel() method works programmatically', () => {
      const onDragCancel = vi.fn();
      const { sensor, el } = setup({ onDragCancel, threshold: 5 });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100);
      expect(sensor.isDragging()).toBe(true);

      sensor.cancel();

      expect(onDragCancel).toHaveBeenCalledOnce();
      expect(sensor.isDragging()).toBe(false);
    });
  });

  // ── Pointer filtering ────────────────────────────────────────────────

  describe('pointer filtering', () => {
    it('ignores right-click (button !== 0)', () => {
      const onDragStart = vi.fn();
      const { el } = setup({ onDragStart, threshold: 5 });

      // Right-click = button 2
      firePointerDown(el, 100, 100, { button: 2 });
      firePointerMove(el, 200, 200);

      expect(onDragStart).not.toHaveBeenCalled();
    });

    it('ignores middle-click (button !== 0)', () => {
      const onDragStart = vi.fn();
      const { el } = setup({ onDragStart, threshold: 5 });

      // Middle-click = button 1
      firePointerDown(el, 100, 100, { button: 1 });
      firePointerMove(el, 200, 200);

      expect(onDragStart).not.toHaveBeenCalled();
    });

    it('ignores non-primary pointer (multi-touch)', () => {
      const onDragStart = vi.fn();
      const { el } = setup({ onDragStart, threshold: 5 });

      firePointerDown(el, 100, 100, { isPrimary: false } as any);
      firePointerMove(el, 200, 200);

      expect(onDragStart).not.toHaveBeenCalled();
    });

    it('ignores pointermove from non-primary pointer during drag', () => {
      const onDragMove = vi.fn();
      const { el } = setup({ onDragMove, threshold: 5 });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100); // start drag (primary)
      // Secondary pointer move
      firePointerMove(el, 200, 200, { isPrimary: false } as any);

      // Only the threshold-crossing move should have happened; no onDragMove from secondary
      expect(onDragMove).not.toHaveBeenCalled();
    });
  });

  // ── Pointer capture ───────────────────────────────────────────────────

  describe('pointer capture', () => {
    it('calls setPointerCapture on pointerdown', () => {
      const { el } = setup({ threshold: 5 });

      firePointerDown(el, 100, 100);

      expect(el.setPointerCapture).toHaveBeenCalledWith(1);
    });

    it('calls releasePointerCapture on pointerup', () => {
      const { el } = setup({ threshold: 5 });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100);
      firePointerUp(el, 120, 100);

      expect(el.releasePointerCapture).toHaveBeenCalledWith(1);
    });
  });

  // ── Pointer type ──────────────────────────────────────────────────────

  describe('pointer type', () => {
    it('reports touch pointer type', () => {
      const { sensor, el } = setup({ threshold: 5 });

      firePointerDown(el, 100, 100, { pointerType: 'touch' });

      expect(sensor.pointerType()).toBe('touch');
    });

    it('reports pen pointer type', () => {
      const { sensor, el } = setup({ threshold: 5 });

      firePointerDown(el, 100, 100, { pointerType: 'pen' });

      expect(sensor.pointerType()).toBe('pen');
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('does not start a second drag while one is active', () => {
      const onDragStart = vi.fn();
      const { el } = setup({ onDragStart, threshold: 5 });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100); // start drag
      expect(onDragStart).toHaveBeenCalledOnce();

      // Try starting another drag
      firePointerDown(el, 200, 200);
      firePointerMove(el, 220, 200);

      // Only one drag started
      expect(onDragStart).toHaveBeenCalledOnce();
    });

    it('allows a new drag after the previous one ends', () => {
      const onDragStart = vi.fn();
      const { el } = setup({ onDragStart, threshold: 5 });

      // First drag
      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100);
      firePointerUp(el, 120, 100);
      expect(onDragStart).toHaveBeenCalledOnce();

      // Second drag
      firePointerDown(el, 200, 200);
      firePointerMove(el, 220, 200);
      expect(onDragStart).toHaveBeenCalledTimes(2);
    });

    it('allows a new drag after cancellation', () => {
      const onDragStart = vi.fn();
      const { sensor, el } = setup({ onDragStart, threshold: 5 });

      // First drag — cancelled
      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100);
      sensor.cancel();
      expect(onDragStart).toHaveBeenCalledOnce();

      // Second drag — should work
      firePointerDown(el, 200, 200);
      firePointerMove(el, 220, 200);
      expect(onDragStart).toHaveBeenCalledTimes(2);
    });

    it('cleans up on pointerup even without drag (simple click)', () => {
      const { sensor, el } = setup({ threshold: 100 });

      firePointerDown(el, 100, 100);
      firePointerUp(el, 102, 100); // tiny move, way below threshold

      expect(sensor.isDragging()).toBe(false);

      // A new drag should still be possible
      firePointerDown(el, 200, 200);
      firePointerMove(el, 500, 500);
      expect(sensor.isDragging()).toBe(true);
    });
  });

  // ── onClick (click-vs-drag disambiguation) ────────────────────────────

  describe('onClick', () => {
    it('fires onClick when pointerUp without exceeding threshold', () => {
      const onClick = vi.fn();
      const { el } = setup({ onClick, threshold: 10 });

      firePointerDown(el, 100, 100);
      firePointerUp(el, 102, 100);

      expect(onClick).toHaveBeenCalledOnce();
    });

    it('receives the original PointerEvent with modifiers', () => {
      const onClick = vi.fn();
      const { el } = setup({ onClick, threshold: 10 });

      firePointerDown(el, 100, 100);
      firePointerUp(el, 100, 100, { ctrlKey: true } as any);

      expect(onClick).toHaveBeenCalledOnce();
      const ev = onClick.mock.calls[0][0] as PointerEvent;
      expect(ev.ctrlKey).toBe(true);
    });

    it('does NOT fire onClick when drag threshold is exceeded', () => {
      const onClick = vi.fn();
      const { el } = setup({ onClick, threshold: 5 });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100); // well past threshold
      firePointerUp(el, 120, 100);

      expect(onClick).not.toHaveBeenCalled();
    });

    it('fires onClick on zero-movement click', () => {
      const onClick = vi.fn();
      const { el } = setup({ onClick, threshold: 5 });

      firePointerDown(el, 100, 100);
      firePointerUp(el, 100, 100);

      expect(onClick).toHaveBeenCalledOnce();
    });

    it('does not fire onClick on cancel', () => {
      const onClick = vi.fn();
      const { el } = setup({ onClick, threshold: 100 });

      firePointerDown(el, 100, 100);
      firePointerCancel(el);

      expect(onClick).not.toHaveBeenCalled();
    });

    it('does not fire onClick on Escape during tracking', () => {
      const onClick = vi.fn();
      const { el } = setup({ onClick, threshold: 100 });

      firePointerDown(el, 100, 100);
      fireEscapeKey();

      expect(onClick).not.toHaveBeenCalled();
    });
  });

  // ── Proxy capture ───────────────────────────────────────────────────────

  describe('proxyCapture', () => {
    afterEach(() => {
      // Clean up stray proxy elements for test isolation
      document.querySelectorAll('[data-dnd-capture-proxy]').forEach((el) => el.remove());
    });

    it('creates a proxy element when drag threshold is exceeded', () => {
      const onDragStart = vi.fn();
      const { sensor, el } = setup({ proxyCapture: true, onDragStart, threshold: 5 });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100);

      expect(onDragStart).toHaveBeenCalledOnce();
      expect(sensor.isDragging()).toBe(true);

      const proxy = document.querySelector('[data-dnd-capture-proxy]');
      expect(proxy).toBeTruthy();
    });

    it('does not create a proxy when proxyCapture is not enabled', () => {
      const { el } = setup({ threshold: 5 });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100);

      const proxy = document.querySelector('[data-dnd-capture-proxy]');
      expect(proxy).toBeNull();
    });

    it('delivers drag move events via the proxy element', () => {
      const onDragMove = vi.fn();
      const { el } = setup({ proxyCapture: true, onDragMove, threshold: 5 });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100); // threshold → proxy transfer

      const proxy = document.querySelector('[data-dnd-capture-proxy]') as HTMLElement;
      expect(proxy).toBeTruthy();

      // Events dispatched on the proxy (simulating pointer capture delivery)
      proxy.dispatchEvent(pointer('pointermove', 150, 160));

      expect(onDragMove).toHaveBeenCalledOnce();
      expect(onDragMove).toHaveBeenCalledWith(
        expect.objectContaining({
          position: { x: 150, y: 160 },
          delta: { x: 50, y: 60 }
        })
      );
    });

    it('delivers drag end via the proxy element', () => {
      const onDragEnd = vi.fn();
      const { sensor, el } = setup({ proxyCapture: true, onDragEnd, threshold: 5 });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100);

      const proxy = document.querySelector('[data-dnd-capture-proxy]') as HTMLElement;
      proxy.dispatchEvent(pointer('pointerup', 130, 140));

      expect(onDragEnd).toHaveBeenCalledOnce();
      expect(sensor.isDragging()).toBe(false);
    });

    it('releases capture on source element during transfer', () => {
      const { el } = setup({ proxyCapture: true, threshold: 5 });

      firePointerDown(el, 100, 100);
      expect(el.setPointerCapture).toHaveBeenCalledWith(1);

      firePointerMove(el, 120, 100); // triggers transfer

      expect(el.releasePointerCapture).toHaveBeenCalledWith(1);
    });

    it('cleans up proxy element on disposal', () => {
      const { el } = setup({ proxyCapture: true, threshold: 5 });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100);
      expect(document.querySelector('[data-dnd-capture-proxy]')).toBeTruthy();

      dispose();

      expect(document.querySelector('[data-dnd-capture-proxy]')).toBeNull();
    });

    it('cancellation works via Escape key', () => {
      const onDragCancel = vi.fn();
      const { sensor, el } = setup({ proxyCapture: true, onDragCancel, threshold: 5 });

      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100);
      expect(sensor.isDragging()).toBe(true);

      fireEscapeKey();

      expect(onDragCancel).toHaveBeenCalledOnce();
      expect(sensor.isDragging()).toBe(false);
    });

    it('allows a new drag after proxy drag ends', () => {
      const onDragStart = vi.fn();
      const { el } = setup({ proxyCapture: true, onDragStart, threshold: 5 });

      // First drag
      firePointerDown(el, 100, 100);
      firePointerMove(el, 120, 100);
      expect(onDragStart).toHaveBeenCalledOnce();

      const proxy = document.querySelector('[data-dnd-capture-proxy]') as HTMLElement;
      proxy.dispatchEvent(pointer('pointerup', 130, 140));

      // Second drag
      firePointerDown(el, 200, 200);
      firePointerMove(el, 220, 200);
      expect(onDragStart).toHaveBeenCalledTimes(2);
    });

    it('does not create proxy before threshold is exceeded', () => {
      const { el } = setup({ proxyCapture: true, threshold: 10 });

      firePointerDown(el, 100, 100);
      // Move below threshold
      firePointerMove(el, 105, 100);

      const proxy = document.querySelector('[data-dnd-capture-proxy]');
      expect(proxy).toBeNull();
    });
  });
});
