import { useGpuCanvas } from '@app-game/solid-gpu/gpu';
import { useFrame } from '../scene/FrameLoop';
import type { Camera } from './camera';
import type { DocumentCamera } from './createDocumentCamera';

/**
 * While `pending`, requests a frame and hands the next presented one to `onCapture`: the camera it was drawn with and
 * the canvas, which is readable only during this callback. A WebGPU canvas cannot be read after its frame is presented.
 * Mount beneath FrameLoop.
 */
export function ViewCapture(props: {
  /** Camera whose view is captured; fixed for the component's lifetime. */
  camera: DocumentCamera;
  /** Requests a capture; the caller clears it, normally from `onCapture`. */
  pending: boolean;
  /** Receives the drawn camera and the canvas holding its image; must read the canvas synchronously. */
  onCapture: (camera: Camera, canvas: HTMLCanvasElement) => void;
}) {
  const { camera } = props.camera;
  const canvas = useGpuCanvas().context.canvas as HTMLCanvasElement;

  useFrame(() => props.onCapture(camera(), canvas), { phase: 'present', enabled: () => props.pending });

  return null;
}
