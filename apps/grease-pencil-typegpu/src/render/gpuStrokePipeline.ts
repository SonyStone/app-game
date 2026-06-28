import type { TgpuRenderPipeline, TgpuRoot } from 'typegpu'
import {
  discVertexMain,
  pointFragmentMain,
  segmentFragmentMain,
  segmentVertexMain,
  squareVertexMain,
} from './gpuStrokeShader'

export type StrokePrimitivePipelines = {
  segment: TgpuRenderPipeline
  disc: TgpuRenderPipeline
  square: TgpuRenderPipeline
}

export function createStrokePrimitivePipelines(
  root: TgpuRoot,
  format: GPUTextureFormat,
): StrokePrimitivePipelines {
  return {
    segment: root.createRenderPipeline({
      vertex: segmentVertexMain,
      fragment: segmentFragmentMain,
      ...strokePipelineState(format),
    }),
    disc: root.createRenderPipeline({
      vertex: discVertexMain,
      fragment: pointFragmentMain,
      ...strokePipelineState(format),
    }),
    square: root.createRenderPipeline({
      vertex: squareVertexMain,
      fragment: pointFragmentMain,
      ...strokePipelineState(format),
    }),
  }
}

function strokePipelineState(format: GPUTextureFormat) {
  return {
    targets: {
      color: strokeColorTarget(format),
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'none',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'greater',
      format: 'depth32float',
    },
  } as const
}

function strokeColorTarget(format: GPUTextureFormat) {
  return {
    format,
    blend: {
      color: {
        srcFactor: 'src-alpha',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
      alpha: {
        srcFactor: 'one',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
    },
  } as const
}
