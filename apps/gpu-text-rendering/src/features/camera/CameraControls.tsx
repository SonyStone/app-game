import { useGpuCanvas } from '../../shared/gpu/GpuCanvasProvider';
import { useViewport } from '../viewport/Viewport';
import { useDocumentCamera } from './DocumentCamera';
import { makeCameraControls } from './makeCameraControls';

/** Mounts pointer/wheel controls; unmounting removes listeners and releases captured pointers. */
export function CameraControls(props: {
  /** Runs for each user gesture start, camera move and wheel event. */
  onInteraction?: () => void;
  /** Reports whether any pointer is pressed, for cursor feedback. */
  onDraggingChange?: (dragging: boolean) => void;
}) {
  makeCameraControls({
    canvas: useGpuCanvas().context.canvas as HTMLCanvasElement,
    camera: useDocumentCamera(),
    viewport: useViewport(),
    onInteraction: () => props.onInteraction?.(),
    onDraggingChange: (dragging) => props.onDraggingChange?.(dragging)
  });

  return null;
}
