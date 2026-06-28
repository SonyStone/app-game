import { CAMERA_UNIFORM_BYTES } from './cameraUniforms'

export function createCameraUniformBuffer(device: GPUDevice) {
  return device.createBuffer({
    size: CAMERA_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'camera uniforms',
  })
}

export function createCameraBindGroupLayout(device: GPUDevice) {
  return device.createBindGroupLayout({
    label: 'camera bind group layout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: {
          type: 'uniform',
        },
      },
    ],
  })
}

export function createStrokeDataBindGroupLayout(device: GPUDevice) {
  return device.createBindGroupLayout({
    label: 'stroke primitive data bind group layout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: {
          type: 'read-only-storage',
        },
      },
    ],
  })
}

export function createCameraBindGroup(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  uniformBuffer: GPUBuffer,
) {
  return device.createBindGroup({
    layout,
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
    ],
  })
}

export function createStrokeDataBindGroup(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  buffer: GPUBuffer,
) {
  return device.createBindGroup({
    layout,
    entries: [
      {
        binding: 0,
        resource: { buffer },
      },
    ],
  })
}
