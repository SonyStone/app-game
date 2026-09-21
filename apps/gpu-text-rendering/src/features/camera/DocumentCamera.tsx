import type { JSX } from '@solidjs/web';
import { createContext, useContext } from 'solid-js';
import { TokenContext } from '../../shared/jsx/TokenContext';
import type { Camera } from './camera';

/** Creates a camera for this subtree. Frame updates mutate it directly without scheduling UI updates. */
export function DocumentCamera(props: { children: JSX.Element }) {
  const camera: Camera = { x: 0.5, y: 0.5, zoom: 2, rotation: 0 };

  return (
    <TokenContext context={CameraContext} value={camera}>
      {props.children}
    </TokenContext>
  );
}

/** Reads the camera beneath DocumentCamera. Call invalidate after changing it outside a frame callback. */
export function useDocumentCamera() {
  return useContext(CameraContext);
}

const CameraContext = createContext<Camera>();
