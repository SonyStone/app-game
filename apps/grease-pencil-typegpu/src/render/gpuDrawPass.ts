import type { TgpuBindGroup, TgpuRenderPipeline } from 'typegpu'
import type { DrawingGpuResources } from './gpuSession'
import { drawingVertexLayout } from './gpuMeshPipeline'
import {
  STROKE_DISC_VERTEX_COUNT,
  type StrokeGpuPrimitiveRange,
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
  strokeRanges?: readonly StrokeGpuPrimitiveRange[]
}

export function submitDrawingPass(
  gpu: DrawingGpuResources,
  depthTexture: GPUTexture,
  buffers: DrawingPassBuffers,
) {
  const encoder = gpu.device.createCommandEncoder()
  const view = gpu.context.getCurrentTexture().createView()
  const meshPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view,
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
      .with(meshPass)
      .with(gpu.cameraBindGroup)
      .with(drawingVertexLayout, buffers.mesh.buffer)
      .draw(buffers.mesh.vertexCount)
  }
  meshPass.end()

  const hasStrokePrimitives =
    !!buffers.segments || !!buffers.discs || !!buffers.squares
  if (!hasStrokePrimitives) {
    gpu.device.queue.submit([encoder.finish()])
    return
  }

  const strokePass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view,
        loadOp: 'load',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  })
  drawStrokePrimitiveRanges(
    strokePass,
    gpu.strokePipelines.segment,
    gpu.cameraBindGroup,
    buffers.segments,
    STROKE_SEGMENT_VERTEX_COUNT,
    buffers.strokeRanges,
    'segment',
  )
  drawStrokePrimitiveRanges(
    strokePass,
    gpu.strokePipelines.disc,
    gpu.cameraBindGroup,
    buffers.discs,
    STROKE_DISC_VERTEX_COUNT,
    buffers.strokeRanges,
    'disc',
  )
  drawStrokePrimitiveRanges(
    strokePass,
    gpu.strokePipelines.square,
    gpu.cameraBindGroup,
    buffers.squares,
    STROKE_SQUARE_VERTEX_COUNT,
    buffers.strokeRanges,
    'square',
  )
  strokePass.end()
  gpu.device.queue.submit([encoder.finish()])
}

function drawStrokePrimitiveRanges(
  pass: GPURenderPassEncoder,
  pipeline: TgpuRenderPipeline,
  cameraBindGroup: TgpuBindGroup,
  buffer: StrokePrimitiveDrawBuffer | undefined,
  vertexCount: number,
  ranges: readonly StrokeGpuPrimitiveRange[] | undefined,
  primitiveType: 'segment' | 'disc' | 'square',
) {
  if (!buffer || buffer.instanceCount === 0) return

  const boundPipeline = pipeline
    .with(pass)
    .with(cameraBindGroup)
    .with(buffer.bindGroup)
  if (ranges && ranges.length > 0) {
    for (const range of ranges) {
      const primitiveRange = rangeForPrimitive(range, primitiveType)
      if (primitiveRange.count === 0) continue
      boundPipeline.draw(
        vertexCount,
        primitiveRange.count,
        0,
        primitiveRange.start,
      )
    }
    return
  }

  boundPipeline.draw(vertexCount, buffer.instanceCount)
}

function rangeForPrimitive(
  range: StrokeGpuPrimitiveRange,
  primitiveType: 'segment' | 'disc' | 'square',
) {
  switch (primitiveType) {
    case 'segment':
      return { start: range.segmentStart, count: range.segmentCount }
    case 'disc':
      return { start: range.discStart, count: range.discCount }
    case 'square':
      return { start: range.squareStart, count: range.squareCount }
  }
}
