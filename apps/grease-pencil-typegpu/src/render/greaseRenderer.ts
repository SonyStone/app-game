import tgpu, { d, type TgpuRoot } from 'typegpu'
import {
  add3,
  clamp,
  createCameraMatrices,
  distance3,
  getCameraBasis,
  normalize3,
  scale3,
  sub3,
  transformMat4,
  type CameraState,
  type Vec3,
  type Vec4,
} from './math'

export type StrokePoint = {
  position: Vec3
  pressure: number
  time: number
}

export type Stroke = {
  id: string
  color: Vec4
  radius: number
  points: StrokePoint[]
}

export type RendererStatus = {
  ok: boolean
  message: string
}

const DrawingVertex = d.unstruct({
  position: d.location(0, d.float32x3),
  color: d.location(1, d.float32x4),
})

const drawingVertexLayout = tgpu.vertexLayout(d.disarrayOf(DrawingVertex))
const FLOATS_PER_VERTEX = 7

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

export class GreaseRenderer {
  readonly canvas: HTMLCanvasElement
  readonly camera: CameraState = {
    target: [0, 0, 0],
    yaw: 0.68,
    pitch: 0.74,
    distance: 7.5,
  }

  private root?: TgpuRoot
  private device?: GPUDevice
  private context?: GPUCanvasContext
  private pipeline?: GPURenderPipeline
  private uniformBuffer?: GPUBuffer
  private bindGroup?: GPUBindGroup
  private depthTexture?: GPUTexture
  private vertexBuffer?: GPUBuffer
  private vertexCapacity = 0
  private format?: GPUTextureFormat
  private strokes: Stroke[] = []
  private draftStroke?: Stroke
  private width = 1
  private height = 1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  async init(): Promise<RendererStatus> {
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
    const context = this.canvas.getContext('webgpu')
    if (!context) {
      return {
        ok: false,
        message: 'Could not create a WebGPU canvas context.',
      }
    }

    this.device = device
    this.context = context
    this.root = tgpu.initFromDevice({ device })
    this.format = navigator.gpu.getPreferredCanvasFormat()

    context.configure({
      device,
      format: this.format,
      alphaMode: 'premultiplied',
    })

    this.uniformBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'camera uniforms',
    })

    const shaderModule = device.createShaderModule({
      code: shaderCode,
      label: 'grease pencil shader',
    })

    const vertexBufferLayout = this.root.unwrap(drawingVertexLayout)
    this.pipeline = device.createRenderPipeline({
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
            format: this.format,
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

    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.uniformBuffer },
        },
      ],
    })

    this.resize()
    this.render()

    return {
      ok: true,
      message: 'WebGPU ready.',
    }
  }

  destroy() {
    this.depthTexture?.destroy()
    this.vertexBuffer?.destroy()
    this.uniformBuffer?.destroy()
  }

  setStrokes(strokes: Stroke[], draftStroke?: Stroke) {
    this.strokes = strokes
    this.draftStroke = draftStroke
    this.render()
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const nextWidth = Math.max(1, Math.floor(this.canvas.clientWidth * dpr))
    const nextHeight = Math.max(1, Math.floor(this.canvas.clientHeight * dpr))
    if (nextWidth === this.width && nextHeight === this.height) return

    this.width = nextWidth
    this.height = nextHeight
    this.canvas.width = nextWidth
    this.canvas.height = nextHeight
    this.depthTexture?.destroy()
    this.depthTexture = this.device?.createTexture({
      size: [nextWidth, nextHeight],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      label: 'depth texture',
    })
    this.render()
  }

  orbit(deltaX: number, deltaY: number) {
    this.camera.yaw -= deltaX * 0.006
    this.camera.pitch = clamp(this.camera.pitch + deltaY * 0.005, 0.16, 1.42)
    this.render()
  }

  pan(deltaX: number, deltaY: number) {
    const { right, up } = getCameraBasis(this.camera)
    const scale = this.camera.distance * 0.00135
    this.camera.target = add3(
      this.camera.target,
      add3(scale3(right, -deltaX * scale), scale3(up, deltaY * scale)),
    )
    this.render()
  }

  zoom(delta: number) {
    this.camera.distance = clamp(
      this.camera.distance * (1 + delta * 0.001),
      1.6,
      48,
    )
    this.render()
  }

  screenToWorld(clientX: number, clientY: number): Vec3 | undefined {
    const rect = this.canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 2 - 1
    const y = 1 - ((clientY - rect.top) / rect.height) * 2
    const matrices = createCameraMatrices(this.camera, this.width / this.height)
    const near = transformMat4(matrices.inverseViewProjection, [x, y, 0, 1])
    const far = transformMat4(matrices.inverseViewProjection, [x, y, 1, 1])
    if (Math.abs(near[3]) < 1e-6 || Math.abs(far[3]) < 1e-6) return

    const nearPoint: Vec3 = [near[0] / near[3], near[1] / near[3], near[2] / near[3]]
    const farPoint: Vec3 = [far[0] / far[3], far[1] / far[3], far[2] / far[3]]
    const ray = sub3(farPoint, nearPoint)
    if (Math.abs(ray[2]) < 1e-6) return

    const t = -nearPoint[2] / ray[2]
    return add3(nearPoint, scale3(ray, t))
  }

  render() {
    if (
      !this.device ||
      !this.context ||
      !this.pipeline ||
      !this.uniformBuffer ||
      !this.bindGroup ||
      !this.depthTexture
    ) {
      return
    }

    this.resize()

    const vertices: number[] = []
    appendGrid(vertices)
    for (const stroke of this.strokes) appendStroke(vertices, stroke)
    if (this.draftStroke) appendStroke(vertices, this.draftStroke)

    const vertexCount = vertices.length / FLOATS_PER_VERTEX
    if (vertexCount === 0) return

    this.ensureVertexBuffer(vertices.length * Float32Array.BYTES_PER_ELEMENT)
    this.device.queue.writeBuffer(
      this.vertexBuffer!,
      0,
      new Float32Array(vertices),
    )

    const matrices = createCameraMatrices(this.camera, this.width / this.height)
    this.device.queue.writeBuffer(this.uniformBuffer, 0, matrices.viewProjection)

    const encoder = this.device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.952, g: 0.955, b: 0.942, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    })
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.bindGroup)
    pass.setVertexBuffer(0, this.vertexBuffer!)
    pass.draw(vertexCount)
    pass.end()
    this.device.queue.submit([encoder.finish()])
  }

  private ensureVertexBuffer(requiredBytes: number) {
    if (!this.device) return
    if (this.vertexBuffer && this.vertexCapacity >= requiredBytes) return

    this.vertexBuffer?.destroy()
    this.vertexCapacity = Math.max(requiredBytes, this.vertexCapacity * 2, 64 * 1024)
    this.vertexBuffer = this.device.createBuffer({
      size: this.vertexCapacity,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label: 'drawing vertices',
    })
  }
}

