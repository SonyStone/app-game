import { useGpuCanvas } from '../../shared/gpu/GpuCanvasProvider';
import { useFrameLoop } from '../scene/FrameLoop';
import { useViewport } from '../viewport/Viewport';
import { useDocumentCamera } from './DocumentCamera';
import { makeCameraControls } from './makeCameraControls';

/** Mounts pointer/wheel controls; unmounting removes listeners and releases captured pointers. */
export function CameraControls(props: {
  /** Page width divided by height; changes apply to the next gesture. */
  pageAspect: number;
  /** Runs for each user gesture or camera move, before the frame is invalidated. */
  onInteraction?: () => void;
  /** Reports whether any pointer is pressed, for cursor feedback. */
  onDraggingChange?: (dragging: boolean) => void;
}) {
  const { invalidate } = useFrameLoop();

  makeCameraControls({
    canvas: useGpuCanvas().context.canvas as HTMLCanvasElement,
    camera: useDocumentCamera(),
    pageAspect: () => props.pageAspect,
    viewport: useViewport(),
    onInteraction: () => {
      props.onInteraction?.();
      invalidate();
    },
    onDraggingChange: (dragging) => props.onDraggingChange?.(dragging)
  });

  return null;
}
