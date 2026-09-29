import { createEffect, untrack } from 'solid-js';
import type { TextDocument } from '../document/document';
import { useFrameLoop } from '../scene/FrameLoop';
import { useViewport } from '../viewport/Viewport';
import { useDocumentCamera } from './DocumentCamera';

export type OverviewCameraRef = { fitToDocument: () => void };

/** Fits document bounds on each request event. Reads document and padding only when requested. */
export function OverviewCamera(props: {
  ref?: (ref?: OverviewCameraRef) => void;
  document: TextDocument;
  /** Reserved CSS pixels on each side. Defaults to zero. */
  padding?: { top: number; right: number; bottom: number; left: number };
}) {
  const camera = useDocumentCamera();
  const viewport = useViewport();
  const loop = useFrameLoop();

  createEffect(
    () => props.ref,
    (ref) => {
      ref?.({ fitToDocument });
      return () => ref?.(undefined);
    }
  );

  /** Fits the current pages and schedules one frame without starting continuous camera movement. */
  function fitToDocument() {
    const document = untrack(() => props.document);
    const first = document.pages[0]!;
    let left = Infinity;
    let right = -Infinity;
    let bottom = Infinity;
    let top = -Infinity;

    for (const page of document.pages) {
      left = Math.min(left, -page.x);
      right = Math.max(right, -page.x + page.width / first.width);
      bottom = Math.min(bottom, 1 - page.y - page.height / first.height);
      top = Math.max(top, 1 - page.y);
    }
    const { width, height } = untrack(viewport.size).css;
    const aspect = first.width / first.height;
    const padding = untrack(() => props.padding) ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const availableHeight = Math.max(1, height - padding.top - padding.bottom);
    camera.zoom =
      Math.max(
        ((right - left) * height) / Math.max(1, width - padding.left - padding.right),
        ((top - bottom) * height) / (aspect * availableHeight)
      ) / 2;
    camera.x = (left + right) / 2 + ((padding.right - padding.left) * camera.zoom) / Math.max(1, height);
    camera.y = (bottom + top) / 2 - ((padding.bottom - padding.top) * camera.zoom * aspect) / Math.max(1, height);
    camera.rotation = 0;
    loop.invalidate();
  }

  return null;
}
