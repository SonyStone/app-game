import type {
  DrawingWorkplane,
  RenderLayer,
  Stroke,
  StrokeId,
} from '../document'
import {
  type CameraState,
  type Vec3,
} from './math'
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
  type DrawingGpuResources,
} from './gpuSession'
import { renderDrawingFrame } from './rendererFrame'
import {
  createRendererScene,
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
  zoomCamera,
} from './viewportCamera'

export type { StrokePointOverlay } from './rendererScene'

export type RendererStatus = {
  ok: boolean
  message: string
}

export class GreaseRenderer {
  readonly canvas: HTMLCanvasElement
  readonly camera: CameraState = createDefaultCamera()

  private gpu?: DrawingGpuResources
  private depthTexture?: GPUTexture
  private strokeDiscBuffer: VertexBufferState = createVertexBufferState()
  private strokeSegmentBuffer: VertexBufferState = createVertexBufferState()
  private strokeSquareBuffer: VertexBufferState = createVertexBufferState()
  private vertexBuffer: VertexBufferState = createVertexBufferState()
  private scene: RendererScene = createRendererScene()
  private width = 1
  private height = 1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  async init(): Promise<RendererStatus> {
    const result = await createDrawingGpuResources(this.canvas)
    if (!result.ok) return result

    this.gpu = result.resources
    this.resize()
    this.render()

    return result
  }

  destroy() {
    this.depthTexture?.destroy()
    destroyGpuBuffer(this.strokeDiscBuffer)
    destroyGpuBuffer(this.strokeSegmentBuffer)
    destroyGpuBuffer(this.strokeSquareBuffer)
    destroyVertexBuffer(this.vertexBuffer)
    if (this.gpu) destroyDrawingGpuResources(this.gpu)
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

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const nextWidth = Math.max(1, Math.floor(this.canvas.clientWidth * dpr))
    const nextHeight = Math.max(1, Math.floor(this.canvas.clientHeight * dpr))
    if (nextWidth === this.width && nextHeight === this.height) return

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

  orbit(deltaX: number, deltaY: number) {
    orbitCamera(this.camera, deltaX, deltaY)
    this.render()
  }

  pan(deltaX: number, deltaY: number) {
    panCamera(this.camera, deltaX, deltaY)
    this.render()
  }

  zoom(delta: number) {
    zoomCamera(this.camera, delta)
    this.render()
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

  render() {
    if (!this.gpu || !this.depthTexture) return

    this.resize()

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
