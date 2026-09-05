import type { createNavigationPuck, Point } from './controller';

/** Owns Space/V, Escape, right-drag selection and cancellation for either editor.
 * Capture-phase listeners consume navigation events before painting. Dispose when the canvas unmounts.
 */
export function attachNavigationPuck(
  canvas: HTMLCanvasElement,
  navigation: ReturnType<typeof createNavigationPuck>,
  options: {
    /** Prevent invocation during painting, editing or an existing touch gesture. */
    busy: () => boolean;
    ready?: () => boolean;
    onOpen?: () => void;
  }
) {
  const abort = new AbortController();
  const capture = { signal: abort.signal, capture: true };
  const win = canvas.ownerDocument.defaultView!;
  let lastPointer: Point | undefined;
  let held = false;
  let right: { id: number; origin: Point } | undefined;
  const point = (event: PointerEvent) => ({ x: event.clientX, y: event.clientY });
  const pointer = (event: PointerEvent) => ({ ...point(event), pointerId: event.pointerId, shiftKey: event.shiftKey });
  const consume = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const ready = () => !options.busy() && (options.ready?.() ?? true);
  const close = () => {
    right = undefined;
    navigation.close();
    canvas.focus({ preventScroll: true });
  };
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      lastPointer = point(event);
      if (event.button === 2) {
        consume(event);
        if (ready() && !right && !navigation.activeAction()) {
          options.onOpen?.();
          navigation.open(lastPointer);
          right = { id: event.pointerId, origin: lastPointer };
          canvas.setPointerCapture(event.pointerId);
        }
      } else if (navigation.center()) consume(event);
    },
    capture
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      lastPointer = point(event);
      if (right?.id !== event.pointerId) return;
      consume(event);
      if (navigation.activeAction()) navigation.move(pointer(event));
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
      consume(event);
      right = undefined;
      navigation.move(pointer(event));
      navigation.end(event.pointerId);
      if (!navigation.center()) canvas.focus({ preventScroll: true });
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

function editable(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
  );
}
