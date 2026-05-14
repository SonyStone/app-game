import tgpu, { type TgpuBuffer, type TgpuRenderPipeline, type TgpuRoot, type TgpuSampler } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { CanvasTransform } from '../types';

// ============================================================================
// MARK: Data Structures
// ============================================================================

/** Display uniforms - transform matrix */
const DisplayUniforms = d.struct({
  transform: d.mat4x4f,
  hasBrushOverlay: d.u32 // 0 = no overlay, 1 = has overlay
});

// ============================================================================
// MARK: Bind Group Layout
// ============================================================================

const displayBindGroupLayout = tgpu.bindGroupLayout({
  texSampler: { sampler: 'filtering' },
  canvasTexture: { texture: d.texture2d(d.f32) },
  brushTexture: { texture: d.texture2d(d.f32) },
  uniforms: { uniform: DisplayUniforms }
});

// ============================================================================
// MARK: Vertex Shader (WGSL template for arrays with transform)
// ============================================================================

const displayVertexShader = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { outPos: d.builtin.position, uv: d.vec2f }
}) /* wgsl */ `{
  var positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
  );
  
  var uvs = array<vec2f, 6>(
    vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0)
  );

  let pos = positions[in.vertexIndex];
  let transformedPos = uniforms.transform * vec4f(pos, 0.0, 1.0);
  return Out(transformedPos, uvs[in.vertexIndex]);
}`.$uses({
  uniforms: displayBindGroupLayout.bound.uniforms
});

// ============================================================================
// MARK: Fragment Shader (TypeScript function syntax with 'use gpu')
// ============================================================================

const displayFragmentShader = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f
})(({ uv }) => {
  'use gpu';

  const canvasColor = std.textureSample(
    displayBindGroupLayout.$.canvasTexture,
    displayBindGroupLayout.$.texSampler,
    uv
  );
  const brushColor = std.textureSample(displayBindGroupLayout.$.brushTexture, displayBindGroupLayout.$.texSampler, uv);
  const hasBrush = displayBindGroupLayout.$.uniforms.hasBrushOverlay;

  // Composite brush over canvas if active
  // brushColor is premultiplied, canvasColor is straight alpha
  const brushAlpha = brushColor.w;

  // Unpremultiply brush to get straight alpha
  const brushRgb = std.select(
    d.vec3f(0.0, 0.0, 0.0),
    d.vec3f(brushColor.x / brushAlpha, brushColor.y / brushAlpha, brushColor.z / brushAlpha),
    brushAlpha > 0.001
  );

  // Composite brush over canvas (both straight alpha now)
  const outAlpha = brushAlpha + canvasColor.w * (1.0 - brushAlpha);
  const outRgb = std.select(
    d.vec3f(0.0, 0.0, 0.0),
    std.div(
      std.add(
        std.mul(brushRgb, brushAlpha),
        std.mul(d.vec3f(canvasColor.x, canvasColor.y, canvasColor.z), std.mul(canvasColor.w, 1.0 - brushAlpha))
      ),
      outAlpha
    ),
    outAlpha > 0.001
  );
  const composited = d.vec4f(outRgb.x, outRgb.y, outRgb.z, outAlpha);

  // Select between composited (with brush) and canvas only based on hasBrush flag
  const color = std.select(canvasColor, composited, hasBrush === 1);

  // Checkerboard background for transparency
  const gridSize = d.f32(10.0);
  const dims = std.textureDimensions(displayBindGroupLayout.$.canvasTexture);
  const dimsF = d.vec2f(d.f32(dims.x), d.f32(dims.y));
  const gridPos = std.floor(std.mul(uv, std.div(dimsF, d.vec2f(gridSize, gridSize))));
  const checkerSum = d.i32(gridPos.x) + d.i32(gridPos.y);
  const checker = checkerSum % 2;
  const bgColor = std.select(d.vec3f(0.8, 0.8, 0.8), d.vec3f(0.9, 0.9, 0.9), checker === 0);

  // Blend canvas color over checkerboard
  const colorRgb = d.vec3f(color.x, color.y, color.z);
  const finalColor = std.mix(bgColor, colorRgb, color.w);

  return d.vec4f(finalColor.x, finalColor.y, finalColor.z, 1.0);
});

// ============================================================================
// MARK: DisplayPass Class
// ============================================================================

/**
 * Renders the accumulated canvas texture to the screen with transform (pan/zoom/rotate).
 */
export class DisplayPass {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipeline: TgpuRenderPipeline<any>;
  private sampler: TgpuSampler;
  private uniformBuffer: TgpuBuffer<typeof DisplayUniforms>;
  private dummyTexture: GPUTexture;
  private dummyTextureView: GPUTextureView;

