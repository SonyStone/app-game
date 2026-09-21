import { createEffect } from 'solid-js';
import type { TextDocument } from '../document/document';
import { useFrame } from '../scene/FrameLoop';
import { createCameraTour } from './createCameraTour';
import { useDocumentCamera } from './DocumentCamera';

/** Advances the optional camera tour before drawing. Enabling it again starts from the current camera. */
export function CameraTour(props: { document: TextDocument; enabled: boolean }) {
  const camera = useDocumentCamera();
  const tour = createCameraTour(camera);

  createEffect(
    () => [props.enabled, props.document],
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
