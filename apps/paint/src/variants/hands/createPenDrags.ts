import { panCamera, screenToWorld, transformAt, type Camera } from '@app-game/paint-core/camera';
import { makeEventListener } from '@solid-primitives/event-listener';
import { createSignal } from 'solid-js';
import type { PaintSession } from '../../features/session';
import type { PenMode } from './createPenModes';
import { linePoints, type Point } from './geometry';

/**
 * Pen modes the canvas input does not have, carried out on the drawing: `pan` moves the view with the pen, `zoom`
 * zooms around the press as the pen moves up (in) or down (out), and `line` previews a straight line from the press
 * and paints it with the current brush when the pen lifts, following the pen's pressure along the way; Shift snaps
 * it to 15° steps. Presses of a pen or the mouse's main button on the canvas are taken in the window's capture phase
 * and never reach the canvas, so they neither draw nor open anything. Must be created within a Solid owner, before
 * the canvas mounts.
 */
export function createPenDrags(session: PaintSession, mode: () => PenMode) {
  const { camera, size } = session;
  /** The line being drawn, in canvas CSS pixels, while the pen is down. */
  const [line, setLine] = createSignal<{ from: Point; to: Point }>();
  let drag:
    | {
        id: number;
        kind: 'pan' | 'zoom' | 'line';
        start: Point;
        last: Point;
        camera: Camera;
        pressures: number[];
        time: number;
        pointerType: string;
      }
    | undefined;
  const capture = { capture: true };
  const consume = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const local = (event: PointerEvent): Point => {
    const bounds = session.canvas()!.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  makeEventListener(
    window,
    'pointerdown',
    (event) => {
      const kind = mode();
      const canvas = session.canvas();
      if (
        drag ||
        event.pointerType === 'touch' ||
        event.button !== 0 ||
        !canvas ||
        event.target !== canvas ||
        (kind !== 'pan' && kind !== 'zoom' && kind !== 'line')
      ) {
        return;
      }

      consume(event);
      if (!ready()) {
        return;
      }

      const point = local(event);
      canvas.setPointerCapture(event.pointerId);
      drag = {
        id: event.pointerId,
        kind,
        start: point,
        last: point,
        camera: camera.current(),
        pressures: [pressureOf(event)],
        time: event.timeStamp,
        pointerType: event.pointerType
      };
      session.setCursor(undefined);
      if (kind === 'line') {
        setLine({ from: point, to: point });
      }
    },
    capture
  );
  makeEventListener(
    window,
    'pointermove',
    (event) => {
      if (drag?.id !== event.pointerId) {
        return;
      }

      consume(event);
      const point = local(event);
      if (drag.kind === 'pan') {
        camera.navigate(
          panCamera(camera.current(), size(), { x: point.x - drag.last.x, y: point.y - drag.last.y })
        );
      } else if (drag.kind === 'zoom') {
        const zoom = drag.camera.zoom * 2 ** ((drag.start.y - point.y) / 160);
        camera.navigate(transformAt(drag.camera, size(), drag.start, zoom));
      } else {
        drag.pressures.push(pressureOf(event));
        setLine({ from: drag.start, to: snapped(drag.start, point, event.shiftKey) });
      }

      drag.last = point;
    },
    capture
  );
  makeEventListener(
    window,
    'pointerup',
    (event) => {
      if (drag?.id !== event.pointerId) {
        return;
      }

      consume(event);
      const ended = drag;
      drag = undefined;
      setLine(undefined);
      if (ended.kind === 'line') {
        paintLine(ended, snapped(ended.start, local(event), event.shiftKey));
      }
    },
    capture
  );
  makeEventListener(
    window,
    'pointercancel',
    (event) => {
      if (drag?.id === event.pointerId) {
        drag = undefined;
        setLine(undefined);
      }
    },
    capture
  );

  return {
    /** The straight line being drawn, in canvas CSS pixels, while the pen is down in the line mode. */
    line
  };

  /** Strokes may start: the engine is ready and no selection edit or preset upload is running. */
  function ready() {
    return session.engine.canEdit() && !session.selection.isBusy() && !session.uploads.isBusy();
  }

  /** Paints the line from the press to `end` as one stroke, with the pressures the pen went through. */
  function paintLine(ended: NonNullable<typeof drag>, end: Point) {
    const points = linePoints(ended.start, end, 2);
    if (points.length < 2 || !ready()) {
      return;
    }

    const view = size();
    const samples = points.map((point, index) => {
      const at = Math.min(
        ended.pressures.length - 1,
        Math.floor((index / (points.length - 1)) * (ended.pressures.length - 1))
      );
      return {
        ...screenToWorld(point, ended.camera, view),
        pressure: ended.pressures[at]!,
        pointerType: ended.pointerType,
        time: ended.time + index * 4
      };
    });
    session.edit({
      type: 'begin',
      brush: session.tools.brush(),
      modifiers: { altKey: false },
      zoom: ended.camera.zoom,
      samples: samples.slice(0, 1)
    });
    session.edit({ type: 'samples', samples: samples.slice(1) });
    session.edit({ type: 'end' });
  }
}

/** The pen's pressure; a mouse presses fully, as for strokes. */
function pressureOf(event: PointerEvent) {
  return event.pointerType === 'pen' ? Math.max(0.05, event.pressure) : 1;
}

/** `point`, or with `snap` the point at the same distance from `start` in the nearest 15° direction. */
function snapped(start: Point, point: Point, snap: boolean): Point {
  if (!snap) {
    return point;
  }

  const step = Math.PI / 12;
  const angle = Math.round(Math.atan2(point.y - start.y, point.x - start.x) / step) * step;
  const length = Math.hypot(point.x - start.x, point.y - start.y);
  return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
}
