import type { WorkplaneGizmoMode } from '../render/workplaneGizmoTypes';
import { createEffect, createSignal, onSettled, type Accessor } from 'solid-js';
import type { DrawingWorkplane, RenderLayer, Stroke, StrokeId, WorkplaneId } from '../document';
import { GreaseRenderer, type StrokePointOverlay } from '../render/greaseRenderer';
import type { CameraState } from '../render/math';
import { createDefaultCamera } from '../render/viewportCamera';
import type { ViewportMode } from '../shared/viewportMode';

type UseGreaseRendererParams = {
  canvas: Accessor<HTMLCanvasElement | undefined>;
  draftStroke: Accessor<Stroke | undefined>;
  pointOverlays: Accessor<readonly StrokePointOverlay[]>;
  renderLayers: Accessor<readonly RenderLayer[]>;
  activeWorkplaneId: Accessor<WorkplaneId>;
  selectedStrokeIds: Accessor<ReadonlySet<StrokeId>>;
  viewportMode: Accessor<ViewportMode>;
  gizmoMode: Accessor<WorkplaneGizmoMode>;
  workplane: Accessor<DrawingWorkplane>;
};

/** Keeps renderer side effects separate from reactive reads, and follows the actual canvas size. */
export function useGreaseRenderer(params: UseGreaseRendererParams) {
  const [cameraState, setCameraState] = createSignal<CameraState>(createDefaultCamera());
  const [renderer, setRenderer] = createSignal<GreaseRenderer>();
  const [status, setStatus] = createSignal('Starting WebGPU...');

  onSettled(() => {
    let mounted = true;
    const handleResize = () => renderer()?.resize();
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    const observedCanvas = params.canvas();
    if (observedCanvas) resizeObserver.observe(observedCanvas);

    void (async () => {
      const canvas = params.canvas();
      if (!canvas) {
        setStatus('Canvas is not available.');
        return;
      }

      const nextRenderer = new GreaseRenderer(canvas, setCameraState);
      setCameraState(cloneCameraState(nextRenderer.camera));
      setRenderer(nextRenderer);
      const result = await nextRenderer.init();
      if (mounted) setStatus(result.message);
    })();

    return () => {
      mounted = false;
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      renderer()?.destroy();
    };
  });

  createEffect(
    () => ({
      renderer: renderer(),
      layers: [...params.renderLayers()],
      workplane: params.workplane(),
      selection: params.selectedStrokeIds(),
      points: params.pointOverlays()
    }),
    (value) => value.renderer?.setScene(value.layers, value.workplane, value.selection, value.points)
  );

  createEffect(
    () => ({ renderer: renderer(), stroke: params.draftStroke() }),
    (value) => value.renderer?.setDraftStroke(value.stroke)
  );

  createEffect(
    () => ({ renderer: renderer(), mode: params.gizmoMode() }),
    (value) => value.renderer?.setWorkplaneGizmoMode(value.mode)
  );

  let previousWorkplaneId: WorkplaneId | undefined;
  createEffect(
    () => ({
      renderer: renderer(),
      mode: params.viewportMode(),
      workplaneId: params.activeWorkplaneId(),
      workplane: params.workplane()
    }),
    (value) => {
      if (!value.renderer) return;
      const snapTarget =
        value.mode === '2d' && previousWorkplaneId !== undefined && previousWorkplaneId !== value.workplaneId;
      value.renderer.setViewportMode(value.mode, value.workplane, snapTarget);
      previousWorkplaneId = value.workplaneId;
    }
  );

  const zoom = (delta: number) => {
    renderer()?.zoom(delta);
  };

  return {
    renderer,
    cameraState,
    status,
    zoom
  } as const;
}

function cloneCameraState(camera: CameraState): CameraState {
  return {
    lockedNormal: camera.lockedNormal ? [...camera.lockedNormal] : undefined,
    lockedUp: camera.lockedUp ? [...camera.lockedUp] : undefined,
    mode: camera.mode,
    roll: camera.roll,
    target: [...camera.target],
    yaw: camera.yaw,
    pitch: camera.pitch,
    distance: camera.distance
  };
}
