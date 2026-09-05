import { createMemo, createSignal, onSettled, Show } from 'solid-js';
import type { DrawingWorkplane } from '../../document';
import { createCameraMatrices, type CameraState } from '../../render/cameraMatrices';
import { transformMat4 } from '../../render/matrixTransform';
import type { WorkplaneGizmoMode } from '../../render/workplaneGizmoTypes';
import { SketchIcon } from '../../shared/SketchIcon';

/** Follows the workplane pivot in the viewport; disappears when the pivot is outside the view. */
export function GizmoModeSwitch(props: {
  canvas: () => HTMLCanvasElement;
  camera: CameraState;
  workplane: DrawingWorkplane;
  mode: WorkplaneGizmoMode;
  onChange: (mode: WorkplaneGizmoMode) => void;
}) {
  const [size, setSize] = createSignal({ width: 1, height: 1 });
  onSettled(() => {
    const canvas = props.canvas();
    const measure = () => {
      const { width, height } = canvas.getBoundingClientRect();
      setSize({ width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  });
  const position = createMemo(() => {
    const { width, height } = size();
    if (width <= 1 || height <= 1) return;
    const matrices = createCameraMatrices(props.camera, width / height);
    const clip = transformMat4(matrices.viewProjection, [...props.workplane.origin, 1]);
    if (clip[3] <= 0 || clip[2] < 0 || clip[2] > clip[3]) return;
    const x = (clip[0] / clip[3] + 1) * width / 2;
    const y = (1 - clip[1] / clip[3]) * height / 2;
    if (x < 0 || x > width || y < 0 || y > height) return;
    return {
      x: Math.max(8, Math.min(width - 52, x + 108)),
      y: Math.max(8, Math.min(height - 52, y - 22))
    };
  });
  const nextMode = () => props.mode === 'translate' ? 'rotate' : 'translate';
  const label = () => props.mode === 'translate' ? 'Switch gizmo to rotation' : 'Switch gizmo to translation';
  return (
    <Show when={position()}>
      {(point) => (
        <button
          class="gizmo-mode-switch"
          type="button"
          aria-label={label()}
          title={label()}
          style={{ left: `${point().x}px`, top: `${point().y}px` }}
          onClick={() => props.onChange(nextMode())}
        >
          <SketchIcon name={nextMode() === 'rotate' ? 'rotate' : 'move'} />
        </button>
      )}
    </Show>
  );
}
