import tgpu, { type TgpuRenderPipeline, type TgpuRoot, type TgpuSampler, type TgpuTexture } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { RENDER_TARGET_FORMAT } from '../constants';
import { BlendMode, ColorBlendMode } from '../types';
import { SwapBuffer } from './SwapBuffer';

// ============================================================================
// MARK: TypeGPU Shader Functions for Blending
// ============================================================================

/** Convert from gamma (sRGB) to linear color space */
const gammaToLinear = tgpu.fn(
  [d.vec3f],
  d.vec3f
)((color) => {
  'use gpu';
  return std.pow(color, d.vec3f(2.2, 2.2, 2.2));
});

/** Convert from linear to gamma (sRGB) color space */
const linearToGamma = tgpu.fn(
  [d.vec3f],
  d.vec3f
)((color) => {
  'use gpu';
  return std.pow(color, d.vec3f(1.0 / 2.2, 1.0 / 2.2, 1.0 / 2.2));
});

/** Convert RGB to HSV color space */
const rgbToHsv = tgpu.fn([d.vec3f], d.vec3f) /* wgsl */ `(rgb) {
  let K = vec4f(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = mix(vec4f(rgb.bg, K.wz), vec4f(rgb.gb, K.xy), step(rgb.b, rgb.g));
  let q = mix(vec4f(p.xyw, rgb.r), vec4f(rgb.r, p.yzx), step(p.x, rgb.r));
  let d = q.x - min(q.w, q.y);
  let e = 1.0e-10;
  return vec3f(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}`;

/** Convert HSV to RGB color space */
const hsvToRgb = tgpu.fn([d.vec3f], d.vec3f) /* wgsl */ `(hsv) {
  let K = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(hsv.xxx + K.xyz) * 6.0 - K.www);
  return hsv.z * mix(K.xxx, clamp(p - K.xxx, vec3f(0.0), vec3f(1.0)), hsv.y);
}`;

/** Normal blend mode: standard alpha compositing */
const blendNormal = tgpu.fn([d.vec4f, d.vec4f], d.vec4f) /* wgsl */ `(src, dst) {
  let outAlpha = src.a + dst.a * (1.0 - src.a);
  if (outAlpha < 0.0001) {
    return vec4f(0.0);
  }
  let outRgb = (src.rgb * src.a + dst.rgb * dst.a * (1.0 - src.a)) / outAlpha;
  return vec4f(outRgb, outAlpha);
}`;

/** Multiply blend mode: darkens by multiplying colors */
const blendMultiply = tgpu.fn([d.vec4f, d.vec4f], d.vec4f) /* wgsl */ `(src, dst) {
  let blended = src.rgb * dst.rgb;
  let outAlpha = src.a + dst.a * (1.0 - src.a);
  if (outAlpha < 0.0001) {
    return vec4f(0.0);
  }
  let outRgb = mix(dst.rgb, blended, src.a);
  return vec4f(outRgb, outAlpha);
}`;

/** Screen blend mode: lightens by inverting, multiplying, and inverting */
const blendScreen = tgpu.fn([d.vec4f, d.vec4f], d.vec4f) /* wgsl */ `(src, dst) {
  let blended = 1.0 - (1.0 - src.rgb) * (1.0 - dst.rgb);
  let outAlpha = src.a + dst.a * (1.0 - src.a);
  if (outAlpha < 0.0001) {
    return vec4f(0.0);
  }
  let outRgb = mix(dst.rgb, blended, src.a);
  return vec4f(outRgb, outAlpha);
}`;

/** Overlay blend mode: combines multiply and screen */
const blendOverlay = tgpu.fn([d.vec4f, d.vec4f], d.vec4f) /* wgsl */ `(src, dst) {
  let condition = step(dst.rgb, vec3f(0.5));
  let blended = mix(
    1.0 - 2.0 * (1.0 - src.rgb) * (1.0 - dst.rgb),
    2.0 * src.rgb * dst.rgb,
    condition
  );
  let outAlpha = src.a + dst.a * (1.0 - src.a);
  if (outAlpha < 0.0001) {
    return vec4f(0.0);
  }
  let outRgb = mix(dst.rgb, blended, src.a);
  return vec4f(outRgb, outAlpha);
}`;

// ============================================================================
// MARK: Bind Group Layout for Blend Pass
// ============================================================================

const blendBindGroupLayout = tgpu.bindGroupLayout({
  texSampler: { sampler: 'filtering' },
  brushTexture: { texture: d.texture2d(d.f32) },
  canvasTexture: { texture: d.texture2d(d.f32) }
});

// ============================================================================
// MARK: Vertex Shader
// ============================================================================

