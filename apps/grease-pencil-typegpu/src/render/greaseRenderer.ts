import { createScreenSpaceGuides, worldUnitsPerPixel } from './screenSpaceGuides'
import { transformTouchCamera } from './touchCamera'
import { createViewportCameraMemory } from './viewportCameraMemory'
import type { TouchViewTransform } from '../features/interaction/touchGesture'
import type {
  DrawingWorkplane,
  RenderLayer,
  Stroke,
  StrokeId,
} from '../document'
import type { ViewportMode } from '../shared/viewportMode'
import type { ViewNavigation } from '@app-game/solid-view-cube'
import { applyViewOrientation, interpolateViewOrientation } from './viewCubeCamera'
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
import type { WorkplaneGizmoHighlight, WorkplaneGizmoMode } from './workplaneGizmoTypes'
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
  offsetFromWorkplane as offsetPointFromWorkplane,
  orbitCamera,
  panCamera,
  resetCameraView,
  screenToWorkplane,
  worldToScreen,
  zoomCamera,
} from './viewportCamera'

export type { StrokePointOverlay } from './rendererScene'

const MAX_DEVICE_PIXEL_RATIO = 2
const CAMERA_TWEEN_DURATION_MS = 280

export class GreaseRenderer {
  readonly canvas: HTMLCanvasElement
  readonly camera: CameraState = createDefaultCamera()
  private readonly cameraMemory = createViewportCameraMemory(this.camera)

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

  /** Switches the visible manipulator handles and clears the previous hover. */
  setWorkplaneGizmoMode(mode: WorkplaneGizmoMode) {
    this.scene = { ...this.scene, workplaneGizmoMode: mode, workplaneGizmoHighlight: undefined }
    this.postWorkplaneGizmoHighlight()
  }

  setWorkplaneGizmoHighlight(highlight?: WorkplaneGizmoHighlight) {
    this.scene = updateRendererWorkplaneGizmoHighlight(this.scene, highlight)
    this.postWorkplaneGizmoHighlight()
  }

  /** Switching restores each mode's last camera; snapTarget explicitly resets the paper alignment. */
  setViewportMode(
    mode: ViewportMode,
    workplane: DrawingWorkplane,
    snapTarget = false,
  ) {
    const changed = this.viewportMode !== mode
    if (!changed && !snapTarget) return

    this.cancelCameraTween()
    this.cameraMemory.switchMode(mode, workplane, snapTarget)
    this.viewportMode = mode
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

  /** Applies tablet navigation about the gesture centroid, including roll in 2D and 3D. */
  transformTouch(gesture: TouchViewTransform) {
    this.cancelCameraTween()
    transformTouchCamera(this.camera, this.canvas.getBoundingClientRect(), gesture)
    this.postCamera()
  }

  resetView(animate = false) {
    this.setViewportMode('3d', this.scene.workplane)
    const nextCamera = cloneCameraState(this.camera)
    resetCameraView(nextCamera)
    this.applyCameraChange(nextCamera, animate)
  }

  /** Applies a resolved ViewCube request without changing zoom or orbit pivot. Roll preserves 2D locking. */
  navigateView(request: ViewNavigation) {
    if ('phase' in request && (request.phase === 'end' || request.phase === 'cancel')) return
    const keepPlane = (request.source === 'roll' || request.source === 'roll-drag') && this.camera.mode === '2d'
    if (!keepPlane) this.setViewportMode('3d', this.scene.workplane)
    const nextCamera = cloneCameraState(this.camera)
    applyViewOrientation(nextCamera, request.orientation, keepPlane)
    this.applyCameraChange(nextCamera, request.transition === 'animated')
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

  /** CSS-pixel scale at a world position, shared with the worker's guide geometry. */
  worldUnitsPerPixel(position: Vec3) {
    const rect = this.canvas.getBoundingClientRect()
    const view = createScreenSpaceGuides(this.camera, rect.width, rect.height)
    return worldUnitsPerPixel(view.matrices, view.height, position)
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
      mode: this.scene.workplaneGizmoMode,
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
  interpolateViewOrientation(target, from, to, amount)
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

function easeOutCubic(progress: number) {
  return 1 - (1 - progress) ** 3
}
