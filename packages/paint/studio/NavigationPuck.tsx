import { createSignal } from 'solid-js';
import puckImage from './assets/navigation-puck.png';
import { panCamera, transformAt, type Camera, type Point, type ViewSize } from './camera';

/** Reference-shaped puck: outer pan ring, central zoom, lower rotation arc. Drag capture works beyond its bounds. */
export function NavigationPuck(props: {
  position: Point;
  camera: () => Camera;
  size: () => ViewSize;
  navigate: (camera: Camera) => void;
  close: () => void;
}) {
  const diameter = () => Math.max(1, Math.min(260, props.size().width - 16, props.size().height - 16));
  const center = () => ({
    x: Math.max(diameter() / 2 + 8, Math.min(props.size().width - diameter() / 2 - 8, props.position.x)),
    y: Math.max(diameter() / 2 + 8, Math.min(props.size().height - diameter() / 2 - 8, props.position.y))
  });
  let drag:
    | { id: number; mode: 'pan' | 'zoom' | 'rotate'; point: Point; camera: Camera; anchor: Point; angle: number }
    | undefined;
  const [active, setActive] = createSignal(false, { ownedWrite: true });
  const begin = (event: PointerEvent, mode: NonNullable<typeof drag>['mode']) => {
    if (event.button !== 0 || drag) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.focus({ preventScroll: true });
    target.setPointerCapture(event.pointerId);
    const rect = target.parentElement!.getBoundingClientRect();
    const point = { x: event.clientX, y: event.clientY };
    drag = {
      id: event.pointerId,
      mode,
      point,
      camera: props.camera(),
      anchor: center(),
      angle: Math.atan2(point.y - rect.top - rect.height / 2, point.x - rect.left - rect.width / 2)
    };
    setActive(true);
  };
  const move = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.point.x,
      dy = event.clientY - drag.point.y;
    if (drag.mode === 'pan') props.navigate(panCamera(drag.camera, props.size(), { x: dx, y: dy }));
    else {
      let angle = drag.camera.angle;
      if (drag.mode === 'rotate') {
        const rect = (event.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
        const current = Math.atan2(
          event.clientY - rect.top - rect.height / 2,
          event.clientX - rect.left - rect.width / 2
        );
        angle += Math.atan2(Math.sin(current - drag.angle), Math.cos(current - drag.angle));
        if (event.shiftKey) angle = (Math.round(angle / (Math.PI / 12)) * Math.PI) / 12;
      }
      props.navigate(
        transformAt(
          drag.camera,
          props.size(),
          drag.anchor,
          drag.camera.zoom * (drag.mode === 'zoom' ? Math.exp((dx - dy) * 0.008) : 1),
          angle
        )
      );
    }
  };
  const end = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    setActive(false);
  };
  const nudge = (event: KeyboardEvent, mode: 'pan' | 'zoom' | 'rotate') => {
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    const dx = event.key === 'ArrowLeft' ? -12 : event.key === 'ArrowRight' ? 12 : 0;
    const dy = event.key === 'ArrowUp' ? -12 : event.key === 'ArrowDown' ? 12 : 0;
    const camera = props.camera();
    if (mode === 'pan') props.navigate(panCamera(camera, props.size(), { x: dx, y: dy }));
    else
      props.navigate(
        transformAt(
          camera,
          props.size(),
          center(),
          camera.zoom * (mode === 'zoom' ? Math.exp((dx - dy) * 0.01) : 1),
          camera.angle + (mode === 'rotate' ? ((dx - dy) * Math.PI) / 432 : 0)
        )
      );
  };
  return (
    <div
      class="paint-puck"
      role="group"
      aria-label="Canvas navigation"
      data-active={active()}
      style={{ left: `${center().x}px`, top: `${center().y}px`, width: `${diameter()}px`, height: `${diameter()}px` }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <img src={puckImage} alt="" draggable={false} />
      <button
        class="paint-puck-pan"
        aria-label="Drag to pan"
        title="Move canvas · drag or arrow keys"
        onPointerDown={(e) => begin(e, 'pan')}
        onPointerMove={move}
        onPointerUp={(e) => {
          move(e);
          end(e);
        }}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={(e) => nudge(e, 'pan')}
      />
      <button
        class="paint-puck-zoom"
        aria-label="Drag to zoom"
        title="Zoom · drag up/down or arrow keys"
        onPointerDown={(e) => begin(e, 'zoom')}
        onPointerMove={move}
        onPointerUp={(e) => {
          move(e);
          end(e);
        }}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={(e) => nudge(e, 'zoom')}
      />
      <button
        class="paint-puck-rotate"
        aria-label="Drag to rotate"
        title="Rotate · drag around center · Shift: 15° steps"
        onPointerDown={(e) => begin(e, 'rotate')}
        onPointerMove={move}
        onPointerUp={(e) => {
          move(e);
          end(e);
        }}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={(e) => nudge(e, 'rotate')}
      />
      <button class="paint-puck-close" aria-label="Close navigation" title="Close · Escape" onClick={props.close} />
    </div>
  );
}