const blendVertexShader = tgpu['~unstable'].vertexFn({
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

  return Out(vec4f(positions[in.vertexIndex], 0.0, 1.0), uvs[in.vertexIndex]);
}`;

// ============================================================================
// MARK: Fragment Shader Factory Functions
// ============================================================================

/**
 * Create fragment shader with specific blend and color modes
 * Note: brushTexture input is premultiplied alpha (rgb * alpha, alpha) from MAX blending
 */
function createFragmentShader(blendMode: BlendMode, colorBlendMode: ColorBlendMode) {
  // Select blend function based on mode
  const blendFn = (() => {
    switch (blendMode) {
      case BlendMode.MULTIPLY:
        return blendMultiply;
      case BlendMode.SCREEN:
        return blendScreen;
      case BlendMode.OVERLAY:
        return blendOverlay;
      case BlendMode.NORMAL:
      default:
        return blendNormal;
    }
  })();

  // Create different fragment shaders based on color blend mode
  if (colorBlendMode === ColorBlendMode.LINEAR) {
    return tgpu['~unstable'].fragmentFn({
      in: { uv: d.vec2f },
      out: d.vec4f
    })(({ uv }) => {
      'use gpu';
      const srcColorPremul = std.textureSample(
        blendBindGroupLayout.$.brushTexture,
        blendBindGroupLayout.$.texSampler,
        uv
      );
      const dstColor = std.textureSample(blendBindGroupLayout.$.canvasTexture, blendBindGroupLayout.$.texSampler, uv);

      // Unpremultiply the source color (brush texture uses premultiplied alpha)
      let srcColor = d.vec4f(srcColorPremul);
      if (srcColorPremul.w > 0.001) {
        srcColor = d.vec4f(
          srcColorPremul.x / srcColorPremul.w,
          srcColorPremul.y / srcColorPremul.w,
          srcColorPremul.z / srcColorPremul.w,
          srcColorPremul.w
        );
      }

      // Convert to linear space - use x,y,z,w instead of rgb,a swizzle
      const srcRgb = d.vec3f(srcColor.x, srcColor.y, srcColor.z);
      const dstRgb = d.vec3f(dstColor.x, dstColor.y, dstColor.z);
      const srcLinear = d.vec4f(gammaToLinear(srcRgb).x, gammaToLinear(srcRgb).y, gammaToLinear(srcRgb).z, srcColor.w);
      const dstLinear = d.vec4f(gammaToLinear(dstRgb).x, gammaToLinear(dstRgb).y, gammaToLinear(dstRgb).z, dstColor.w);

      // Blend
      const blended = blendFn(srcLinear, dstLinear);

      // Convert back to gamma space
      const blendedRgb = d.vec3f(blended.x, blended.y, blended.z);
      const resultRgb = linearToGamma(blendedRgb);
      return d.vec4f(resultRgb.x, resultRgb.y, resultRgb.z, blended.w);
    });
  } else if (colorBlendMode === ColorBlendMode.HSV) {
    return tgpu['~unstable'].fragmentFn({
      in: { uv: d.vec2f },
      out: d.vec4f
    })(({ uv }) => {
      'use gpu';
      const srcColorPremul = std.textureSample(
        blendBindGroupLayout.$.brushTexture,
        blendBindGroupLayout.$.texSampler,
        uv
      );
      const dstColor = std.textureSample(blendBindGroupLayout.$.canvasTexture, blendBindGroupLayout.$.texSampler, uv);

      // Unpremultiply the source color (brush texture uses premultiplied alpha)
      let srcColor = d.vec4f(srcColorPremul);
      if (srcColorPremul.w > 0.001) {
        srcColor = d.vec4f(
          srcColorPremul.x / srcColorPremul.w,
          srcColorPremul.y / srcColorPremul.w,
          srcColorPremul.z / srcColorPremul.w,
          srcColorPremul.w
        );
      }

      // Convert to HSV space - use x,y,z,w instead of rgb,a swizzle
      const srcRgb = d.vec3f(srcColor.x, srcColor.y, srcColor.z);
      const dstRgb = d.vec3f(dstColor.x, dstColor.y, dstColor.z);
      const srcHsvVec = rgbToHsv(srcRgb);
      const dstHsvVec = rgbToHsv(dstRgb);
      const srcHsv = d.vec4f(srcHsvVec.x, srcHsvVec.y, srcHsvVec.z, srcColor.w);
      const dstHsv = d.vec4f(dstHsvVec.x, dstHsvVec.y, dstHsvVec.z, dstColor.w);

      // Blend
      const blended = blendFn(srcHsv, dstHsv);

      // Convert back to RGB space
      const blendedHsv = d.vec3f(blended.x, blended.y, blended.z);
      const resultRgb = hsvToRgb(blendedHsv);
      return d.vec4f(resultRgb.x, resultRgb.y, resultRgb.z, blended.w);
    });
  } else {
    // Gamma (default) - no conversion needed
    return tgpu['~unstable'].fragmentFn({
      in: { uv: d.vec2f },
      out: d.vec4f
    })(({ uv }) => {
      'use gpu';
      const srcColorPremul = std.textureSample(
        blendBindGroupLayout.$.brushTexture,
        blendBindGroupLayout.$.texSampler,
        uv
      );
      const dstColor = std.textureSample(blendBindGroupLayout.$.canvasTexture, blendBindGroupLayout.$.texSampler, uv);

      // Unpremultiply the source color (brush texture uses premultiplied alpha)
      let srcColor = d.vec4f(srcColorPremul);
      if (srcColorPremul.w > 0.001) {
        srcColor = d.vec4f(
          srcColorPremul.x / srcColorPremul.w,
          srcColorPremul.y / srcColorPremul.w,
          srcColorPremul.z / srcColorPremul.w,
          srcColorPremul.w
        );
      }

      // Blend directly in gamma space
      return blendFn(srcColor, dstColor);
    });
  }
}

// ============================================================================
// MARK: BlendPass Class
// ============================================================================

/**
 * Blend pass that composites brush strokes onto the canvas
 * with support for different blend modes and color spaces.
 *
 * Implemented using TypeGPU for type-safe GPU programming.
 */
export class BlendPass {
  // Use any for pipeline type to avoid TypeGPU type inference issues
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipeline: TgpuRenderPipeline<any> | null = null;
  private sampler: TgpuSampler;

  private currentBlendMode: BlendMode = BlendMode.NORMAL;
  private currentColorBlendMode: ColorBlendMode = ColorBlendMode.GAMMA;

  constructor(private readonly root: TgpuRoot) {
    // Create sampler for texture sampling using TypeGPU
    this.sampler = root['~unstable'].createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });

    // Build initial pipeline
    this.rebuildPipeline();
  }

  /**
   * Rebuild pipeline when blend mode or color blend mode changes
   */
  private rebuildPipeline(): void {
    const fragmentShader = createFragmentShader(this.currentBlendMode, this.currentColorBlendMode);

    this.pipeline = this.root['~unstable']
      .withVertex(blendVertexShader, {})
      .withFragment(fragmentShader, { format: RENDER_TARGET_FORMAT })
      .withPrimitive({ topology: 'triangle-list' })
      .createPipeline();
  }

  /**
   * Set blend mode (rebuilds pipeline if changed)
   */
  setBlendMode(mode: BlendMode): void {
    if (mode !== this.currentBlendMode) {
      this.currentBlendMode = mode;
      this.rebuildPipeline();
    }
  }

  /**
   * Set color blend mode (rebuilds pipeline if changed)
   */
  setColorBlendMode(mode: ColorBlendMode): void {
    if (mode !== this.currentColorBlendMode) {
      this.currentColorBlendMode = mode;
      this.rebuildPipeline();
    }
  }

  /**
   * Render blend pass: composite brush strokes onto canvas
   * @param _encoder - Command encoder (unused, kept for API compatibility)
   * @param brushTextureView - The brush stroke texture view
   * @param swapBuffer - The swap buffer for ping-pong rendering
   */
  render(_encoder: GPUCommandEncoder, brushTextureView: GPUTextureView, swapBuffer: SwapBuffer): void {
    if (!this.pipeline) return;

    // Create bind group with current textures
    const bindGroup = this.root.createBindGroup(blendBindGroupLayout, {
      texSampler: this.sampler,
      brushTexture: brushTextureView,
      canvasTexture: swapBuffer.read.view
    });

    // Execute render pipeline with TypeGPU
    this.pipeline
      .withColorAttachment({
        view: swapBuffer.write.view,
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: 'store'
      })
      .with(bindGroup)
      .draw(6);

    // Swap buffers
    swapBuffer.swap();
  }

  /**
   * Render blend pass with TgpuTexture (creates view automatically)
   */
  renderWithTexture(brushTexture: TgpuTexture, swapBuffer: SwapBuffer): void {
    if (!this.pipeline) return;

    // Create view from TypeGPU texture by unwrapping first
    const brushTextureView = this.root.unwrap(brushTexture).createView();

    // Create bind group with current textures
    const bindGroup = this.root.createBindGroup(blendBindGroupLayout, {
      texSampler: this.sampler,
      brushTexture: brushTextureView,
      canvasTexture: swapBuffer.read.view
    });

    // Execute render pipeline with TypeGPU
    this.pipeline
      .withColorAttachment({
        view: swapBuffer.write.view,
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: 'store'
      })
      .with(bindGroup)
      .draw(6);

    // Swap buffers
    swapBuffer.swap();
  }

  /**
   * Get current blend mode
   */
  get blendMode(): BlendMode {
    return this.currentBlendMode;
  }

  /**
   * Get current color blend mode
   */
  get colorBlendMode(): ColorBlendMode {
    return this.currentColorBlendMode;
  }
}
