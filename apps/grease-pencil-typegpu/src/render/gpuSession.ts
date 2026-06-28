import tgpu from 'typegpu'
import {
  createCameraBindGroup,
  createCameraUniformBuffer,
  createDrawingPipeline,
} from './gpuPipeline'

export type DrawingGpuResources = {
  device: GPUDevice
  context: GPUCanvasContext
  pipeline: GPURenderPipeline
  uniformBuffer: GPUBuffer
  bindGroup: GPUBindGroup
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
  const pipeline = createDrawingPipeline(root, device, format)
  const bindGroup = createCameraBindGroup(device, pipeline, uniformBuffer)

  return {
    ok: true,
    message: 'WebGPU ready.',
    resources: {
      device,
      context,
      pipeline,
      uniformBuffer,
      bindGroup,
    },
  }
}

export function destroyDrawingGpuResources(resources: DrawingGpuResources) {
  resources.uniformBuffer.destroy()
}
