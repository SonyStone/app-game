import type { TgpuRenderPipeline, TgpuRoot } from 'typegpu'
import {
  discVertexMain,
  fragmentMain,
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
    segment: createStrokePrimitivePipeline(root, format, segmentVertexMain),
    disc: createStrokePrimitivePipeline(root, format, discVertexMain),
    square: createStrokePrimitivePipeline(root, format, squareVertexMain),
  }
}

function createStrokePrimitivePipeline(
  root: TgpuRoot,
  format: GPUTextureFormat,
  vertex: typeof segmentVertexMain,
) {
  return root.createRenderPipeline({
    vertex,
    fragment: fragmentMain,
    targets: {
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
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'none',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  })
}
