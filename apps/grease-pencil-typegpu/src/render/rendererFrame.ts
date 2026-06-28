import type { CameraState } from './math'
import {
  ensureVertexBuffer,
  type VertexBufferState,
} from './gpuBuffers'
import { submitDrawingPass } from './gpuDrawPass'
import type { DrawingGpuResources } from './gpuSession'
import { FLOATS_PER_VERTEX } from './meshBuilder'
import { cameraViewProjection } from './viewportCamera'
import {
  buildRendererSceneVertices,
  type RendererScene,
} from './rendererScene'

type RenderDrawingFrameParams = {
  camera: CameraState
  depthTexture: GPUTexture
  gpu: DrawingGpuResources
  height: number
  scene: RendererScene
  vertexBuffer: VertexBufferState
  width: number
}

export function renderDrawingFrame(params: RenderDrawingFrameParams) {
  const vertices = buildRendererSceneVertices(params.scene)
  const vertexCount = vertices.length / FLOATS_PER_VERTEX
  if (vertexCount === 0) return

  const vertexBuffer = ensureVertexBuffer(
    params.gpu.device,
    params.vertexBuffer,
    vertices.length * Float32Array.BYTES_PER_ELEMENT,
  )
  params.gpu.device.queue.writeBuffer(
    vertexBuffer,
    0,
    new Float32Array(vertices),
  )

  params.gpu.device.queue.writeBuffer(
    params.gpu.uniformBuffer,
    0,
    cameraViewProjection(params.camera, params.width / params.height),
  )

  submitDrawingPass(params.gpu, params.depthTexture, vertexBuffer, vertexCount)
}
