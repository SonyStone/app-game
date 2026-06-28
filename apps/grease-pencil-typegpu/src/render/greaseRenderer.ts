import tgpu, { d, type TgpuRoot } from 'typegpu'
import type {
  DrawingWorkplane,
  RenderLayer,
  Stroke,
  StrokeId,
} from '../document'
import {
  add3,
  clamp,
  createCameraMatrices,
  dot3,
  getCameraBasis,
  scale3,
  sub3,
  transformMat4,
  type CameraState,
  type Vec3,
} from './math'
import {
  buildDrawingVertices,
  FLOATS_PER_VERTEX,
  type StrokePointOverlay,
} from './meshBuilder'
import { getWorkplaneBasis } from './workplane'

export { pointerPressure, shouldAppendPoint, smoothPoint } from './input'
export type { StrokePointOverlay } from './meshBuilder'

export type RendererStatus = {
  ok: boolean
  message: string
}

const DrawingVertex = d.unstruct({
  position: d.location(0, d.float32x3),
  color: d.location(1, d.float32x4),
})

const drawingVertexLayout = tgpu.vertexLayout(d.disarrayOf(DrawingVertex))
const DEFAULT_WORKPLANE: DrawingWorkplane = {
  origin: [0, 0, 0],
  rotation: [0, 0, 0],
  gridScale: 1,
}

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
  private layers: RenderLayer[] = []
  private workplane: DrawingWorkplane = DEFAULT_WORKPLANE
  private draftStroke?: Stroke
  private selectedStrokeIds = new Set<StrokeId>()
  private pointOverlays: StrokePointOverlay[] = []
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

  setScene(
    layers: RenderLayer[],
    workplane: DrawingWorkplane,
    draftStroke?: Stroke,
    selectedStrokeIds: ReadonlySet<StrokeId> = new Set<StrokeId>(),
    pointOverlays: readonly StrokePointOverlay[] = [],
  ) {
    this.layers = layers
    this.workplane = workplane
    this.draftStroke = draftStroke
    this.selectedStrokeIds = new Set(selectedStrokeIds)
    this.pointOverlays = [...pointOverlays]
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
    const basis = getWorkplaneBasis(this.workplane)
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
    const denominator = dot3(ray, basis.normal)
    if (Math.abs(denominator) < 1e-6) return

    const t = dot3(sub3(basis.origin, nearPoint), basis.normal) / denominator
    return add3(nearPoint, scale3(ray, t))
  }

  offsetFromWorkplane(position: Vec3, distance: number): Vec3 {
    return add3(position, scale3(getWorkplaneBasis(this.workplane).normal, distance))
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

    const vertices = buildDrawingVertices({
      layers: this.layers,
      workplane: this.workplane,
      draftStroke: this.draftStroke,
      selectedStrokeIds: this.selectedStrokeIds,
      pointOverlays: this.pointOverlays,
    })

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
