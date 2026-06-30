import type {
  DrawingWorkplane,
  RenderLayer,
  Stroke,
  StrokeId,
} from '../document'
import type { ViewportMode } from '../shared/viewportMode'
import type { Vec3 } from '../shared/vector'
import GreaseRendererWorker from './greaseRenderer.worker?worker'
import type {
  GreaseRendererMainMessage,
  GreaseRendererWorkerMessage,
  RendererStatus,
  RendererViewportSize,
} from './greaseRendererWorkerProtocol'
import {
  clamp,
  type CameraState,
} from './math'
import type { WorkplaneGizmoHighlight } from './workplaneGizmoTypes'
import {
  createRendererScene,
  updateRendererDraftStroke,
  updateRendererScene,
  updateRendererWorkplaneGizmoHighlight,
  type RendererScene,
  type StrokePointOverlay,
} from './rendererScene'
import {
  createDefaultCamera,
  lockCameraToWorkplane,
  offsetFromWorkplane as offsetPointFromWorkplane,
  orbitCamera,
  panCamera,
  resetCameraView,
  rotateCameraViewByAngle,
  screenToWorkplane,
  setCameraViewDirection,
  unlockCameraFromWorkplane,
  worldToScreen,
  zoomCamera,
} from './viewportCamera'

export type { StrokePointOverlay } from './rendererScene'

const MAX_DEVICE_PIXEL_RATIO = 2
const CAMERA_TWEEN_DURATION_MS = 280

export class GreaseRenderer {
  readonly canvas: HTMLCanvasElement
  readonly camera: CameraState = createDefaultCamera()

  private cameraTweenFrame: number | undefined
  private height = 1
  private flushFrame: number | undefined
  private initialized = false
  private pendingCamera = false
  private pendingDraft:
    | Extract<GreaseRendererWorkerMessage, { type: 'draft' }>
    | undefined
  private pendingGizmoHighlight:
    | Extract<GreaseRendererWorkerMessage, { type: 'gizmo-highlight' }>
    | undefined
  private pendingScene:
    | Extract<GreaseRendererWorkerMessage, { type: 'scene' }>
    | undefined
  private pendingViewport: RendererViewportSize | undefined
  private scene: RendererScene = createRendererScene()
  private statusResolver?: (status: RendererStatus) => void
  private viewportMode: ViewportMode = '3d'
  private viewport: RendererViewportSize = { width: 1, height: 1, dpr: 1 }
  private width = 1
  private readonly onCameraChange?: (camera: CameraState) => void
  private readonly worker = new GreaseRendererWorker()

