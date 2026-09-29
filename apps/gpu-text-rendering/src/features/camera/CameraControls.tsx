import { useGpuCanvas } from '../../shared/gpu/GpuCanvasProvider';
import { useViewport } from '../viewport/createViewport';
import type { DocumentCamera } from './createDocumentCamera';
import { makeCameraControls } from './makeCameraControls';

/**
 * Moves `camera` with pointer and wheel gestures on the scene's canvas. Mount beneath FrameLoop; unmounting removes
 * listeners and releases captured pointers.
 */
export function CameraControls(props: {
  /** Camera that gestures move; fixed for the component's lifetime. */
  camera: DocumentCamera;
  /** Runs for each user gesture start, camera move and wheel event. */
  onInteraction?: () => void;
  /** Reports whether any pointer is pressed, for cursor feedback. */
  onDraggingChange?: (dragging: boolean) => void;
}) {
  makeCameraControls({
    canvas: useGpuCanvas().context.canvas as HTMLCanvasElement,
    camera: props.camera,
    viewport: useViewport(),
    onInteraction: () => props.onInteraction?.(),
    onDraggingChange: (dragging) => props.onDraggingChange?.(dragging)
  });

  return null;
}
