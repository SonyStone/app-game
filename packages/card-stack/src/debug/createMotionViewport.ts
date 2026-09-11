import { createEventListener } from '@solid-primitives/event-listener';
import { createPointerListeners } from '@solid-primitives/pointer';
import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';

/**
 * View-only navigation in SVG pixels. Drag pans; wheel and pinch zoom around their
 * anchor. Keeps strokes independent of zoom. Captures pointers and releases them
 * on cancellation, target replacement or disposal. Scale is limited to 25–1600%.
 */
export function createMotionViewport(target: Accessor<HTMLElement | undefined>, size: Accessor<{ width: number; height: number }>) {
  let view = { x: 0, y: 0, zoom: 1 };
  const [camera, setCamera] = createSignal(view);
  const [dragging, setDragging] = createSignal(false);
  const pointers = new Map<number, { x: number; y: number; element: HTMLElement }>();

  createPointerListeners({
    target, passive: false,
    onDown(event) {
      const element = target();
      if (!element || (event.button !== 0 && event.button !== 1) || pointers.size >= 2) return;
      event.preventDefault();
      element.focus({ preventScroll: true });
      element.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { ...position(event), element });
      setDragging(true);
    },
    onMove(event) {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;
      event.preventDefault();
      const before = gesture();
      pointers.set(event.pointerId, { ...position(event), element: pointer.element });
      const after = gesture();
      transform(before.center, after.center, before.distance > 0 ? after.distance / before.distance : 1);
    },
    onUp: release,
    onCancel: release,
    onLostCapture(event) {
      // Touch may transfer implicit capture from an SVG child to the viewport.
      if (event.target === pointers.get(event.pointerId)?.element) release(event);
    }
  });
  createEventListener(target, 'wheel', (event) => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size().height : 1;
    zoom(Math.exp(-Math.max(-500, Math.min(500, event.deltaY * unit)) * .002), position(event));
  }, { passive: false });
  createEventListener(target, 'dblclick', reset);
  createEventListener(target, 'keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    switch (event.key) {
      case '+': case '=': zoom(1.25); break;
      case '-': zoom(.8); break;
      case '0': reset(); break;
      case 'ArrowLeft': pan(40, 0); break;
      case 'ArrowRight': pan(-40, 0); break;
      case 'ArrowUp': pan(0, 40); break;
      case 'ArrowDown': pan(0, -40); break;
      default: return;
    }
    event.preventDefault();
  });
  createEventListener(() => target()?.ownerDocument.defaultView ?? undefined, 'blur', cancel);
  createEffect(target, () => { cancel(); return cancel; });
  onCleanup(cancel);

  return { camera, dragging, zoom, reset };

  /** Zooms around a point relative to the viewport center; omitted anchor means center. */
  function zoom(factor: number, anchor = { x: 0, y: 0 }) {
    transform(anchor, anchor, factor);
  }

  /** Restores the fitted projection and ends any active canvas gesture. */
  function reset() {
    cancel();
    view = { x: 0, y: 0, zoom: 1 };
    setCamera(view);
  }

  function pan(x: number, y: number) {
    view = { ...view, x: view.x + x, y: view.y + y };
    setCamera(view);
  }

  function transform(before: { x: number; y: number }, after: typeof before, factor: number) {
    const zoom = Math.max(.25, Math.min(16, view.zoom * factor));
    const ratio = zoom / view.zoom;
    view = { x: after.x - (before.x - view.x) * ratio, y: after.y - (before.y - view.y) * ratio, zoom };
    setCamera(view);
  }

  function position(event: MouseEvent) {
    const bounds = target()!.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / Math.max(1, bounds.width) * size().width - size().width / 2,
      y: (event.clientY - bounds.top) / Math.max(1, bounds.height) * size().height - size().height / 2
    };
  }

  function gesture() {
    const [a, b] = [...pointers.values()];
    return b
      ? { center: { x: (a!.x + b.x) / 2, y: (a!.y + b.y) / 2 }, distance: Math.hypot(b.x - a!.x, b.y - a!.y) }
      : { center: a!, distance: 0 };
  }

  function release(event: PointerEvent) {
    const pointer = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (pointer?.element.hasPointerCapture(event.pointerId)) pointer.element.releasePointerCapture(event.pointerId);
    setDragging(pointers.size > 0);
  }

  function cancel() {
    const active = [...pointers.entries()];
    pointers.clear();
    for (const [id, pointer] of active) {
      if (pointer.element.hasPointerCapture(id)) pointer.element.releasePointerCapture(id);
    }
    setDragging(false);
  }
}
