import type {
  DrawingWorkplane,
  RenderLayer,
  Stroke,
  StrokeId,
} from '../document'
import type { Vec3 } from '../shared/vector'
import GreaseRendererWorker from './greaseRenderer.worker?worker'
import type {
  GreaseRendererMainMessage,
  GreaseRendererWorkerMessage,
  RendererStatus,
  RendererViewportSize,
} from './greaseRendererWorkerProtocol'
import type { CameraState } from './math'
import {
  createRendererScene,
  updateRendererDraftStroke,
  updateRendererScene,
  type RendererScene,
  type StrokePointOverlay,
} from './rendererScene'
import {
  createDefaultCamera,
  offsetFromWorkplane as offsetPointFromWorkplane,
  orbitCamera,
  panCamera,
  screenToWorkplane,
  worldToScreen,
  zoomCamera,
} from './viewportCamera'

export type { StrokePointOverlay } from './rendererScene'

const MAX_DEVICE_PIXEL_RATIO = 2

export class GreaseRenderer {
  readonly canvas: HTMLCanvasElement
  readonly camera: CameraState = createDefaultCamera()

  private height = 1
  private flushFrame: number | undefined
  private initialized = false
  private pendingCamera = false
  private pendingDraft:
    | Extract<GreaseRendererWorkerMessage, { type: 'draft' }>
    | undefined
  private pendingScene:
    | Extract<GreaseRendererWorkerMessage, { type: 'scene' }>
    | undefined
  private pendingViewport: RendererViewportSize | undefined
  private scene: RendererScene = createRendererScene()
  private statusResolver?: (status: RendererStatus) => void
  private viewport: RendererViewportSize = { width: 1, height: 1, dpr: 1 }
  private width = 1
  private readonly worker = new GreaseRendererWorker()

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.worker.onmessage = (event: MessageEvent<GreaseRendererMainMessage>) => {
      this.handleWorkerMessage(event.data)
    }
    this.worker.onerror = (event) => {
      this.resolveStatus({
        ok: false,
        message: event.message || 'Renderer worker failed.',
      })
    }
    this.worker.onmessageerror = () => {
      this.resolveStatus({
        ok: false,
        message: 'Renderer worker sent an unreadable message.',
      })
    }
  }

  async init(): Promise<RendererStatus> {
    if (!this.canvas.transferControlToOffscreen) {
      return {
        ok: false,
        message: 'OffscreenCanvas is not available in this browser.',
      }
    }

    this.measureViewport()
    const offscreenCanvas = this.canvas.transferControlToOffscreen()
    const statusPromise = new Promise<RendererStatus>((resolve) => {
      this.statusResolver = resolve
    })
    this.postWorkerMessage(
      {
        type: 'canvas',
        canvas: offscreenCanvas,
        camera: this.camera,
        viewport: this.viewport,
      },
      [offscreenCanvas],
    )
    this.initialized = true
    this.postScene()
    this.postDraft()

    return statusPromise
  }

  destroy() {
    if (this.flushFrame !== undefined) {
      cancelAnimationFrame(this.flushFrame)
      this.flushFrame = undefined
    }
    this.postWorkerMessage({ type: 'destroy' })
    this.worker.terminate()
  }

  setScene(
    layers: RenderLayer[],
    workplane: DrawingWorkplane,
    selectedStrokeIds: ReadonlySet<StrokeId> = new Set<StrokeId>(),
    pointOverlays: readonly StrokePointOverlay[] = [],
  ) {
    this.scene = updateRendererScene(
      this.scene,
      layers,
      workplane,
      selectedStrokeIds,
      pointOverlays,
    )
    this.postScene()
  }

  setDraftStroke(draftStroke?: Stroke) {
    this.scene = updateRendererDraftStroke(this.scene, draftStroke)
    this.postDraft()
  }

  resize() {
    if (!this.measureViewport()) return
    this.postResize()
  }

  orbit(deltaX: number, deltaY: number) {
    orbitCamera(this.camera, deltaX, deltaY)
    this.postCamera()
  }

  pan(deltaX: number, deltaY: number) {
    panCamera(this.camera, deltaX, deltaY)
    this.postCamera()
  }

  zoom(delta: number) {
    zoomCamera(this.camera, delta)
    this.postCamera()
  }

  screenToWorld(clientX: number, clientY: number): Vec3 | undefined {
    return screenToWorkplane(
      this.canvas,
      this.camera,
      this.scene.workplane,
      this.width,
      this.height,
      clientX,
      clientY,
    )
  }

  offsetFromWorkplane(position: Vec3, distance: number): Vec3 {
    return offsetPointFromWorkplane(this.scene.workplane, position, distance)
  }

  projectToScreen(position: Vec3) {
    return worldToScreen(
      this.canvas,
      this.camera,
      this.width,
      this.height,
      position,
    )
  }

  private handleWorkerMessage(message: GreaseRendererMainMessage) {
    switch (message.type) {
      case 'status': {
        this.resolveStatus(message.status)
        return
      }
    }
  }

  private resolveStatus(status: RendererStatus) {
    this.statusResolver?.(status)
    this.statusResolver = undefined
  }

  private measureViewport() {
    const rect = this.canvas.getBoundingClientRect()
    const viewport = {
      width: Math.max(1, rect.width || this.canvas.clientWidth || 1),
      height: Math.max(1, rect.height || this.canvas.clientHeight || 1),
      dpr: Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO),
    } satisfies RendererViewportSize
    const nextWidth = Math.max(1, Math.floor(viewport.width * viewport.dpr))
    const nextHeight = Math.max(1, Math.floor(viewport.height * viewport.dpr))
    const changed =
      viewport.width !== this.viewport.width ||
      viewport.height !== this.viewport.height ||
      viewport.dpr !== this.viewport.dpr ||
      nextWidth !== this.width ||
      nextHeight !== this.height

    this.viewport = viewport
    this.width = nextWidth
    this.height = nextHeight
    return changed
  }

  private postCamera() {
    if (!this.initialized) return
    this.pendingCamera = true
    this.scheduleWorkerFlush()
  }

  private postScene() {
    if (!this.initialized) return
    const scene = this.scene
    this.pendingScene = {
      type: 'scene',
      layers: scene.layers,
      workplane: scene.workplane,
      selectedStrokeIds: [...scene.selectedStrokeIds],
      pointOverlays: scene.pointOverlays,
    } satisfies GreaseRendererWorkerMessage
    this.scheduleWorkerFlush()
  }

  private postDraft() {
    if (!this.initialized) return
    this.pendingDraft = {
      type: 'draft',
      ...(this.scene.draftStroke ? { draftStroke: this.scene.draftStroke } : {}),
    } satisfies GreaseRendererWorkerMessage
    this.scheduleWorkerFlush()
  }

  private postResize() {
    if (!this.initialized) return
    this.pendingViewport = this.viewport
    this.scheduleWorkerFlush()
  }

  private scheduleWorkerFlush() {
    if (this.flushFrame !== undefined) return
    this.flushFrame = requestAnimationFrame(() => {
      this.flushFrame = undefined
      this.flushWorkerMessages()
    })
  }

  private flushWorkerMessages() {
    if (this.pendingViewport) {
      this.postWorkerMessage({
        type: 'resize',
        viewport: this.pendingViewport,
      })
      this.pendingViewport = undefined
    }

    if (this.pendingCamera) {
      this.postWorkerMessage({
        type: 'camera',
        camera: {
          target: [...this.camera.target],
          yaw: this.camera.yaw,
          pitch: this.camera.pitch,
          distance: this.camera.distance,
        },
      })
      this.pendingCamera = false
    }

    if (this.pendingScene) {
      this.postWorkerMessage(this.pendingScene)
      this.pendingScene = undefined
    }

    if (this.pendingDraft) {
      this.postWorkerMessage(this.pendingDraft)
      this.pendingDraft = undefined
    }
  }

  private postWorkerMessage(
    message: GreaseRendererWorkerMessage,
    transfer: Transferable[] = [],
  ) {
    this.worker.postMessage(message, transfer)
  }
}
