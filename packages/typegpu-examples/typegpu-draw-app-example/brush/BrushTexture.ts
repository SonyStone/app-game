import tgpu, { type TgpuBuffer, type TgpuRoot, type TgpuTexture } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

// ============================================================================
// MARK: Data Structures
// ============================================================================

/** Brush generation parameters */
const BrushParams = d.struct({
  hardness: d.f32,
  size: d.f32,
  _padding: d.vec2f
});

// ============================================================================
// MARK: Bind Group Layout
// ============================================================================

const brushComputeBindGroupLayout = tgpu.bindGroupLayout({
  outputTexture: { storageTexture: 'rgba8unorm', access: 'writeonly' },
  params: { uniform: BrushParams }
});

// ============================================================================
// MARK: Compute Shader (TypeGPU with 'use gpu')
// ============================================================================

const brushComputeShader = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [8, 8, 1]
})(({ gid }) => {
  'use gpu';

  const texSize = std.textureDimensions(brushComputeBindGroupLayout.$.outputTexture);
  const params = brushComputeBindGroupLayout.$.params;

  // Early exit if outside texture bounds
  if (gid.x >= texSize.x || gid.y >= texSize.y) {
    return;
  }

  // Normalize coordinates to -1 to 1
  const uvX = (d.f32(gid.x) / d.f32(texSize.x)) * 2.0 - 1.0;
  const uvY = (d.f32(gid.y) / d.f32(texSize.y)) * 2.0 - 1.0;
  const uv = d.vec2f(uvX, uvY);

  // Calculate distance from center
  const dist = std.length(uv);

  // Apply hardness-based falloff
  const inner = params.hardness * 0.8;
  const outer = d.f32(1.0);

  // Smooth falloff - use conditional logic with explicit f32 types
  let alpha = d.f32(0.0);
  if (dist < inner) {
    alpha = d.f32(1.0);
  } else if (dist < outer) {
    const t = (dist - inner) / (outer - inner);
    const smoothT = t * t * (d.f32(3.0) - d.f32(2.0) * t);
    alpha = d.f32(1.0) - smoothT;
  }

  // Apply gamma for perceptual smoothness
  alpha = std.pow(alpha, d.f32(1.0 / 2.2));

  // Store as white with alpha
  std.textureStore(
    brushComputeBindGroupLayout.$.outputTexture,
    d.vec2i(d.i32(gid.x), d.i32(gid.y)),
    d.vec4f(1.0, 1.0, 1.0, alpha)
  );
});

// ============================================================================
// MARK: BrushTexture Class
// ============================================================================

/**
 * Generates procedural brush textures on the GPU.
 * Creates circular brush spots with controllable hardness.
 */
export class BrushTexture {
  private texture: TgpuTexture<{ size: [number, number]; format: 'rgba8unorm' }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipeline: any;
  private paramsBuffer: TgpuBuffer<typeof BrushParams>;

  readonly size: number;

  constructor(
    private readonly root: TgpuRoot,
    size: number = 128
  ) {
    this.size = size;

    // Create the brush texture using TypeGPU
    this.texture = root['~unstable']
      .createTexture({
        size: [size, size],
        format: 'rgba8unorm'
      })
      .$usage('storage', 'sampled');

    // Create params buffer using TypeGPU
    this.paramsBuffer = root
      .createBuffer(BrushParams, {
        hardness: 0.5,
        size: size,
        _padding: d.vec2f(0, 0)
      })
      .$usage('uniform');

    // Create compute pipeline using TypeGPU
    this.pipeline = root['~unstable'].withCompute(brushComputeShader).createPipeline();

    // Generate initial brush with default hardness
    this.generate(0.5);
  }

  /**
   * Generate a brush texture with the given hardness
   */
  generate(hardness: number): void {
    // Update params buffer
    this.paramsBuffer.write({
      hardness: Math.max(0, Math.min(1, hardness)),
      size: this.size,
      _padding: d.vec2f(0, 0)
    });

    // Create bind group using TypeGPU
    const bindGroup = this.root.createBindGroup(brushComputeBindGroupLayout, {
      outputTexture: this.root.unwrap(this.texture).createView(),
      params: this.root.unwrap(this.paramsBuffer)
    });

    // Run compute shader using TypeGPU pipeline
    this.pipeline.with(bindGroup).dispatchWorkgroups(Math.ceil(this.size / 8), Math.ceil(this.size / 8));
  }

  /**
   * Get the texture view for sampling
   */
  get view(): GPUTextureView {
    return this.root.unwrap(this.texture).createView();
  }

  /**
   * Get the TypeGPU texture
   */
  get tgpuTexture(): TgpuTexture<{ size: [number, number]; format: 'rgba8unorm' }> {
    return this.texture;
  }

  /**
   * Destroy the texture
   */
  destroy(): void {
    this.texture.destroy();
  }
}