  constructor(
    canvas: HTMLCanvasElement,
    onCameraChange?: (camera: CameraState) => void,
  ) {
    this.canvas = canvas
    this.onCameraChange = onCameraChange
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
    this.cancelCameraTween()
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

  setWorkplaneGizmoHighlight(highlight?: WorkplaneGizmoHighlight) {
    this.scene = updateRendererWorkplaneGizmoHighlight(this.scene, highlight)
    this.postWorkplaneGizmoHighlight()
  }

  setViewportMode(
    mode: ViewportMode,
    workplane: DrawingWorkplane,
    snapTarget = false,
  ) {
    const changed = this.viewportMode !== mode
    if (!changed && !snapTarget) return

    this.cancelCameraTween()
    this.viewportMode = mode
    if (mode === '2d') {
      lockCameraToWorkplane(this.camera, workplane, changed || snapTarget)
    }
    else {
      unlockCameraFromWorkplane(this.camera)
    }
    this.postCamera()
  }

  resize() {
    if (!this.measureViewport()) return
    this.postResize()
  }

  orbit(deltaX: number, deltaY: number) {
    this.cancelCameraTween()
    orbitCamera(this.camera, deltaX, deltaY)
    this.postCamera()
  }

  pan(deltaX: number, deltaY: number) {
    this.cancelCameraTween()
    panCamera(this.camera, deltaX, deltaY)
    this.postCamera()
  }

  zoom(delta: number) {
    this.cancelCameraTween()
    zoomCamera(this.camera, delta)
    this.postCamera()
  }

  resetView(animate = false) {
    this.viewportMode = '3d'
    const nextCamera = cloneCameraState(this.camera)
    resetCameraView(nextCamera)
    this.applyCameraChange(nextCamera, animate)
  }

  rollView(angle: number, animate = false) {
    const nextCamera = cloneCameraState(this.camera)
    rotateCameraViewByAngle(nextCamera, angle)
    this.applyCameraChange(nextCamera, animate)
  }

  setViewDirection(direction: Vec3, animate = false) {
    this.viewportMode = '3d'
    const nextCamera = cloneCameraState(this.camera)
    setCameraViewDirection(nextCamera, direction)
    this.applyCameraChange(nextCamera, animate)
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

  private applyCameraChange(nextCamera: CameraState, animate: boolean) {
    if (!animate) {
      this.cancelCameraTween()
      copyCameraState(this.camera, nextCamera)
      this.postCamera()
      return
    }

    this.startCameraTween(nextCamera)
  }

  private cancelCameraTween() {
    if (this.cameraTweenFrame === undefined) return
    cancelAnimationFrame(this.cameraTweenFrame)
    this.cameraTweenFrame = undefined
  }

  private startCameraTween(nextCamera: CameraState) {
    this.cancelCameraTween()

    const fromCamera = cloneCameraState(this.camera)
    const toCamera = cloneCameraState(nextCamera)
    const startedAt = performance.now()

    const tick = (time: number) => {
      const progress = clamp(
        (time - startedAt) / CAMERA_TWEEN_DURATION_MS,
        0,
        1,
      )
      interpolateCameraState(
        this.camera,
        fromCamera,
        toCamera,
        easeOutCubic(progress),
      )
      this.postCamera()

      if (progress < 1) {
        this.cameraTweenFrame = requestAnimationFrame(tick)
        return
      }

      this.cameraTweenFrame = undefined
      copyCameraState(this.camera, toCamera)
      this.postCamera()
    }

    this.cameraTweenFrame = requestAnimationFrame(tick)
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
    this.emitCameraChange()
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

  private postWorkplaneGizmoHighlight() {
    if (!this.initialized) return
    this.pendingGizmoHighlight = {
      type: 'gizmo-highlight',
      ...(this.scene.workplaneGizmoHighlight
        ? { highlight: this.scene.workplaneGizmoHighlight }
        : {}),
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
          lockedNormal: this.camera.lockedNormal
            ? [...this.camera.lockedNormal]
            : undefined,
          lockedUp: this.camera.lockedUp ? [...this.camera.lockedUp] : undefined,
          mode: this.camera.mode,
          roll: this.camera.roll,
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

    if (this.pendingGizmoHighlight) {
      this.postWorkerMessage(this.pendingGizmoHighlight)
      this.pendingGizmoHighlight = undefined
    }
  }

  private postWorkerMessage(
    message: GreaseRendererWorkerMessage,
    transfer: Transferable[] = [],
  ) {
    this.worker.postMessage(message, transfer)
  }

  private emitCameraChange() {
    this.onCameraChange?.({
      lockedNormal: this.camera.lockedNormal
        ? [...this.camera.lockedNormal]
        : undefined,
      lockedUp: this.camera.lockedUp ? [...this.camera.lockedUp] : undefined,
      mode: this.camera.mode,
      roll: this.camera.roll,
      target: [...this.camera.target],
      yaw: this.camera.yaw,
      pitch: this.camera.pitch,
      distance: this.camera.distance,
    })
  }
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
    distance: camera.distance,
  }
}

function copyCameraState(target: CameraState, source: CameraState) {
  target.lockedNormal = source.lockedNormal ? [...source.lockedNormal] : undefined
  target.lockedUp = source.lockedUp ? [...source.lockedUp] : undefined
  target.mode = source.mode
  target.roll = source.roll
  target.target = [...source.target]
  target.yaw = source.yaw
  target.pitch = source.pitch
  target.distance = source.distance
}

function interpolateCameraState(
  target: CameraState,
  from: CameraState,
  to: CameraState,
  amount: number,
) {
  target.mode = to.mode
  target.lockedNormal = to.lockedNormal ? [...to.lockedNormal] : undefined
  target.lockedUp = to.lockedUp ? [...to.lockedUp] : undefined
  target.roll = interpolateAngle(from.roll, to.roll, amount)
  target.yaw = interpolateAngle(from.yaw, to.yaw, amount)
  target.pitch = interpolateAngle(from.pitch, to.pitch, amount)
  target.distance = interpolateNumber(from.distance, to.distance, amount)
  target.target = [
    interpolateNumber(from.target[0], to.target[0], amount),
    interpolateNumber(from.target[1], to.target[1], amount),
    interpolateNumber(from.target[2], to.target[2], amount),
  ]
}

function interpolateNumber(from: number, to: number, amount: number) {
  return from + (to - from) * amount
}

function interpolateAngle(from: number, to: number, amount: number) {
  return from + shortestAngleDelta(from, to) * amount
}

function shortestAngleDelta(from: number, to: number) {
  return ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2) %
    (Math.PI * 2) - Math.PI
}

function easeOutCubic(progress: number) {
  return 1 - (1 - progress) ** 3
}
