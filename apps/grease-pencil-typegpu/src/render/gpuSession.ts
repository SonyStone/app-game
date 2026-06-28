import tgpu from 'typegpu'
import {
  createCameraBindGroup,
  createCameraBindGroupLayout,
  createCameraUniformBuffer,
  createDrawingPipeline,
  createStrokeDataBindGroupLayout,
  createStrokePrimitivePipelines,
  type StrokePrimitivePipelines,
} from './gpuPipeline'

export type DrawingGpuResources = {
  device: GPUDevice
  context: GPUCanvasContext
  meshPipeline: GPURenderPipeline
  strokePipelines: StrokePrimitivePipelines
  uniformBuffer: GPUBuffer
  cameraBindGroup: GPUBindGroup
  strokeDataBindGroupLayout: GPUBindGroupLayout
}

export type DrawingGpuInitResult =
  | { ok: true; resources: DrawingGpuResources; message: string }
  | { ok: false; message: string }

export async function createDrawingGpuResources(
  canvas: HTMLCanvasElement,
): Promise<DrawingGpuInitResult> {
  if (!navigator.gpu) {
    return {
      ok: false,
      message: 'WebGPU is not available in this browser.',
    }
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  })
  if (!adapter) {
    return {
      ok: false,
      message: 'No WebGPU adapter was found on this device.',
    }
  }

  const device = await adapter.requestDevice()
  const context = canvas.getContext('webgpu')
  if (!context) {
    return {
      ok: false,
      message: 'Could not create a WebGPU canvas context.',
    }
  }

  const root = tgpu.initFromDevice({ device })
  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
  })

  const uniformBuffer = createCameraUniformBuffer(device)
  const cameraBindGroupLayout = createCameraBindGroupLayout(device)
  const strokeDataBindGroupLayout = createStrokeDataBindGroupLayout(device)
  const meshPipeline = createDrawingPipeline(
    root,
    device,
    format,
    cameraBindGroupLayout,
  )
  const strokePipelines = createStrokePrimitivePipelines(
    device,
    format,
    cameraBindGroupLayout,
    strokeDataBindGroupLayout,
  )
  const cameraBindGroup = createCameraBindGroup(
    device,
    cameraBindGroupLayout,
    uniformBuffer,
  )

  return {
    ok: true,
    message: 'WebGPU ready.',
    resources: {
      device,
      context,
      meshPipeline,
      strokePipelines,
      uniformBuffer,
      cameraBindGroup,
      strokeDataBindGroupLayout,
    },
  }
}

export function destroyDrawingGpuResources(resources: DrawingGpuResources) {
  resources.uniformBuffer.destroy()
}
