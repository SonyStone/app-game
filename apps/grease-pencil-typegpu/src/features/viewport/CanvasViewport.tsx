import type { DrawingWorkplane } from '../../document';
import { GizmoModeSwitch } from './GizmoModeSwitch';
import type { WorkplaneGizmoMode } from '../../render/workplaneGizmoTypes';
import { ViewCube, type ViewNavigation } from '@app-game/solid-view-cube';
import { Show, onSettled } from 'solid-js';
import type { CameraState } from '../../render/math';
import { cameraOrientation } from '../../render/viewCubeCamera';
import { SketchIcon } from '../../shared/SketchIcon';
import type { ViewportMode } from '../../shared/viewportMode';
import type { InteractionViewport } from '../interaction/viewportPort';
import { NavigationPuck } from './NavigationPuck';
import { createNavigationPuck } from './createNavigationPuck';

/** The canvas stays mounted when tools and inspectors change. */
export function CanvasViewport(props: CanvasViewportProps) {
  let canvas!: HTMLCanvasElement;
  let lastPointer: { x: number; y: number } | undefined;
  let spaceHeld = false;
  let rightPuckPointer: { id: number; origin: { x: number; y: number } } | undefined;
  const canvasPointers = new Set<number>();
  const navigation = createNavigationPuck({
    viewport: () => canvas.getBoundingClientRect(),
    renderer: () => props.renderer,
    roll: () => props.camera.roll,
    mode: () => props.viewportMode
  });
  const closePuck = () => {
    rightPuckPointer = undefined;
    navigation.close();
    canvas.focus({ preventScroll: true });
  };
  const releasePointer = (event: PointerEvent, cancel = false) => {
    if (rightPuckPointer?.id === event.pointerId) {
      rightPuckPointer = undefined;
      if (cancel) navigation.close();
      else navigation.end(event.pointerId);
      return;
    }
    if (!canvasPointers.delete(event.pointerId)) return;
    if (cancel) props.onPointerCancel(event);
    else props.onPointerUp(event);
  };

  onSettled(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && navigation.center()) {
        event.preventDefault();
        closePuck();
        return;
      }
      if (
        event.code !== 'Space' ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        canvasPointers.size
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
      )
        return;
      if (!navigation.center() && target instanceof Element && target.closest('button, a, [role="button"]')) return;
      event.preventDefault();
      spaceHeld = true;
      navigation.open(lastPointer, 'held');
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !spaceHeld) return;
      event.preventDefault();
      spaceHeld = false;
      navigation.releaseHotkey();
      if (!navigation.activeAction()) canvas.focus({ preventScroll: true });
    };
    const onBlur = () => {
      spaceHeld = false;
      rightPuckPointer = undefined;
      navigation.close();
    };
    const onResize = onBlur;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
    };
  });

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
          lastPointer = { x: event.clientX, y: event.clientY };
          if (event.pointerType === 'mouse' && event.button === 2) {
            event.preventDefault();
            if (!canvasPointers.size) {
              navigation.open(lastPointer);
              rightPuckPointer = { id: event.pointerId, origin: lastPointer };
              canvas.setPointerCapture(event.pointerId);
            }
            return;
          }
          canvas.focus({ preventScroll: true });
          canvasPointers.add(event.pointerId);
          props.onPointerDown(event);
        }}
        onPointerMove={(event) => {
          lastPointer = { x: event.clientX, y: event.clientY };
          if (rightPuckPointer?.id === event.pointerId) {
            const pointer = { ...lastPointer, pointerId: event.pointerId, shiftKey: event.shiftKey };
            if (!navigation.activeAction()) {
              const action = navigation.actionAt(lastPointer, rightPuckPointer.origin);
              if (action) navigation.begin(action, pointer);
            } else navigation.move(pointer);
            return;
          }
          props.onPointerMove(event);
        }}
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
      <NavigationPuck navigation={navigation} mode={props.viewportMode} onClose={closePuck} />
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
