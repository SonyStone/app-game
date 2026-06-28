import type {
  DrawingWorkplane,
  RenderLayer,
  Stroke,
  StrokeId,
} from '../document'
import type { CameraState } from './math'
import type { StrokePointOverlay } from './rendererScene'
import type { WorkplaneGizmoHighlight } from './workplaneGizmoTypes'

export type RendererStatus = {
  ok: boolean
  message: string
}

export type RendererViewportSize = {
  width: number
  height: number
  dpr: number
}

export type GreaseRendererWorkerMessage =
  | {
      type: 'canvas'
      canvas: OffscreenCanvas
      camera: CameraState
      viewport: RendererViewportSize
    }
  | {
      type: 'resize'
      viewport: RendererViewportSize
    }
  | {
      type: 'camera'
      camera: CameraState
    }
  | {
      type: 'scene'
      layers: RenderLayer[]
      workplane: DrawingWorkplane
      selectedStrokeIds: StrokeId[]
      pointOverlays: readonly StrokePointOverlay[]
    }
  | {
      type: 'draft'
      draftStroke?: Stroke
    }
  | {
      type: 'gizmo-highlight'
      highlight?: WorkplaneGizmoHighlight
    }
  | { type: 'render' }
  | { type: 'destroy' }

export type GreaseRendererMainMessage = {
  type: 'status'
  status: RendererStatus
}
