import type { DrawingGpuResources } from './gpuSession'

const CLEAR_COLOR = { r: 0.952, g: 0.955, b: 0.942, a: 1 } as const

export function submitDrawingPass(
  gpu: DrawingGpuResources,
  depthTexture: GPUTexture,
  vertexBuffer: GPUBuffer,
  vertexCount: number,
) {
  const encoder = gpu.device.createCommandEncoder()
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: gpu.context.getCurrentTexture().createView(),
        clearValue: CLEAR_COLOR,
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  })
  pass.setPipeline(gpu.pipeline)
  pass.setBindGroup(0, gpu.bindGroup)
  pass.setVertexBuffer(0, vertexBuffer)
  pass.draw(vertexCount)
  pass.end()
  gpu.device.queue.submit([encoder.finish()])
}
