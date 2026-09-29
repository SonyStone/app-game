import { createMemo } from 'solid-js';
import { documentBounds, pageRects, screenToWorld } from '../camera/camera';
import type { DocumentCamera } from '../camera/createDocumentCamera';
import type { TextDocument } from '../document/document';
import { Rectangle, type RectanglePointerEvent } from '../graphics/Rectangle';
import { Rectangles } from '../graphics/Rectangles';
import { AffineSpace } from '../scene/SceneSpace';
import { useViewport } from '../viewport/createViewport';

/**
 * Outlines every page in the canvas's top-right corner and marks the area the camera shows. Pressing or dragging
 * on it centers the camera there; those presses do not reach camera controls. Mount beneath FrameLoop, outside
 * DocumentSpace.
 */
export function Minimap(props: {
  /** Laid-out pages to outline. */
  document: TextDocument;
  /** Camera whose view is marked and which navigation moves; fixed for the component's lifetime. */
  camera: DocumentCamera;
  /** Called after each navigation moves the camera. */
  onNavigate?: () => void;
  /** Painter order of the backdrop; pages and the view marker draw just above it. Default 100. */
  order?: number;
}) {
  const { camera, setCamera, pageAspect } = props.camera;
  const viewport = useViewport();
  const order = () => props.order ?? 100;

  const pages = createMemo(() => pageRects(props.document.pages));
  const bounds = createMemo(() => documentBounds(props.document.pages));

  // Places document units in the corner. World x units are pageAspect times wider than y units; y points up.
  const layout = createMemo(() => {
    const { left, right, bottom, top } = bounds();
    const unitX = pageAspect();
    const scale = Math.min(maxSize.width / ((right - left) * unitX), maxSize.height / (top - bottom));
    const x = viewport.size().css.width - margin - (right - left) * unitX * scale;
    const padX = padding / (unitX * scale);
    const padY = padding / scale;

    return {
      transform: {
        origin: { x: x - left * unitX * scale, y: margin + top * scale },
        axisX: { x: unitX * scale, y: 0 },
        axisY: { x: 0, y: -scale }
      },
      backdrop: { x: left - padX, y: bottom - padY, width: right - left + 2 * padX, height: top - bottom + 2 * padY }
    };
  });

  // The area the camera shows, clipped to the pages' bounds.
  const view = createMemo(() => {
    const { width, height } = viewport.size().css;
    const corners = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: 0, y: height },
      { x: width, y: height }
    ].map((corner) => screenToWorld(camera(), corner, width, height, pageAspect()));
    const { left, right, bottom, top } = bounds();
    const x = Math.max(left, Math.min(...corners.map((corner) => corner.x)));
    const y = Math.max(bottom, Math.min(...corners.map((corner) => corner.y)));

    return {
      x,
      y,
      width: Math.max(0, Math.min(right, Math.max(...corners.map((corner) => corner.x))) - x),
      height: Math.max(0, Math.min(top, Math.max(...corners.map((corner) => corner.y))) - y)
    };
  });

  function navigate(event: RectanglePointerEvent) {
    setCamera((current) => ({ ...current, x: event.point.x, y: event.point.y }));
    props.onNavigate?.();
  }

  return (
    <AffineSpace transform={layout().transform}>
      <Rectangle
        x={layout().backdrop.x}
        y={layout().backdrop.y}
        width={layout().backdrop.width}
        height={layout().backdrop.height}
        color={[0.08, 0.1, 0.12, 0.72]}
        order={order()}
        onPointerDown={navigate}
        onPointerMove={navigate}
      />
      <Rectangles items={pages()} color={[0.94, 0.95, 0.96, 0.9]} order={order() + 1} />
      <Rectangle
        x={view().x}
        y={view().y}
        width={view().width}
        height={view().height}
        color={[1, 0.55, 0.1, 0.4]}
        order={order() + 2}
      />
    </AffineSpace>
  );
}

/** Largest minimap size in CSS pixels, excluding padding. */
const maxSize = { width: 180, height: 220 };
/** Distance from the canvas's top and right edges in CSS pixels. */
const margin = 16;
/** Backdrop padding around the pages in CSS pixels. */
const padding = 6;
