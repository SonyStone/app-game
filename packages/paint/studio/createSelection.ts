import { createSignal } from 'solid-js';
import type { Point } from './camera';
import type { PaintCommand, PaintEvent, SelectionAction } from './protocol';
import { pointInSelection, translateSelection } from './selection';

/** Owns transient lasso geometry and serializes pixel edits through the worker.
 * Dragging inside the polygon moves it; dragging outside replaces it. Pixels commit on release.
 */
export function createSelection(options: {
  send: (command: PaintCommand) => void;
  document: () => { activeId: string; revision: number };
  ready: () => boolean;
}) {
  const [points, setPoints] = createSignal<Point[]>([], { ownedWrite: true });
  const [busy, setBusy] = createSignal(false, { ownedWrite: true });
  const [drawing, setDrawing] = createSignal(false, { ownedWrite: true });
  const [hasClipboard, setHasClipboard] = createSignal(false, { ownedWrite: true });
  let polygon: Point[] = [];
  let pending = false;
  let gesture:
    | { kind: 'lasso'; previous: Point[] }
    | { kind: 'move'; start: Point; original: Point[]; offset: Point }
    | undefined;
  const publish = (next: Point[]) => {
    polygon = next;
    setPoints(next);
  };
  const action = (action: SelectionAction, offset?: Point) => {
    if (pending || gesture || !options.ready() || (action !== 'paste' && polygon.length < 3)) return;
    pending = true;
    setBusy(true);
    const state = options.document();
    options.send({
      type: 'selection',
      action,
      points: polygon,
      offset,
      layerId: state.activeId,
      revision: state.revision
    });
  };
  const cancel = () => {
    if (gesture) publish(gesture.kind === 'move' ? gesture.original : gesture.previous);
    gesture = undefined;
    setDrawing(false);
  };
  return {
    points,
    busy,
    drawing,
    hasClipboard,
    action,
    /** Synchronous guard, also valid inside an event before Solid publishes signal writes. */
    isBusy: () => pending,
    clear() {
      cancel();
      if (!pending) publish([]);
    },
    cancel,
    begin(point: Point) {
      if (pending) return;
      if (pointInSelection(point, polygon)) {
        gesture = { kind: 'move', start: point, original: polygon, offset: { x: 0, y: 0 } };
      } else {
        gesture = { kind: 'lasso', previous: polygon };
        publish([point]);
      }
      setDrawing(true);
    },
    move(point: Point) {
      if (!gesture) return;
      if (gesture.kind === 'move') {
        gesture.offset = { x: Math.round(point.x - gesture.start.x), y: Math.round(point.y - gesture.start.y) };
        publish(translateSelection(gesture.original, gesture.offset));
      } else {
        const last = polygon.at(-1)!;
        if (last.x === point.x && last.y === point.y) return;
        // Preserve a bounded path for long drags without truncating its endpoint.
        const sampled = polygon.length >= 4095 ? polygon.filter((_, index) => index % 2 === 0) : polygon;
        publish([...sampled, point]);
      }
    },
    end() {
      const finished = gesture;
      gesture = undefined;
      setDrawing(false);
      if (finished?.kind === 'move') {
        publish(finished.original);
        if (finished.offset.x || finished.offset.y) {
          action('move', finished.offset);
          if (pending) publish(translateSelection(finished.original, finished.offset));
        }
      } else if (polygon.length < 3) publish([]);
    },
    receive(event: Extract<PaintEvent, { type: 'selection' }>) {
      pending = false;
      publish(event.points);
      setHasClipboard(event.hasClipboard);
      setBusy(false);
    }
  };
}