  constructor(
    private readonly root: TgpuRoot,
    private readonly format: GPUTextureFormat
  ) {
    // Create sampler using TypeGPU
    this.sampler = root['~unstable'].createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });

    // Create uniform buffer for transform matrix using TypeGPU
    this.uniformBuffer = root
      .createBuffer(DisplayUniforms, {
        transform: d.mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1),
        hasBrushOverlay: 0
      })
      .$usage('uniform');

    // Create a 1x1 transparent dummy texture for when no brush overlay is provided
    this.dummyTexture = root.device.createTexture({
      size: [1, 1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    this.dummyTextureView = this.dummyTexture.createView();
    // Initialize to transparent
    root.device.queue.writeTexture(
      { texture: this.dummyTexture },
      new Uint8Array([0, 0, 0, 0]),
      { bytesPerRow: 4 },
      [1, 1, 1]
    );

    // Create pipeline using TypeGPU
    this.pipeline = root['~unstable']
      .withVertex(displayVertexShader, {})
      .withFragment(displayFragmentShader, { format: this.format })
      .withPrimitive({ topology: 'triangle-list' })
      .createPipeline();
  }

  /**
   * Update the transform matrix
   * @param transform - The canvas transform (pan, zoom, rotation)
   * @param displayWidth - The display/window width
   * @param displayHeight - The display/window height
   * @param canvasWidth - The drawing canvas width (default: displayWidth)
   * @param canvasHeight - The drawing canvas height (default: displayHeight)
   */
  updateTransform(
    transform: CanvasTransform,
    displayWidth: number,
    displayHeight: number,
    canvasWidth?: number,
    canvasHeight?: number
  ): void {
    const { panX, panY, zoom, rotation } = transform;

    // Use provided canvas dimensions or fall back to display dimensions
    const cw = canvasWidth ?? displayWidth;
    const ch = canvasHeight ?? displayHeight;

    const cos_r = Math.cos(rotation);
    const sin_r = Math.sin(rotation);

    // Normalized pan values (relative to display size)
    const px = (panX / displayWidth) * 2;
    const py = -(panY / displayHeight) * 2;

    // Calculate aspect ratios
    const displayAspect = displayWidth / displayHeight;
    const canvasAspect = cw / ch;

    // Calculate uniform scale to fit canvas in display
    // Using uniform scale ensures rotation doesn't cause distortion
    let baseScale: number;
    if (displayAspect > canvasAspect) {
      // Display is wider - fit by height
      baseScale = 1.0;
    } else {
      // Display is taller - fit by width
      baseScale = displayAspect / canvasAspect;
    }

    const scale = baseScale * zoom;

    // Aspect ratio correction (applied AFTER rotation to map to NDC)
    // This stretches/squeezes to fit display aspect ratio
    const aspectX = displayAspect > canvasAspect ? canvasAspect / displayAspect : 1.0;
    const aspectY = displayAspect > canvasAspect ? 1.0 : displayAspect / canvasAspect;

    // Build transform: M = Translation * Aspect * Rotation * Scale
    // For a point p: result = M * p
    //
    // Rotation * Scale (uniform):
    // | s*cos  -s*sin |
    // | s*sin   s*cos |
    //
    // Aspect * (Rotation * Scale):
    // | ax*s*cos  -ax*s*sin |
    // | ay*s*sin   ay*s*cos |
    //
    const transformMatrix = d.mat4x4f(
      aspectX * scale * cos_r,
      aspectY * scale * sin_r,
      0,
      0,
      -aspectX * scale * sin_r,
      aspectY * scale * cos_r,
      0,
      0,
      0,
      0,
      1,
      0,
      px,
      py,
      0,
      1
    );
    this.lastTransform = { transform: transformMatrix };
    this.uniformBuffer.write({
      transform: transformMatrix,
      hasBrushOverlay: this.hasBrushOverlay ? 1 : 0
    });
  }

  private hasBrushOverlay = false;
  private currentBrushTextureView: GPUTextureView | null = null;
  private lastTransform: { transform: ReturnType<typeof d.mat4x4f> } | null = null;

  /**
   * Check if brush overlay is currently active
   */
  get hasBrushOverlayActive(): boolean {
    return this.hasBrushOverlay;
  }

  /**
   * Set the brush overlay texture for preview during stroke
   */
  setBrushOverlay(textureView: GPUTextureView | null): void {
    this.hasBrushOverlay = textureView !== null;
    this.currentBrushTextureView = textureView;
    // Update uniform buffer with new hasBrushOverlay value
    if (this.lastTransform) {
      this.uniformBuffer.write({
        ...this.lastTransform,
        hasBrushOverlay: this.hasBrushOverlay ? 1 : 0
      });
    }
  }

  /**
   * Render the canvas texture to the screen
   */
  render(_encoder: GPUCommandEncoder, canvasTextureView: GPUTextureView, outputView: GPUTextureView): void {
    // Create bind group using TypeGPU
    const bindGroup = this.root.createBindGroup(displayBindGroupLayout, {
      texSampler: this.sampler,
      canvasTexture: canvasTextureView,
      brushTexture: this.currentBrushTextureView ?? this.dummyTextureView,
      uniforms: this.root.unwrap(this.uniformBuffer)
    });

    // Render using TypeGPU pipeline
    this.pipeline
      .withColorAttachment({
        view: outputView,
        loadOp: 'clear',
        clearValue: { r: 0.15, g: 0.15, b: 0.15, a: 1 },
        storeOp: 'store'
      })
      .with(bindGroup)
      .draw(6);
  }

  /**
   * Destroy resources
   */
  destroy(): void {
    // Resources cleaned up by GC
  }
}
