import { createEventListener } from '@solid-primitives/event-listener';
import { access, isClient, type MaybeAccessor } from '@solid-primitives/utils';
import { type Accessor, createSignal, onCleanup } from 'solid-js';
import { type Vec2, of as vec2, Zero as Vec2Zero } from '../core/vec2';
import { createCapture } from './createCapture';

// ============================================================================
// MARK: Types
// ============================================================================

export type DragSensorOptions = Parameters<typeof createDragSensor>[0];
export type DragSensor = ReturnType<typeof createDragSensor>;

export type DragStartEvent = {
  /** Pointer position when the threshold was exceeded. */
  position: Vec2;
  /** Pointer position at the initial pointerdown. */
  origin: Vec2;
  /** The original PointerEvent that started the drag. */
  pointerEvent: PointerEvent;

  target: DragStartEvent['pointerEvent']['target'];
};

export type DragMoveEvent = {
  /** Current pointer position. */
  position: Vec2;
  /** Delta from the initial pointerdown position (origin). */
  delta: Vec2;
};

export type DragEndEvent = {
  /** Final pointer position. */
  position: Vec2;
  /** Total delta from the initial pointerdown position (origin). */
  delta: Vec2;
};

// ============================================================================
// MARK: createDragSensor
// ============================================================================

/**
 * A low-level primitive that detects drag gestures from pointer events.
 *
 * ## How it works
 *
 * 1. Bind `onPointerDown` to a DOM element (the drag handle).
 * 2. On pointerdown, the sensor captures the pointer (`setPointerCapture`)
 *    and begins tracking movement.
 * 3. Once the pointer moves past `threshold` pixels, `onDragStart` fires
 *    and `isDragging()` becomes `true`.
 * 4. Subsequent pointer moves fire `onDragMove` with position + delta.
 * 5. On pointerup, `onDragEnd` fires. On Escape or pointercancel, `onDragCancel` fires.
 *
 * ## Why setPointerCapture?
 *
 * - All subsequent pointer events are delivered to the capturing element,
 *   even if the pointer moves outside it (or over iframes).
 * - No document-level listeners needed — cleaner and more reliable.
 * - Automatically released on pointerup/pointercancel.
 *
 * @example
 * ```tsx
 * const sensor = createDragSensor({
 *   onDragStart: (e) => console.log('Started at', e.position),
 *   onDragMove: (e) => console.log('Delta', e.delta),
 *   onDragEnd: (e) => console.log('Ended at', e.position),
 * });
 *
 * return <div onPointerDown={sensor.onPointerDown}>Drag me</div>;
 * ```
 */
