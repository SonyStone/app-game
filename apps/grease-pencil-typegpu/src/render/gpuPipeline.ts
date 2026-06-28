import tgpu, { d, type TgpuRoot } from 'typegpu'

const DrawingVertex = d.unstruct({
  position: d.location(0, d.float32x3),
  color: d.location(1, d.float32x4),
})

const drawingVertexLayout = tgpu.vertexLayout(d.disarrayOf(DrawingVertex))

const shaderCode = /* wgsl */ `
struct CameraUniforms {
  viewProjection: mat4x4f,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

struct VertexIn {
  @location(0) position: vec3f,
  @location(1) color: vec4f,
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vertexMain(input: VertexIn) -> VertexOut {
  var output: VertexOut;
  output.position = camera.viewProjection * vec4f(input.position, 1.0);
  output.color = input.color;
  return output;
}

@fragment
fn fragmentMain(input: VertexOut) -> @location(0) vec4f {
  return input.color;
}
`

export function createCameraUniformBuffer(device: GPUDevice) {
  return device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'camera uniforms',
  })
}

export function createDrawingPipeline(
  root: TgpuRoot,
  device: GPUDevice,
  format: GPUTextureFormat,
) {
  const shaderModule = device.createShaderModule({
    code: shaderCode,
    label: 'grease pencil shader',
  })

  const vertexBufferLayout = root.unwrap(drawingVertexLayout)
  return device.createRenderPipeline({
    label: 'grease pencil render pipeline',
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vertexMain',
      buffers: [vertexBufferLayout],
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

export function createCameraBindGroup(
  device: GPUDevice,
  pipeline: GPURenderPipeline,
  uniformBuffer: GPUBuffer,
) {
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
    ],
  })
}
