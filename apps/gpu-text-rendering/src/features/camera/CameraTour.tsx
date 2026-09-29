import { createEffect } from 'solid-js';
import type { TextDocument } from '../document/document';
import { useFrame } from '../scene/FrameLoop';
import type { DocumentCamera } from './createDocumentCamera';
import { makeCameraTour } from './makeCameraTour';

/**
 * Advances the optional camera tour before drawing. Enabling it again starts from the current camera.
 * Mount beneath FrameLoop.
 */
export function CameraTour(props: {
  /** Camera the tour moves; fixed for the component's lifetime. */
  camera: DocumentCamera;
  /** Pages and glyph positions that tour targets are picked from; read on each frame. */
  document: TextDocument;
  /** Runs the tour continuously while true; each change restarts the next leg from the current camera. */
  enabled: boolean;
}) {
  const { setCamera } = props.camera;
  const tour = makeCameraTour();

  createEffect(
    () => props.enabled,
    () => tour.stop()
  );

  useFrame(
    ({ time }) => {
      setCamera((camera) => tour.update(time * 1000, props.document, camera));
    },
    { phase: 'update', enabled: () => props.enabled, continuous: true }
  );

  return null;
}
