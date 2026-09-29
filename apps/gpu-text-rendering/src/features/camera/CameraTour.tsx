import { createEffect } from 'solid-js';
import type { TextDocument } from '../document/document';
import { useFrame } from '../scene/FrameLoop';
import { createCameraTour } from './createCameraTour';
import { useDocumentCamera } from './DocumentCamera';

/** Advances the optional camera tour before drawing. Enabling it again starts from the current camera. */
export function CameraTour(props: {
  /** Pages and glyph positions that tour targets are picked from; read on each frame. */
  document: TextDocument;
  /** Runs the tour continuously while true; each change restarts the next leg from the current camera. */
  enabled: boolean;
}) {
  const camera = useDocumentCamera();
  const tour = createCameraTour(camera);

  createEffect(
    () => props.enabled,
    () => tour.stop()
  );

  useFrame(
    ({ time }) => {
      tour.update(time * 1000, props.document);
    },
    { phase: 'update', enabled: () => props.enabled, continuous: true }
  );

  return null;
}
