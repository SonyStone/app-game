import type { JSX } from '@solidjs/web';
import { createContext, createSignal, useContext, type Accessor, type Setter } from 'solid-js';
import { TokenContext } from '../../shared/jsx/TokenContext';
import type { Camera } from './camera';

/**
 * Owns a camera and the document's page aspect for this subtree. The camera is a signal: frame callbacks and draws
 * that read it redraw when it changes, so writers need no explicit invalidate. Writes from update-phase frame
 * callbacks are visible to the same frame's render.
 */
export function DocumentCamera(props: {
  /** First page width divided by height; DocumentSpace units are first-page widths and heights. */
  pageAspect: number;
  children: JSX.Element;
}) {
  const [camera, setCamera] = createSignal<Camera>({ x: 0.5, y: 0.5, zoom: 2, rotation: 0 });

  return (
    <TokenContext context={CameraContext} value={{ camera, setCamera, pageAspect: () => props.pageAspect }}>
      {props.children}
    </TokenContext>
  );
}

/** Reads the camera, its setter and the page aspect beneath DocumentCamera. */
export function useDocumentCamera() {
  return useContext(CameraContext);
}

const CameraContext = createContext<{
  /** Current camera; replaced, never mutated. */
  camera: Accessor<Camera>;
  /** Replaces the camera. Use the updater form when deriving from the current camera within one event. */
  setCamera: Setter<Camera>;
  /** First page width divided by height. */
  pageAspect: Accessor<number>;
}>();
