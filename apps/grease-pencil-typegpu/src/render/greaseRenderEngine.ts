import type {
  DrawingWorkplane,
  RenderLayer,
  Stroke,
  StrokeId,
} from '../document'
import {
  createDepthTexture,
  createVertexBufferState,
  destroyGpuBuffer,
  destroyVertexBuffer,
  type VertexBufferState,
} from './gpuBuffers'
import {
  createDrawingGpuResources,
  destroyDrawingGpuResources,
  type DrawingGpuCanvas,
  type DrawingGpuResources,
} from './gpuSession'
import type { CameraState } from './math'
import { renderDrawingFrame } from './rendererFrame'
import {
  createRendererScene,
  updateRendererScene,
  type RendererScene,
  type StrokePointOverlay,
} from './rendererScene'
import { createDefaultCamera } from './viewportCamera'
import type {
  RendererStatus,
  RendererViewportSize,
} from './greaseRendererWorkerProtocol'

export class GreaseRenderEngine {
  readonly canvas: DrawingGpuCanvas
  readonly camera: CameraState = createDefaultCamera()

  private depthTexture?: GPUTexture
  private gpu?: DrawingGpuResources
  private scene: RendererScene = createRendererScene()
  private strokeDiscBuffer: VertexBufferState = createVertexBufferState()
  private strokeSegmentBuffer: VertexBufferState = createVertexBufferState()
  private strokeSquareBuffer: VertexBufferState = createVertexBufferState()
  private vertexBuffer: VertexBufferState = createVertexBufferState()
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
    this.depthTexture?.destroy()
    destroyGpuBuffer(this.strokeDiscBuffer)
    destroyGpuBuffer(this.strokeSegmentBuffer)
    destroyGpuBuffer(this.strokeSquareBuffer)
    destroyVertexBuffer(this.vertexBuffer)
    if (this.gpu) destroyDrawingGpuResources(this.gpu)
  }

  setCamera(camera: CameraState) {
    this.camera.target = [...camera.target]
    this.camera.yaw = camera.yaw
    this.camera.pitch = camera.pitch
    this.camera.distance = camera.distance
    this.render()
  }

  setScene(
    layers: RenderLayer[],
    workplane: DrawingWorkplane,
    draftStroke?: Stroke,
    selectedStrokeIds: ReadonlySet<StrokeId> = new Set<StrokeId>(),
    pointOverlays: readonly StrokePointOverlay[] = [],
  ) {
    this.scene = updateRendererScene(
      this.scene,
      layers,
      workplane,
      draftStroke,
      selectedStrokeIds,
      pointOverlays,
    )
    this.render()
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
    this.render()
  }

  render() {
    if (!this.gpu || !this.depthTexture) return

    renderDrawingFrame({
      camera: this.camera,
      depthTexture: this.depthTexture,
      gpu: this.gpu,
      height: this.height,
      scene: this.scene,
      strokeDiscBuffer: this.strokeDiscBuffer,
      strokeSegmentBuffer: this.strokeSegmentBuffer,
      strokeSquareBuffer: this.strokeSquareBuffer,
      vertexBuffer: this.vertexBuffer,
      width: this.width,
    })
  }
}
