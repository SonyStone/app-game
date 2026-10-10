import type { Point } from '@app-game/paint-core/camera';
import { transformAt } from '@app-game/paint-core/camera';
import { untrack } from 'solid-js';
import type { PaintSession } from '../../features/session';
import { pressHandlers } from '../../shared/ui/pressHandlers';
import styles from './DesktopStudio.module.css';
import { clickZoom, dragView, type ViewMode } from './viewDrag';

/**
 * While a view tool is in use, a layer over the canvas takes the pen, mouse and fingers instead of painting: the
 * hand pans, the zoom tool zooms in on a click (out with Alt) and scrubs the zoom by dragging sideways, and the
 * rotate tool turns the view around its center (Shift snaps to 15°). The wheel zooms, as over the canvas.
 */
export function ViewToolLayer(props: { session: PaintSession; mode: ViewMode }) {
  const { camera, size } = untrack(() => props.session);
  let layer!: HTMLDivElement;
  let drag: { press: Point; last: Point; startAngle: number; swept: number } | undefined;
  const local = (point: Point) => {
    const bounds = layer.getBoundingClientRect();
    return { x: point.x - bounds.left, y: point.y - bounds.top };
  };
  // Created once: a spread re-runs when the element's other attributes change, which would forget the press.
  const press = pressHandlers({
    start(current) {
      const at = local(current.start);
      drag = { press: at, last: at, startAngle: camera.current().angle, swept: 0 };
    },
    move(current) {
      if (!drag || !current.moved) {
        return;
      }

      const to = local(current.point);
      const next = dragView(props.mode, camera.current(), size(), {
        press: drag.press,
        from: drag.last,
        to,
        startAngle: drag.startAngle,
        swept: drag.swept,
        shift: current.shift
      });
      drag = { ...drag, last: to, swept: next.swept };
      camera.navigate(next.camera);
    },
    end() {
      drag = undefined;
    },
    tap(current, event) {
      drag = undefined;
      if (props.mode === 'zoom') {
        camera.navigate(clickZoom(camera.current(), size(), local(current.point), event.altKey));
      }
    },
    cancel() {
      drag = undefined;
    }
  });

  return (
    <div
      ref={layer}
      class={styles.viewLayer}
      data-mode={props.mode}
      {...press}
      onWheel={(event) => {
        event.preventDefault();
        const current = camera.current();
        camera.navigate(
          transformAt(
            current,
            size(),
            local({ x: event.clientX, y: event.clientY }),
            current.zoom * Math.exp(-event.deltaY * 0.002)
          )
        );
      }}
    />
  );
}
