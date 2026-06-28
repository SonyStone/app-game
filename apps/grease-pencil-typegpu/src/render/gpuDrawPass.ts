import type { TgpuBindGroup, TgpuRenderPipeline } from 'typegpu'
import type { DrawingGpuResources } from './gpuSession'
import { drawingVertexLayout } from './gpuMeshPipeline'
import {
  STROKE_DISC_VERTEX_COUNT,
  STROKE_SEGMENT_VERTEX_COUNT,
  STROKE_SQUARE_VERTEX_COUNT,
} from './strokeGpuPrimitives'

const CLEAR_COLOR = { r: 0.952, g: 0.955, b: 0.942, a: 1 } as const

export type MeshDrawBuffer = {
  buffer: GPUBuffer
  vertexCount: number
}

export type StrokePrimitiveDrawBuffer = {
  bindGroup: TgpuBindGroup
  instanceCount: number
}

export type DrawingPassBuffers = {
  mesh?: MeshDrawBuffer
  segments?: StrokePrimitiveDrawBuffer
  discs?: StrokePrimitiveDrawBuffer
  squares?: StrokePrimitiveDrawBuffer
}

export function submitDrawingPass(
  gpu: DrawingGpuResources,
  depthTexture: GPUTexture,
  buffers: DrawingPassBuffers,
) {
  const encoder = gpu.device.createCommandEncoder()
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: gpu.context.getCurrentTexture().createView(),
        clearValue: CLEAR_COLOR,
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  })
  if (buffers.mesh) {
    gpu.meshPipeline
      .with(pass)
      .with(gpu.cameraBindGroup)
      .with(drawingVertexLayout, buffers.mesh.buffer)
      .draw(buffers.mesh.vertexCount)
  }
  drawStrokePrimitive(
    pass,
    gpu.strokePipelines.segment,
    gpu.cameraBindGroup,
    buffers.segments,
    STROKE_SEGMENT_VERTEX_COUNT,
  )
  drawStrokePrimitive(
    pass,
    gpu.strokePipelines.disc,
    gpu.cameraBindGroup,
    buffers.discs,
    STROKE_DISC_VERTEX_COUNT,
  )
  drawStrokePrimitive(
    pass,
    gpu.strokePipelines.square,
    gpu.cameraBindGroup,
    buffers.squares,
    STROKE_SQUARE_VERTEX_COUNT,
  )
  pass.end()
  gpu.device.queue.submit([encoder.finish()])
}

function drawStrokePrimitive(
  pass: GPURenderPassEncoder,
  pipeline: TgpuRenderPipeline,
  cameraBindGroup: TgpuBindGroup,
  buffer: StrokePrimitiveDrawBuffer | undefined,
  vertexCount: number,
) {
  if (!buffer || buffer.instanceCount === 0) return

  pipeline
    .with(pass)
    .with(cameraBindGroup)
    .with(buffer.bindGroup)
    .draw(vertexCount, buffer.instanceCount)
}
