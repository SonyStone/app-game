import { createEffect, untrack } from 'solid-js';
import type { TextDocument } from '../document/document';
import { useViewport } from '../viewport/Viewport';
import { documentBounds, fitCamera } from './camera';
import { useDocumentCamera } from './DocumentCamera';

/** Commands exposed to the parent while OverviewCamera is mounted. */
export type OverviewCameraRef = {
  /** Fits all pages within the padded viewport and resets rotation. */
  fitToDocument: () => void;
};

/** Fits document bounds on each request event. Reads document and padding only when requested. */
export function OverviewCamera(props: {
  /** Receives the command API on mount and undefined on unmount or ref replacement. */
  ref?: (ref?: OverviewCameraRef) => void;
  /** Pages to fit; read only when a fit is requested. */
  document: TextDocument;
  /** Reserved CSS pixels on each side. Defaults to zero. */
  padding?: Parameters<typeof fitCamera>[3];
}) {
  const { setCamera, pageAspect } = useDocumentCamera();
  const viewport = useViewport();

  createEffect(
    () => props.ref,
    (ref) => {
      ref?.({ fitToDocument });
      return () => ref?.(undefined);
    }
  );

  /** Replaces the camera once without starting continuous camera movement. */
  function fitToDocument() {
    setCamera(
      untrack(() => fitCamera(documentBounds(props.document.pages), viewport.size().css, pageAspect(), props.padding))
    );
  }

  return null;
}
