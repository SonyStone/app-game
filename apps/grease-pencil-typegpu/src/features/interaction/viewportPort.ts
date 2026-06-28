import type { Vec3 } from '../../shared/vector'

export type InteractionViewport = {
  offsetFromWorkplane: (position: Vec3, distance: number) => Vec3
  orbit: (deltaX: number, deltaY: number) => void
  pan: (deltaX: number, deltaY: number) => void
  screenToWorld: (clientX: number, clientY: number) => Vec3 | undefined
  zoom: (delta: number) => void
}
