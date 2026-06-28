export type VertexBufferState = {
  buffer: GPUBuffer | undefined
  capacity: number
}

export function createVertexBufferState(): VertexBufferState {
  return {
    buffer: undefined,
    capacity: 0,
  }
}

export function destroyVertexBuffer(state: VertexBufferState) {
  state.buffer?.destroy()
  state.buffer = undefined
  state.capacity = 0
}

export function destroyGpuBuffer(state: VertexBufferState) {
  destroyVertexBuffer(state)
}

export function ensureVertexBuffer(
  device: GPUDevice,
  state: VertexBufferState,
  requiredBytes: number,
) {
  if (state.buffer && state.capacity >= requiredBytes) return state.buffer

  state.buffer?.destroy()
  state.capacity = Math.max(requiredBytes, state.capacity * 2, 64 * 1024)
  state.buffer = device.createBuffer({
    size: state.capacity,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    label: 'drawing vertices',
  })
  return state.buffer
}

export function ensureStorageBuffer(
  device: GPUDevice,
  state: VertexBufferState,
  requiredBytes: number,
  label: string,
) {
  if (state.buffer && state.capacity >= requiredBytes) return state.buffer

  state.buffer?.destroy()
  state.capacity = Math.max(requiredBytes, state.capacity * 2, 16 * 1024)
  state.buffer = device.createBuffer({
    size: state.capacity,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label,
  })
  return state.buffer
}

export function createDepthTexture(
  device: GPUDevice,
  width: number,
  height: number,
) {
  return device.createTexture({
    size: [width, height],
    format: 'depth32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
    label: 'depth texture',
  })
}
