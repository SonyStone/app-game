import type { Vec3 } from '../../shared/vector'
import type { WorkplaneGizmoHighlight } from '../../render/workplaneGizmoTypes'

export type InteractionViewport = {
  offsetFromWorkplane: (position: Vec3, distance: number) => Vec3
  orbit: (deltaX: number, deltaY: number) => void
  pan: (deltaX: number, deltaY: number) => void
  projectToScreen: (position: Vec3) =>
    | {
        x: number
        y: number
        depth: number
      }
    | undefined
  setWorkplaneGizmoHighlight: (
    highlight?: WorkplaneGizmoHighlight,
  ) => void
  screenToWorld: (clientX: number, clientY: number) => Vec3 | undefined
  zoom: (delta: number) => void
}
