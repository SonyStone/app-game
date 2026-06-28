import tgpu, { d, std, type TgpuRoot } from 'typegpu'
import { cameraBindGroupLayout } from './gpuCameraBindings'

const DrawingVertex = d.unstruct({
  position: d.location(0, d.float32x3),
  color: d.location(1, d.float32x4),
})

export const drawingVertexLayout = tgpu.vertexLayout(d.disarrayOf(DrawingVertex))

const meshVertexMain = tgpu.vertexFn({
  in: {
    position: d.vec3f,
    color: d.vec4f,
  },
  out: {
    position: d.builtin.position,
    color: d.vec4f,
  },
})(({ position, color }) => {
  'use gpu'

  return {
    position: std.mul(
      cameraBindGroupLayout.$.camera.viewProjection,
      d.vec4f(position, d.f32(1)),
    ),
    color: d.vec4f(color),
  }
})

const fragmentMain = tgpu.fragmentFn({
  in: {
    color: d.vec4f,
  },
  out: d.vec4f,
})(({ color }) => {
  'use gpu'

  return d.vec4f(color)
})

export function createDrawingPipeline(
  root: TgpuRoot,
  format: GPUTextureFormat,
) {
  return root.createRenderPipeline({
    attribs: drawingVertexLayout.attrib,
    vertex: meshVertexMain,
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
