import { strokeShaderCode } from './gpuStrokeShader'

export type StrokePrimitivePipelines = {
  segment: GPURenderPipeline
  disc: GPURenderPipeline
  square: GPURenderPipeline
}

export function createStrokePrimitivePipelines(
  device: GPUDevice,
  format: GPUTextureFormat,
  cameraBindGroupLayout: GPUBindGroupLayout,
  strokeDataBindGroupLayout: GPUBindGroupLayout,
): StrokePrimitivePipelines {
  const shaderModule = device.createShaderModule({
    code: strokeShaderCode,
    label: 'grease pencil stroke primitive shader',
  })
  const layout = device.createPipelineLayout({
    bindGroupLayouts: [cameraBindGroupLayout, strokeDataBindGroupLayout],
    label: 'grease pencil stroke primitive pipeline layout',
  })
  return {
    segment: createStrokePrimitivePipeline(
      device,
      format,
      layout,
      shaderModule,
      'segmentVertexMain',
    ),
    disc: createStrokePrimitivePipeline(
      device,
      format,
      layout,
      shaderModule,
      'discVertexMain',
    ),
    square: createStrokePrimitivePipeline(
      device,
      format,
      layout,
      shaderModule,
      'squareVertexMain',
    ),
  }
}

function createStrokePrimitivePipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  layout: GPUPipelineLayout,
  shaderModule: GPUShaderModule,
  entryPoint: string,
) {
  return device.createRenderPipeline({
    label: `grease pencil ${entryPoint} pipeline`,
    layout,
    vertex: {
      module: shaderModule,
      entryPoint,
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragmentMain',
      targets: [
        {
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
      ],
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
