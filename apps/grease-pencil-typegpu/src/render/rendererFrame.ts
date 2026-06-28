import type { CameraState } from './math'
import { createCameraFrameUniforms } from './cameraUniforms'
import {
  createVertexBufferState,
  destroyGpuBuffer,
  destroyVertexBuffer,
  ensureStorageBuffer,
  ensureVertexBuffer,
  type VertexBufferState,
} from './gpuBuffers'
import {
  submitDrawingPass,
  type DrawingPassBuffers,
} from './gpuDrawPass'
import type { DrawingGpuResources } from './gpuSession'
import {
  FLOATS_PER_VERTEX,
  type DrawingGeometry,
} from './meshBuilder'
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

export type DrawingFrameBufferStates = {
  strokeDiscBuffer: VertexBufferState
  strokeSegmentBuffer: VertexBufferState
  strokeSquareBuffer: VertexBufferState
  vertexBuffer: VertexBufferState
}

export function createDrawingFrameBufferStates(): DrawingFrameBufferStates {
  return {
    strokeDiscBuffer: createVertexBufferState(),
    strokeSegmentBuffer: createVertexBufferState(),
    strokeSquareBuffer: createVertexBufferState(),
    vertexBuffer: createVertexBufferState(),
  }
}

export function destroyDrawingFrameBufferStates(
  states: DrawingFrameBufferStates,
) {
  destroyGpuBuffer(states.strokeDiscBuffer)
  destroyGpuBuffer(states.strokeSegmentBuffer)
  destroyGpuBuffer(states.strokeSquareBuffer)
  destroyVertexBuffer(states.vertexBuffer)
}

export function renderDrawingFrame(params: RenderDrawingFrameParams) {
  const cameraUniforms = writeCameraFrameUniforms(
    params.gpu,
    params.camera,
    params.width / params.height,
  )
  const geometry = buildRendererSceneGeometry(
    params.scene,
    cameraUniforms.billboardNormal,
    params.camera.target,
    params.camera.distance,
  )

  const buffers = writeDrawingGeometryBuffers(
    params.gpu,
    {
      strokeDiscBuffer: params.strokeDiscBuffer,
      strokeSegmentBuffer: params.strokeSegmentBuffer,
      strokeSquareBuffer: params.strokeSquareBuffer,
      vertexBuffer: params.vertexBuffer,
    },
    geometry,
  )

  submitDrawingPass(params.gpu, params.depthTexture, buffers)
}

export function writeCameraFrameUniforms(
  gpu: DrawingGpuResources,
  camera: CameraState,
  aspect: number,
) {
  const cameraUniforms = createCameraFrameUniforms(camera, aspect)
  gpu.device.queue.writeBuffer(gpu.uniformBuffer, 0, cameraUniforms.data)
  return cameraUniforms
}

export function writeDrawingGeometryBuffers(
  gpu: DrawingGpuResources,
  states: DrawingFrameBufferStates,
  geometry: DrawingGeometry,
): DrawingPassBuffers {
  const mesh = writeMeshBuffer(gpu, states.vertexBuffer, geometry.vertices)
  const ranges = geometry.strokePrimitives.ranges
  const segments = writeStrokePrimitiveBuffer(
    gpu,
    states.strokeSegmentBuffer,
    geometry.strokePrimitives.segments,
    STROKE_SEGMENT_FLOATS,
    'stroke segment primitives',
    ranges,
  )
  const discs = writeStrokePrimitiveBuffer(
    gpu,
    states.strokeDiscBuffer,
    geometry.strokePrimitives.discs,
    STROKE_POINT_FLOATS,
    'stroke disc primitives',
    ranges,
  )
  const squares = writeStrokePrimitiveBuffer(
    gpu,
    states.strokeSquareBuffer,
    geometry.strokePrimitives.squares,
    STROKE_POINT_FLOATS,
    'stroke square primitives',
    ranges,
  )

  return {
    ...(mesh ? { mesh } : {}),
    ...(segments ? { segments } : {}),
    ...(discs ? { discs } : {}),
    ...(squares ? { squares } : {}),
    strokeRanges: ranges,
  }
}

export function combineDrawingPassBuffers(
  base: DrawingPassBuffers,
  overlay: DrawingPassBuffers,
): DrawingPassBuffers {
  const mesh = combineBufferSet(base.mesh, overlay.mesh)
  const segments = combineBufferSet(base.segments, overlay.segments)
  const discs = combineBufferSet(base.discs, overlay.discs)
  const squares = combineBufferSet(base.squares, overlay.squares)

  return {
    ...(mesh ? { mesh } : {}),
    ...(segments ? { segments } : {}),
    ...(discs ? { discs } : {}),
    ...(squares ? { squares } : {}),
  }
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
  ranges: DrawingGeometry['strokePrimitives']['ranges'],
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
    bindGroup: createStrokeDataBindGroup(gpu.root, buffer),
    instanceCount,
    ranges,
  }
}

function combineBufferSet<T>(
  base: T | readonly T[] | undefined,
  overlay: T | readonly T[] | undefined,
) {
  const buffers = [...bufferList(base), ...bufferList(overlay)]
  return buffers.length > 0 ? buffers : undefined
}

function bufferList<T>(bufferSet: T | readonly T[] | undefined): readonly T[] {
  if (!bufferSet) return []
  return Array.isArray(bufferSet)
    ? (bufferSet as readonly T[])
    : [bufferSet as T]
}
