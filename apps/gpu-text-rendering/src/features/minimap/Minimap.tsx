import { createMemo } from 'solid-js';
import { documentBounds, screenToWorld, type Point } from '../camera/camera';
import { useDocumentCamera } from '../camera/DocumentCamera';
import { ScreenSpace } from '../camera/SceneSpace';
import type { TextDocument } from '../document/document';
import { Rectangle, type RectanglePointerEvent } from '../graphics/Rectangle';
import { Rectangles } from '../graphics/Rectangles';
import { useFrameLoop } from '../scene/FrameLoop';
import { useViewport } from '../viewport/Viewport';

/**
 * Outlines every page in the canvas's top-right corner and marks the area the camera shows. Pressing or dragging
 * on it centers the camera there; those presses do not reach camera controls. Mount beneath DocumentCamera,
 * Viewport and FrameLoop, outside DocumentSpace.
 */
export function Minimap(props: {
  /** Laid-out pages to outline. */
  document: TextDocument;
  /** Called after each navigation moves the camera, before the frame is invalidated. */
  onNavigate?: () => void;
  /** Painter order of the backdrop; pages and the view marker draw just above it. Default 100. */
  order?: number;
}) {
  const camera = useDocumentCamera();
  const viewport = useViewport();
  const loop = useFrameLoop();
  const order = () => props.order ?? 100;

  const pageAspect = createMemo(() => props.document.pages[0]!.width / props.document.pages[0]!.height);
  const bounds = createMemo(() => documentBounds(props.document.pages));

  // Screen box preserving the document's physical aspect: world x units are pageAspect times wider than y units.
  const box = createMemo(() => {
    const { left, right, bottom, top } = bounds();
    const width = (right - left) * pageAspect();
    const height = top - bottom;
    const scale = Math.min(maxSize.width / width, maxSize.height / height);

    return {
      x: viewport.size().css.width - margin - width * scale,
      y: margin,
      width: width * scale,
      height: height * scale,
      scale
    };
  });

  const toMinimap = (point: Point): Point => ({
    x: box().x + (point.x - bounds().left) * pageAspect() * box().scale,
    y: box().y + (bounds().top - point.y) * box().scale
  });

  const fromMinimap = (point: Point): Point => ({
    x: bounds().left + (point.x - box().x) / (pageAspect() * box().scale),
    y: bounds().top - (point.y - box().y) / box().scale
  });

  const pages = createMemo(() => {
    const first = props.document.pages[0]!;

    return props.document.pages.map((page) => {
      const corner = toMinimap({ x: -page.x, y: 1 - page.y });
      return {
        x: corner.x,
        y: corner.y,
        width: (page.width / first.width) * pageAspect() * box().scale,
        height: (page.height / first.height) * box().scale
      };
    });
  });

  // The camera is not reactive: this runs while drawing, after whatever moved it requested the frame.
  const view = () => {
    const { width, height } = viewport.size().css;
    const corners = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: 0, y: height },
      { x: width, y: height }
    ].map((corner) => toMinimap(screenToWorld(camera, corner, width, height, pageAspect())));
    const { x, y, width: boxWidth, height: boxHeight } = box();
    const left = Math.max(x, Math.min(...corners.map((corner) => corner.x)));
    const right = Math.min(x + boxWidth, Math.max(...corners.map((corner) => corner.x)));
    const top = Math.max(y, Math.min(...corners.map((corner) => corner.y)));
    const bottom = Math.min(y + boxHeight, Math.max(...corners.map((corner) => corner.y)));

    return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };

  function navigate(event: RectanglePointerEvent) {
    const target = fromMinimap(event.point);
    camera.x = target.x;
    camera.y = target.y;
    props.onNavigate?.();
    loop.invalidate();
  }

  return (
    <ScreenSpace>
      <Rectangle
        x={box().x - padding}
        y={box().y - padding}
        width={box().width + padding * 2}
        height={box().height + padding * 2}
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
    </ScreenSpace>
  );
}

/** Largest minimap size in CSS pixels, excluding padding. */
const maxSize = { width: 180, height: 220 };
const margin = 16;
const padding = 6;
