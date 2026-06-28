import type { CameraState } from './math'
import { createCameraFrameUniforms } from './cameraUniforms'
import {
  ensureStorageBuffer,
  ensureVertexBuffer,
  type VertexBufferState,
} from './gpuBuffers'
import { submitDrawingPass } from './gpuDrawPass'
import type { DrawingGpuResources } from './gpuSession'
import { FLOATS_PER_VERTEX } from './meshBuilder'
import { createStrokeDataBindGroup } from './gpuPipeline'
import {
  buildRendererSceneGeometry,
  type RendererScene,
} from './rendererScene'
import {
  STROKE_POINT_FLOATS,
  STROKE_SEGMENT_FLOATS,
} from './strokeGpuPrimitives'

type RenderDrawingFrameParams = {
  camera: CameraState
  depthTexture: GPUTexture
  gpu: DrawingGpuResources
  height: number
  scene: RendererScene
  strokeDiscBuffer: VertexBufferState
  strokeSegmentBuffer: VertexBufferState
  strokeSquareBuffer: VertexBufferState
  vertexBuffer: VertexBufferState
  width: number
}

export function renderDrawingFrame(params: RenderDrawingFrameParams) {
  const cameraUniforms = createCameraFrameUniforms(
    params.camera,
    params.width / params.height,
  )
  const geometry = buildRendererSceneGeometry(
    params.scene,
    cameraUniforms.billboardNormal,
  )

  params.gpu.device.queue.writeBuffer(
    params.gpu.uniformBuffer,
    0,
    cameraUniforms.data,
  )

  const mesh = writeMeshBuffer(params.gpu, params.vertexBuffer, geometry.vertices)
  const segments = writeStrokePrimitiveBuffer(
    params.gpu,
    params.strokeSegmentBuffer,
    geometry.strokePrimitives.segments,
    STROKE_SEGMENT_FLOATS,
    'stroke segment primitives',
  )
  const discs = writeStrokePrimitiveBuffer(
    params.gpu,
    params.strokeDiscBuffer,
    geometry.strokePrimitives.discs,
    STROKE_POINT_FLOATS,
    'stroke disc primitives',
  )
  const squares = writeStrokePrimitiveBuffer(
    params.gpu,
    params.strokeSquareBuffer,
    geometry.strokePrimitives.squares,
    STROKE_POINT_FLOATS,
    'stroke square primitives',
  )

  submitDrawingPass(params.gpu, params.depthTexture, {
    ...(mesh ? { mesh } : {}),
    ...(segments ? { segments } : {}),
    ...(discs ? { discs } : {}),
    ...(squares ? { squares } : {}),
  })
}

function writeMeshBuffer(
  gpu: DrawingGpuResources,
  state: VertexBufferState,
  vertices: number[],
) {
  const vertexCount = vertices.length / FLOATS_PER_VERTEX
  if (vertexCount === 0) return

  const buffer = ensureVertexBuffer(
    gpu.device,
    state,
    vertices.length * Float32Array.BYTES_PER_ELEMENT,
  )
  gpu.device.queue.writeBuffer(buffer, 0, new Float32Array(vertices))

  return {
    buffer,
    vertexCount,
  }
}

function writeStrokePrimitiveBuffer(
  gpu: DrawingGpuResources,
  state: VertexBufferState,
  data: number[],
  floatsPerInstance: number,
  label: string,
) {
  const instanceCount = data.length / floatsPerInstance
  if (instanceCount === 0) return

  const buffer = ensureStorageBuffer(
    gpu.device,
    state,
    data.length * Float32Array.BYTES_PER_ELEMENT,
    label,
  )
  gpu.device.queue.writeBuffer(buffer, 0, new Float32Array(data))

  return {
    bindGroup: createStrokeDataBindGroup(
      gpu.device,
      gpu.strokeDataBindGroupLayout,
      buffer,
    ),
    instanceCount,
  }
}
