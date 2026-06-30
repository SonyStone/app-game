import {
  ViewCube,
  type ViewCubeActionOptions,
  type ViewCubeTarget,
} from '@app-game/solid-view-cube'
import type { CameraState } from '../../render/math'

type CanvasViewportProps = {
  canvasRef: (canvas: HTMLCanvasElement) => void
  camera: CameraState
  status: string
  details: string
  animateViewCube?: boolean
  viewCubeFocalLength?: string
  onHomeView: (options?: ViewCubeActionOptions) => void
  onOrbitView: (deltaX: number, deltaY: number) => void
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  onPointerCancel: (event: PointerEvent) => void
  onRollView: (angle: number, options?: ViewCubeActionOptions) => void
  onSetViewCubeTarget: (
    target: ViewCubeTarget,
    options?: ViewCubeActionOptions,
  ) => void
  onWheel: (event: WheelEvent) => void
}

export function CanvasViewport(props: CanvasViewportProps) {
  return (
    <div class="canvas-shell">
      <canvas
        ref={props.canvasRef}
        class="h-full w-full touch-none"
        onPointerDown={props.onPointerDown}
        onPointerMove={props.onPointerMove}
        onPointerUp={props.onPointerUp}
        onPointerCancel={props.onPointerCancel}
        onContextMenu={(event) => event.preventDefault()}
        onWheel={props.onWheel}
      />

      <div class="status-panel">
        <div class="font-medium text-stone-950">{props.status}</div>
        <div>{props.details}</div>
      </div>

      <ViewCube
        animateViewChanges={props.animateViewCube}
        camera={props.camera}
        focalLength={props.viewCubeFocalLength}
        onHome={props.onHomeView}
        onOrbit={props.onOrbitView}
        onRoll={props.onRollView}
        onSetView={props.onSetViewCubeTarget}
      />
    </div>
  )
}