function appendGrid(vertices: number[]) {
  const extent = 10
  for (let i = -extent; i <= extent; i += 1) {
    const isAxis = i === 0
    const alpha = isAxis ? 0.46 : i % 5 === 0 ? 0.2 : 0.115
    const width = isAxis ? 0.012 : 0.006
    const xColor: Vec4 = isAxis
      ? [0.86, 0.18, 0.18, alpha]
      : [0.16, 0.18, 0.2, alpha]
    const yColor: Vec4 = isAxis
      ? [0.16, 0.4, 0.88, alpha]
      : [0.16, 0.18, 0.2, alpha]
    appendSegment(vertices, [i, -extent, -0.014], [i, extent, -0.014], width, xColor)
    appendSegment(vertices, [-extent, i, -0.014], [extent, i, -0.014], width, yColor)
  }
}

function appendStroke(vertices: number[], stroke: Stroke) {
  if (stroke.points.length === 0) return

  if (stroke.points.length === 1) {
    appendDisc(
      vertices,
      stroke.points[0].position,
      stroke.radius * stroke.points[0].pressure,
      stroke.color,
    )
    return
  }

  for (let i = 0; i < stroke.points.length - 1; i += 1) {
    const current = stroke.points[i]
    const next = stroke.points[i + 1]
    appendSegment(
      vertices,
      current.position,
      next.position,
      stroke.radius * current.pressure,
      stroke.color,
      stroke.radius * next.pressure,
    )
  }

  for (const point of stroke.points) {
    appendDisc(vertices, point.position, stroke.radius * point.pressure, stroke.color)
  }
}

function appendSegment(
  vertices: number[],
  start: Vec3,
  end: Vec3,
  startRadius: number,
  color: Vec4,
  endRadius = startRadius,
) {
  const direction = sub3(end, start)
  const length = Math.hypot(direction[0], direction[1])
  if (length < 1e-5) return

  const normal: Vec3 = [-direction[1] / length, direction[0] / length, 0]
  const a = add3(start, scale3(normal, startRadius))
  const b = add3(start, scale3(normal, -startRadius))
  const c = add3(end, scale3(normal, endRadius))
  const dPoint = add3(end, scale3(normal, -endRadius))

  pushVertex(vertices, a, color)
  pushVertex(vertices, b, color)
  pushVertex(vertices, c, color)
  pushVertex(vertices, c, color)
  pushVertex(vertices, b, color)
  pushVertex(vertices, dPoint, color)
}

function appendDisc(vertices: number[], center: Vec3, radius: number, color: Vec4) {
  const segments = 14
  const safeRadius = Math.max(radius, 0.002)
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2
    const b = ((i + 1) / segments) * Math.PI * 2
    pushVertex(vertices, center, color)
    pushVertex(
      vertices,
      [center[0] + Math.cos(a) * safeRadius, center[1] + Math.sin(a) * safeRadius, center[2]],
      color,
    )
    pushVertex(
      vertices,
      [center[0] + Math.cos(b) * safeRadius, center[1] + Math.sin(b) * safeRadius, center[2]],
      color,
    )
  }
}

function pushVertex(vertices: number[], position: Vec3, color: Vec4) {
  vertices.push(
    position[0],
    position[1],
    position[2],
    color[0],
    color[1],
    color[2],
    color[3],
  )
}

export function shouldAppendPoint(points: StrokePoint[], point: StrokePoint) {
  const previous = points[points.length - 1]
  if (!previous) return true
  return distance3(previous.position, point.position) > 0.015
}

export function pointerPressure(event: PointerEvent) {
  if (event.pointerType === 'mouse') return event.buttons ? 0.72 : 0.5
  return clamp(event.pressure || 0.5, 0.08, 1)
}

export function smoothPoint(previous: Vec3, next: Vec3): Vec3 {
  const delta = sub3(next, previous)
  const direction = normalize3(delta)
  const distance = Math.min(distance3(previous, next), 0.08)
  return add3(previous, scale3(direction, distance))
}