export function createDragSensor(
  options: {
    /**
     * Pixels the pointer must travel (Euclidean) before a drag is detected.
     * This prevents accidental drags on click.
     * @default 8
     */
    threshold?: MaybeAccessor<number>;
    /**
     * Use a hidden proxy element for pointer capture instead of the source element.
     *
     * When enabled, pointer capture is transferred from the source element to an
     * invisible proxy `<div>` when the drag threshold is exceeded. This allows the
     * source element to be safely removed from the DOM during drag (e.g., when using
     * `createDisplayList` which removes dragged items from the display list).
     *
     * Without this, removing the source element from the DOM causes the browser to
     * fire `lostpointercapture`, which cancels the drag.
     *
     * @default false
     */
    proxyCapture?: boolean;
    /** Called when drag starts (threshold exceeded). */
    onDragStart?: (event: DragStartEvent) => void;
    /** Called on every pointer move during an active drag. */
    onDragMove?: (event: DragMoveEvent) => void;
    /** Called when the pointer is released during an active drag. */
    onDragEnd?: (event: DragEndEvent) => void;
    /** Called when the drag is cancelled (pointer cancel or Escape key). */
    onDragCancel?: () => void;
    /**
     * Called when the pointer is released **without** exceeding the drag threshold.
     * This is a "click" — the user pressed and released without dragging.
     * Receives the original PointerEvent so modifiers (Ctrl, Shift) are available.
     */
    onClick?: (ev: PointerEvent) => void;
  } = {}
): {
  /** Whether a drag is currently in progress (threshold exceeded). */
  isDragging: Accessor<boolean>;
  /** Current pointer position during drag, or null when idle. */
  position: Accessor<Vec2 | null>;
  /** Delta from the initial pointerdown position (origin), or null when idle. */
  delta: Accessor<Vec2 | null>;
  /** Pointer type of the current/last drag ('mouse' | 'touch' | 'pen'). */
  pointerType: Accessor<'mouse' | 'touch' | 'pen'>;
  /** Bind this to `onPointerDown` on the drag handle element. */
  onPointerDown: (ev: PointerEvent) => void;
  /** Programmatically cancel the current drag. */
  cancel: VoidFunction;
} {
  const threshold = () => access(options.threshold) ?? 8;

  // Reactive state
  const [isDragging, setIsDragging] = createSignal(false);
  const [position, setPosition] = createSignal<Vec2 | null>(null);
  const [delta, setDelta] = createSignal<Vec2 | null>(null);
  const [pointerType, setPointerType] = createSignal<'mouse' | 'touch' | 'pen'>('mouse');

  // Internal mutable state (not reactive — perf-critical)
  let tracking = false; // pointerdown received, waiting for threshold
  let dragging = false; // threshold exceeded, actively dragging
  let origin: Vec2 = Vec2Zero; // position at pointerdown

  let startPointerEvent: PointerEvent | null = null;
  let target: Element | null = null;

  const capture = createCapture({
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostCapture
  });

  // Reactive tracking of active state (for scoped Escape listener)
  const [isActive, setIsActive] = createSignal(false);

  createEscapeKeyHandler({ cancel, isActive });

  onCleanup(resetState);

  function onPointerDown(ev: PointerEvent): void {
    if (!isPrimaryPointer(ev)) {
      return;
    }
    // Don't start a new drag if one is already active
    if (tracking || dragging) {
      return;
    }

    target = ev.currentTarget as HTMLElement;
    if (!target) {
      return;
    }

    capture.set(target, ev.pointerId);

    // Record the starting position
    origin = vec2(ev.clientX, ev.clientY);
    tracking = true;
    startPointerEvent = ev;
    setPointerType(ev.pointerType as 'mouse' | 'touch' | 'pen');
    setIsActive(true);
  }

  function onPointerMove(ev: PointerEvent): void {
    if (!ev.isPrimary) {
      return;
    }

    const pos = vec2(ev.clientX, ev.clientY);

    if (tracking && !dragging) {
      // Still in threshold detection phase
      const dx = pos.x - origin.x;
      const dy = pos.y - origin.y;
      const distSq = dx * dx + dy * dy;
      const threshSq = threshold() * threshold();

      if (distSq < threshSq) {
        return;
      }

      // Threshold exceeded — transition to dragging
      tracking = false;
      dragging = true;

      // Prevent browser defaults now that we know the user is dragging.
      // This avoids blocking focus changes and form interactions on clicks.
      ev.preventDefault();

      // Transfer pointer capture to an invisible proxy element so the
      // source element can be safely removed from the DOM during drag.
      if (options.proxyCapture) {
        capture.transferToProxy();
      }

      const d = vec2(pos.x - origin.x, pos.y - origin.y);
      setIsDragging(true);
      setPosition(pos);
      setDelta(d);

      options.onDragStart?.({
        position: pos,
        origin,
        pointerEvent: startPointerEvent!,
        target: startPointerEvent!.target as HTMLElement
      });
      return;
    }

    if (dragging) {
      const d = vec2(pos.x - origin.x, pos.y - origin.y);
      setPosition(pos);
      setDelta(d);

      options.onDragMove?.({
        position: pos,
        delta: d
      });
    }
  }

  function onPointerUp(ev: PointerEvent): void {
    if (!ev.isPrimary) return;

    if (dragging) {
      const pos = vec2(ev.clientX, ev.clientY);
      const d = vec2(pos.x - origin.x, pos.y - origin.y);

      options.onDragEnd?.({
        position: pos,
        delta: d
      });
    } else if (tracking) {
      // Threshold was never exceeded — this was a click, not a drag.
      options.onClick?.(ev);
    }

    // Whether we were tracking (click) or dragging (drag), clean up
    resetState();
  }

  function onPointerCancel(_: PointerEvent): void {
    if (dragging) {
      options.onDragCancel?.();
    }
    resetState();
  }

  function onLostCapture(_: PointerEvent): void {
    // If we lose capture unexpectedly (e.g., another element steals it),
    // treat it as a cancel.
    if (tracking || dragging) {
      if (dragging) {
        options.onDragCancel?.();
      }
      resetState();
    }
  }

  function cancel(): void {
    if (dragging) {
      options.onDragCancel?.();
    }
    resetState();
  }

  function resetState(): void {
    tracking = false;
    dragging = false;
    origin = Vec2Zero;
    capture.release();
    startPointerEvent = null;
    setIsDragging(false);
    setPosition(null);
    setDelta(null);
    setIsActive(false);
  }

  return {
    isDragging,
    position,
    delta,
    pointerType,
    onPointerDown,
    cancel
  };
}

/** Only true if primary pointer (left mouse / first finger) */
function isPrimaryPointer(event: Pick<PointerEvent, 'isPrimary' | 'button'>): boolean {
  return event.isPrimary && event.button === 0;
}

// Only registered when tracking or dragging to avoid firing on every
// keydown when multiple sensors exist.
function createEscapeKeyHandler(props: { cancel(): void; isActive: Accessor<boolean> }) {
  if (isClient) {
    createEventListener(document, 'keydown', (ev) => {
      if (props.isActive() && ev.key === 'Escape') {
        props.cancel();
      }
    });
  }
}
