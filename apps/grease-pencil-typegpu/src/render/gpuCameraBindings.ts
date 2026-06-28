import tgpu, { d, type TgpuRoot } from 'typegpu'
import { CAMERA_UNIFORM_BYTES } from './cameraUniforms'

export const cameraUniformsSchema = d.struct({
  viewProjection: d.mat4x4f,
  billboardNormal: d.vec4f,
  billboardRight: d.vec4f,
  billboardUp: d.vec4f,
})

export const cameraBindGroupLayout = tgpu.bindGroupLayout({
  camera: {
    uniform: cameraUniformsSchema,
    visibility: ['vertex'],
  },
})

export const strokeDataBindGroupLayout = tgpu.bindGroupLayout({
  primitiveData: {
    storage: d.arrayOf(d.vec4f),
    visibility: ['vertex'],
  },
})

export function createCameraUniformBuffer(device: GPUDevice) {
  return device.createBuffer({
    size: CAMERA_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'camera uniforms',
  })
}

export function createCameraBindGroup(
  root: TgpuRoot,
  uniformBuffer: GPUBuffer,
) {
  return root.createBindGroup(cameraBindGroupLayout, {
    camera: uniformBuffer,
  })
}

export function createStrokeDataBindGroup(
  root: TgpuRoot,
  buffer: GPUBuffer,
) {
  return root.createBindGroup(strokeDataBindGroupLayout, {
    primitiveData: buffer,
  })
}
