import { NavigationPuck, attachNavigationPuck } from '@app-game/navigation-puck';
import { ViewCube, type ViewNavigation } from '@app-game/solid-view-cube';
import { Show, onSettled } from 'solid-js';
import type { DrawingWorkplane } from '../../document';
import type { CameraState } from '../../render/math';
import { cameraOrientation } from '../../render/viewCubeCamera';
import type { WorkplaneGizmoMode } from '../../render/workplaneGizmoTypes';
import { SketchIcon } from '../../shared/SketchIcon';
import type { ViewportMode } from '../../shared/viewportMode';
import type { InteractionViewport } from '../interaction/viewportPort';
import { GizmoModeSwitch } from './GizmoModeSwitch';
import { createGreaseNavigation } from './greaseNavigation';

/** The canvas stays mounted when tools and inspectors change. */
export function CanvasViewport(props: CanvasViewportProps) {
  let canvas!: HTMLCanvasElement;
  const canvasPointers = new Set<number>();
  const navigation = createGreaseNavigation({
    viewport: () => canvas.getBoundingClientRect(),
    renderer: () => props.renderer,
    roll: () => props.camera.roll,
    mode: () => props.viewportMode
  });
  const releasePointer = (event: PointerEvent, cancel = false) => {
    if (!canvasPointers.delete(event.pointerId)) return;
    if (cancel) props.onPointerCancel(event);
    else props.onPointerUp(event);
  };

  onSettled(() => attachNavigationPuck(canvas, navigation, { busy: () => canvasPointers.size > 0 }));

  return (
    <div class="canvas-shell">
      <canvas
        ref={(element) => {
          canvas = element;
          props.canvasRef(element);
        }}
        class="drawing-canvas"
        aria-label="Drawing canvas"
        tabindex={0}
        onPointerDown={(event) => {
          canvas.focus({ preventScroll: true });
          canvasPointers.add(event.pointerId);
          props.onPointerDown(event);
        }}
        onPointerMove={props.onPointerMove}
        onPointerUp={(event) => releasePointer(event)}
        onPointerCancel={(event) => releasePointer(event, true)}
        onLostPointerCapture={(event) => releasePointer(event, true)}
        onContextMenu={(event) => event.preventDefault()}
        onWheel={props.onWheel}
      />
      <button
        class="navigation-puck-launcher floating-button"
        type="button"
        aria-label="Open navigation puck"
        title="Navigation · hold Space / right click"
        aria-expanded={navigation.center() ? 'true' : 'false'}
        onClick={() => navigation.open()}
      >
        <SketchIcon name="pan" />
      </button>
      <NavigationPuck navigation={navigation} focusTarget={() => canvas} />
      <Show when={props.status !== 'WebGPU ready.'}>
        <div class="status-panel" role="status">
          {props.status}
        </div>
      </Show>
      <Show when={props.viewportMode === '3d'}>
        <GizmoModeSwitch
          canvas={() => canvas}
          camera={props.camera}
          workplane={props.workplane}
          mode={props.gizmoMode}
          onChange={props.onSetGizmoMode}
        />
        <ViewCube
          animated={props.animateViewCube}
          orientation={cameraOrientation(props.camera)}
          onHome={props.onHomeView}
          onNavigate={props.onNavigateView}
          class="viewport-cube"
        />
      </Show>
    </div>
  );
}

type CanvasViewportProps = {
  workplane: DrawingWorkplane;
  /** Visible and interactive workplane handles in 3D. */
  gizmoMode: WorkplaneGizmoMode;
  onSetGizmoMode: (mode: WorkplaneGizmoMode) => void;
  renderer: Pick<InteractionViewport, 'transformTouch' | 'orbit'> | undefined;
  canvasRef: (canvas: HTMLCanvasElement) => void;
  camera: CameraState;
  status: string;
  viewportMode: ViewportMode;
  animateViewCube?: boolean;
  onHomeView: () => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: (event: PointerEvent) => void;
  onNavigateView: (request: ViewNavigation) => void;
  onWheel: (event: WheelEvent) => void;
};
