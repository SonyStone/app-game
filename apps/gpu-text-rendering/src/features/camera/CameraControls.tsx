import { useGpuCanvas } from '../../shared/gpu/GpuCanvasProvider';
import { useFrameLoop } from '../scene/FrameLoop';
import { useViewport } from '../viewport/Viewport';
import { useDocumentCamera } from './DocumentCamera';
import { makeCameraControls } from './makeCameraControls';

/** Mounts pointer/wheel controls; unmounting removes listeners and releases captured pointers. */
export function CameraControls(props: {
  pageAspect: number;
  onInteraction?: () => void;
  onDraggingChange?: (dragging: boolean) => void;
}) {
  const canvas = useGpuCanvas().context.canvas as HTMLCanvasElement;
  const viewport = useViewport();
  const camera = useDocumentCamera();
  const { invalidate } = useFrameLoop();

  makeCameraControls(
    canvas,
    camera,
    () => props.pageAspect,
    () => {
      props.onInteraction?.();
      invalidate();
    },
    (dragging) => props.onDraggingChange?.(dragging),
    viewport
  );

  return null;
}
