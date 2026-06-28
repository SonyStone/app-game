import type {
  DrawingWorkplane,
  RenderLayer,
  Stroke,
  StrokeId,
} from '../document'
import {
  createDepthTexture,
} from './gpuBuffers'
import {
  submitDrawingPass,
  type DrawingPassBuffers,
} from './gpuDrawPass'
import {
  createDrawingGpuResources,
  destroyDrawingGpuResources,
  type DrawingGpuCanvas,
  type DrawingGpuResources,
} from './gpuSession'
import type { CameraState } from './math'
import {
  combineDrawingPassBuffers,
  createDrawingFrameBufferStates,
  destroyDrawingFrameBufferStates,
  writeCameraFrameUniforms,
  writeDrawingGeometryBuffers,
} from './rendererFrame'
import {
  buildRendererSceneCommittedGeometry,
  buildRendererSceneDynamicGeometry,
  createRendererScene,
  updateRendererDraftStroke,
  updateRendererScene,
  updateRendererWorkplaneGizmoHighlight,
  type RendererScene,
  type StrokePointOverlay,
} from './rendererScene'
import type { WorkplaneGizmoHighlight } from './workplaneGizmoTypes'
import { createDefaultCamera } from './viewportCamera'
import type {
  RendererStatus,
  RendererViewportSize,
} from './greaseRendererWorkerProtocol'

export class GreaseRenderEngine {
  readonly canvas: DrawingGpuCanvas
  readonly camera: CameraState = createDefaultCamera()

  private committedBuffers: DrawingPassBuffers = {}
  private committedBufferStates = createDrawingFrameBufferStates()
  private committedDirty = true
  private depthTexture?: GPUTexture
  private dynamicBuffers: DrawingPassBuffers = {}
  private dynamicBufferStates = createDrawingFrameBufferStates()
  private dynamicDirty = true
  private gpu?: DrawingGpuResources
  private scene: RendererScene = createRendererScene()
  private destroyed = false
  private renderScheduled = false
  private viewport: RendererViewportSize = { width: 1, height: 1, dpr: 1 }
  private width = 1
  private height = 1

  constructor(canvas: DrawingGpuCanvas) {
    this.canvas = canvas
  }

  async init(): Promise<RendererStatus> {
    const result = await createDrawingGpuResources(this.canvas)
    if (!result.ok) return result

    this.gpu = result.resources
    this.resize(this.viewport)
    this.render()

    return {
      ok: true,
      message: result.message,
    }
  }

  destroy() {
    this.destroyed = true
    this.depthTexture?.destroy()
    destroyDrawingFrameBufferStates(this.committedBufferStates)
    destroyDrawingFrameBufferStates(this.dynamicBufferStates)
    if (this.gpu) destroyDrawingGpuResources(this.gpu)
  }

  setCamera(camera: CameraState) {
    this.camera.target = [...camera.target]
    this.camera.yaw = camera.yaw
    this.camera.pitch = camera.pitch
    this.camera.distance = camera.distance
    this.camera.mode = camera.mode
    this.camera.roll = camera.roll
    this.camera.lockedNormal = camera.lockedNormal
      ? [...camera.lockedNormal]
      : undefined
    this.camera.lockedUp = camera.lockedUp ? [...camera.lockedUp] : undefined
    this.dynamicDirty = true
    this.requestRender()
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
    this.committedDirty = true
    this.dynamicDirty = true
    this.requestRender()
  }

  setDraftStroke(draftStroke?: Stroke) {
    this.scene = updateRendererDraftStroke(this.scene, draftStroke)
    this.dynamicDirty = true
    this.requestRender()
  }

  setWorkplaneGizmoHighlight(highlight?: WorkplaneGizmoHighlight) {
    this.scene = updateRendererWorkplaneGizmoHighlight(this.scene, highlight)
    this.dynamicDirty = true
    this.requestRender()
  }

  resize(viewport: RendererViewportSize) {
    this.viewport = viewport
    const nextWidth = Math.max(1, Math.floor(viewport.width * viewport.dpr))
    const nextHeight = Math.max(1, Math.floor(viewport.height * viewport.dpr))
    const unchanged =
      nextWidth === this.width &&
      nextHeight === this.height &&
      !!this.depthTexture
    if (unchanged) return

    this.width = nextWidth
    this.height = nextHeight
    this.canvas.width = nextWidth
    this.canvas.height = nextHeight
    this.depthTexture?.destroy()
    this.depthTexture = this.gpu
      ? createDepthTexture(this.gpu.device, nextWidth, nextHeight)
      : undefined
    this.requestRender()
  }

  render() {
    this.requestRender()
  }

  private requestRender() {
    if (this.destroyed || this.renderScheduled) return
    this.renderScheduled = true
    scheduleRenderFrame(() => {
      this.renderScheduled = false
      this.renderNow()
    })
  }

  private renderNow() {
    if (this.destroyed || !this.gpu || !this.depthTexture) return

    const cameraUniforms = writeCameraFrameUniforms(
      this.gpu,
      this.camera,
      this.width / this.height,
    )

    if (this.committedDirty) {
      this.committedBuffers = writeDrawingGeometryBuffers(
        this.gpu,
        this.committedBufferStates,
        buildRendererSceneCommittedGeometry(this.scene),
      )
      this.committedDirty = false
    }

    if (this.dynamicDirty) {
      this.dynamicBuffers = writeDrawingGeometryBuffers(
        this.gpu,
        this.dynamicBufferStates,
        buildRendererSceneDynamicGeometry(
          this.scene,
          cameraUniforms.billboardNormal,
          this.camera.target,
          this.camera.distance,
        ),
      )
      this.dynamicDirty = false
    }

    submitDrawingPass(
      this.gpu,
      this.depthTexture,
      combineDrawingPassBuffers(this.committedBuffers, this.dynamicBuffers),
    )
  }
}

function scheduleRenderFrame(callback: () => void) {
  const frameScheduler = (globalThis as typeof globalThis & {
    requestAnimationFrame?: (callback: FrameRequestCallback) => number
  }).requestAnimationFrame

  if (typeof frameScheduler === 'function') {
    frameScheduler(() => callback())
    return
  }

  setTimeout(callback, 16)
}
