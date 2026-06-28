import type { StrokeId } from '../document'
import { GreaseRenderEngine } from './greaseRenderEngine'
import type { CameraState } from './math'
import type {
  GreaseRendererMainMessage,
  GreaseRendererWorkerMessage,
  RendererViewportSize,
} from './greaseRendererWorkerProtocol'

type PendingSceneMessage = Extract<
  GreaseRendererWorkerMessage,
  { type: 'scene' }
>

let engine: GreaseRenderEngine | undefined
let pendingCamera: CameraState | undefined
let pendingDraft: PendingDraftMessage | undefined
let pendingGizmoHighlight: PendingGizmoHighlightMessage | undefined
let pendingScene: PendingSceneMessage | undefined
let pendingViewport: RendererViewportSize = { width: 1, height: 1, dpr: 1 }

type PendingDraftMessage = Extract<
  GreaseRendererWorkerMessage,
  { type: 'draft' }
>

type PendingGizmoHighlightMessage = Extract<
  GreaseRendererWorkerMessage,
  { type: 'gizmo-highlight' }
>

self.onmessage = (event: MessageEvent<GreaseRendererWorkerMessage>) => {
  switch (event.data.type) {
    case 'canvas': {
      pendingCamera = event.data.camera
      pendingViewport = event.data.viewport
      engine?.destroy()
      engine = new GreaseRenderEngine(event.data.canvas)
      engine.resize(pendingViewport)
      engine.setCamera(event.data.camera)
      void engine.init().then((status) => {
        postMainMessage({ type: 'status', status })
        applyPendingState()
      })
      return
    }
    case 'resize': {
      pendingViewport = event.data.viewport
      engine?.resize(event.data.viewport)
      return
    }
    case 'camera': {
      pendingCamera = event.data.camera
      engine?.setCamera(event.data.camera)
      return
    }
    case 'scene': {
      pendingScene = event.data
      applyScene(event.data)
      return
    }
    case 'draft': {
      pendingDraft = event.data
      applyDraft(event.data)
      return
    }
    case 'gizmo-highlight': {
      pendingGizmoHighlight = event.data
      applyGizmoHighlight(event.data)
      return
    }
    case 'render': {
      engine?.render()
      return
    }
    case 'destroy': {
      engine?.destroy()
      engine = undefined
      return
    }
  }
}

function applyPendingState() {
  if (pendingCamera) engine?.setCamera(pendingCamera)
  engine?.resize(pendingViewport)
  if (pendingScene) applyScene(pendingScene)
  if (pendingDraft) applyDraft(pendingDraft)
  if (pendingGizmoHighlight) applyGizmoHighlight(pendingGizmoHighlight)
}

function applyScene(message: PendingSceneMessage) {
  engine?.setScene(
    message.layers,
    message.workplane,
    new Set<StrokeId>(message.selectedStrokeIds),
    message.pointOverlays,
  )
}

function applyDraft(message: PendingDraftMessage) {
  engine?.setDraftStroke(message.draftStroke)
}

function applyGizmoHighlight(message: PendingGizmoHighlightMessage) {
  engine?.setWorkplaneGizmoHighlight(message.highlight)
}

function postMainMessage(message: GreaseRendererMainMessage) {
  self.postMessage(message)
}
