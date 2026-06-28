import tgpu, {
  type TgpuBindGroup,
  type TgpuRenderPipeline,
  type TgpuRoot,
} from 'typegpu'
import {
  createCameraBindGroup,
  createCameraUniformBuffer,
  createDrawingPipeline,
  createStrokePrimitivePipelines,
  type StrokePrimitivePipelines,
} from './gpuPipeline'

export type DrawingGpuResources = {
  root: TgpuRoot
  device: GPUDevice
  context: GPUCanvasContext
  meshPipeline: TgpuRenderPipeline
  strokePipelines: StrokePrimitivePipelines
  uniformBuffer: GPUBuffer
  cameraBindGroup: TgpuBindGroup
}

export type DrawingGpuCanvas = HTMLCanvasElement | OffscreenCanvas

export type DrawingGpuInitResult =
  | { ok: true; resources: DrawingGpuResources; message: string }
  | { ok: false; message: string }

export async function createDrawingGpuResources(
  canvas: DrawingGpuCanvas,
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
  const meshPipeline = createDrawingPipeline(root, format)
  const strokePipelines = createStrokePrimitivePipelines(root, format)
  const cameraBindGroup = createCameraBindGroup(root, uniformBuffer)

  return {
    ok: true,
    message: 'WebGPU ready.',
    resources: {
      root,
      device,
      context,
      meshPipeline,
      strokePipelines,
      uniformBuffer,
      cameraBindGroup,
    },
  }
}

export function destroyDrawingGpuResources(resources: DrawingGpuResources) {
  resources.uniformBuffer.destroy()
}
