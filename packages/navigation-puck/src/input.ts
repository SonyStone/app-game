import type { createNavigationPuck, Point } from './controller';

/** Owns Space/V, Escape, right-drag selection and cancellation for either editor.
 * Capture-phase listeners consume navigation events before painting. Dispose when the canvas unmounts.
 * With `pick`, right-drags choose from controls around the puck instead of starting navigation.
 *
 * A pen's side button pressed while it hovers over the canvas opens the puck there, pinned: it stays open through
 * operations until the side button is pressed again, a press lands outside it, or Escape. Android Chrome reports side
 * buttons only as a change of `buttons` on `pointermove`, without `pointerdown` (Wacom pens: 1, 2 and 4 for the three
 * buttons), so a hovering pen whose `buttons` become nonzero counts as one press.
 */
export function attachNavigationPuck(
  canvas: HTMLCanvasElement,
  navigation: ReturnType<typeof createNavigationPuck>,
  options: {
    /** Prevent invocation during painting, editing or an existing touch gesture. */
    busy: () => boolean;
    ready?: () => boolean;
    onOpen?: () => void;
    /** Takes over right-drags, for a menu around the puck; see `PuckPicker`. */
    pick?: PuckPicker;
  }
) {
  const abort = new AbortController();
  const capture = { signal: abort.signal, capture: true };
  const win = canvas.ownerDocument.defaultView!;
  let lastPointer: Point | undefined;
  let held = false;
  let right: { id: number; origin: Point } | undefined;
  /** Pens touching anything, the canvas or the puck's controls, whose `buttons` are their contact, not a side button. */
  const contacts = new Set<number>();
  /** Hovering pens holding a side button, so that one press toggles the puck once. */
  const sideButtons = new Set<number>();
  const point = (event: PointerEvent) => ({ x: event.clientX, y: event.clientY });
  const pointer = (event: PointerEvent) => ({ ...point(event), pointerId: event.pointerId, shiftKey: event.shiftKey });
  const consume = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const ready = () => !options.busy() && (options.ready?.() ?? true);
  const close = () => {
    if (right) options.pick?.cancel();
    right = undefined;
    navigation.close();
    canvas.focus({ preventScroll: true });
  };
  /** Opens the puck at the pointer for a right-drag, unless something else is going on. */
  const openRight = (event: PointerEvent) => {
    consume(event);
    if (!ready() || right || navigation.activeAction()) return;
    options.onOpen?.();
    navigation.open(lastPointer);
    right = { id: event.pointerId, origin: lastPointer! };
    canvas.setPointerCapture(event.pointerId);
  };
  /** Ends the right-drag at the pointer: a picker chooses, navigation finishes its action. */
  const releaseRight = (event: PointerEvent) => {
    consume(event);
    right = undefined;
    if (options.pick) {
      // A choice closes the puck; releasing without one leaves it open for direct presses.
      if (options.pick.release(point(event))) close();
      return;
    }

    navigation.move(pointer(event));
    navigation.end(event.pointerId);
    if (!navigation.center()) canvas.focus({ preventScroll: true });
  };
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      lastPointer = point(event);
      if (event.button === 2) openRight(event);
      else if (navigation.center()) consume(event);
    },
    capture
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      lastPointer = point(event);
      if (right?.id !== event.pointerId) return;
      consume(event);
      if (options.pick) options.pick.move(lastPointer, right.origin);
      else if (navigation.activeAction()) navigation.move(pointer(event));
      else {
        const action = navigation.actionAt(lastPointer, right.origin);
        if (action) navigation.begin(action, pointer(event));
      }
    },
    capture
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      if (right?.id !== event.pointerId) return;
      releaseRight(event);
    },
    capture
  );
  const cancel = (event: PointerEvent) => {
    if (right?.id !== event.pointerId) return;
    consume(event);
    close();
  };
  canvas.addEventListener('pointercancel', cancel, capture);
  canvas.addEventListener('lostpointercapture', cancel, capture);
  // Pen contacts anywhere, so that a press on the puck's own controls is not taken for a side button.
  win.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'pen' && event.button !== 2) contacts.add(event.pointerId);
    },
    capture
  );
  const lift = (event: PointerEvent) => contacts.delete(event.pointerId);
  win.addEventListener('pointerup', lift, capture);
  win.addEventListener('pointercancel', lift, capture);
  // Side buttons of a hovering pen, seen on the window: an open puck covers the canvas with its dismiss layer. A
  // hovering pen has no pressure; a touching one does, even before its `pointerdown` arrives.
  win.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'pen' || contacts.has(event.pointerId) || event.pressure > 0) return;
      if (event.buttons === 0) {
        sideButtons.delete(event.pointerId);
        return;
      }

      if (sideButtons.has(event.pointerId)) return;
      sideButtons.add(event.pointerId);
      if (navigation.pinned()) {
        consume(event);
        close();
        return;
      }

      if (event.target !== canvas || !ready() || right || navigation.activeAction()) return;
      consume(event);
      lastPointer = point(event);
      options.onOpen?.();
      navigation.open(lastPointer, 'pinned');
    },
    capture
  );
  canvas.addEventListener('contextmenu', (event) => event.preventDefault(), capture);
  win.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && navigation.center()) {
        consume(event);
        held = false;
        close();
        return;
      }
      if (
        editable(event.target) ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !ready() ||
        navigation.activeAction()
      )
        return;
      if (event.code !== 'Space' && event.key.toLowerCase() !== 'v') return;
      if (!navigation.center() && event.target instanceof Element && event.target.closest('button, a, [role="button"]'))
        return;
      consume(event);
      held = event.code === 'Space';
      options.onOpen?.();
      navigation.open(lastPointer, held ? 'held' : 'once');
    },
    capture
  );
  win.addEventListener(
    'keyup',
    (event) => {
      if (event.code !== 'Space' || !held) return;
      consume(event);
      held = false;
      navigation.releaseHotkey();
      if (!navigation.activeAction()) canvas.focus({ preventScroll: true });
    },
    capture
  );
  const reset = () => {
    held = false;
    if (right) options.pick?.cancel();
    right = undefined;
    navigation.close();
  };
  // Captured element blur also reaches window when a Puck button takes focus.
  win.addEventListener('blur', (event) => {
    if (event.target === event.currentTarget) reset();
  }, capture);
  win.addEventListener('resize', reset, capture);
  return () => {
    abort.abort();
    navigation.close();
  };
}

/**
 * Chooses from controls around the puck by right-dragging, as in a marking menu: the right button (a pen's barrel
 * button) opens the puck where it is pressed, the drag points at a control and the release chooses it.
 */
export type PuckPicker = {
  /** The right-dragging pointer moved to `point`, in client CSS pixels; `origin` is where it was pressed. */
  move(point: Point, origin: Point): void;
  /** The right button was released at `point`. Returns whether that chose a control, which closes the puck. */
  release(point: Point): boolean;
  /** The right-drag ended without a choice, because the puck closed or the pointer was cancelled. */
  cancel(): void;
};

function editable(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
  );
}
