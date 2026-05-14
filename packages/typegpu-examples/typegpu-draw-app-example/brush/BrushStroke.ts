import { type TgpuBuffer, type TgpuRenderPipeline, type TgpuRoot, type TgpuSampler, type TgpuTexture } from 'typegpu';
import * as d from 'typegpu/data';
import { MAX_BRUSH_INSTANCES, RENDER_TARGET_FORMAT } from '../constants';
import { StrokePoint, hexToRgb } from '../types';
import {
  BrushInstance,
  BrushUniforms,
  brushBindGroupLayout,
  brushFragmentShader,
  brushVertexShader
} from './BrushShaders';
import { BrushTexture } from './BrushTexture';

interface BrushSettings {
  color: string;
  size: number;
  opacity: number;
  hardness: number;
}

/**
 * Manages instanced brush stroke rendering to a texture.
 * Uses GPU-generated brush texture for smooth soft brushes.
 */
export class BrushStroke {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipeline: TgpuRenderPipeline<any>;
  private uniformBuffer: TgpuBuffer<typeof BrushUniforms>;
  private instanceBuffer: TgpuBuffer<ReturnType<typeof d.arrayOf<typeof BrushInstance>>>;
  private sampler: TgpuSampler;

  // Brush texture generator
  private brushTexture: BrushTexture;

  private pendingInstances: Float32Array;
  private instanceCount: number = 0;

  private renderTexture: TgpuTexture<{ size: [number, number]; format: typeof RENDER_TARGET_FORMAT }>;

  private currentSettings: BrushSettings = {
    color: '#000000',
    size: 20,
    opacity: 1,
    hardness: 0.5
  };

  constructor(
    private readonly root: TgpuRoot,
    private width: number,
    private height: number
  ) {
    // Create brush texture generator
    this.brushTexture = new BrushTexture(root, 128);

    // Create uniform buffer using TypeGPU
    this.uniformBuffer = root
      .createBuffer(BrushUniforms, {
        canvasSize: d.vec2f(width, height),
        _padding: d.vec2f(0, 0)
      })
      .$usage('uniform');

    // Create instance buffer using TypeGPU
    const InstanceArray = d.arrayOf(BrushInstance, MAX_BRUSH_INSTANCES);
    this.instanceBuffer = root.createBuffer(InstanceArray).$usage('storage');

    // CPU-side instance data (12 floats per instance)
    this.pendingInstances = new Float32Array(MAX_BRUSH_INSTANCES * 12);

    // Create render target texture using TypeGPU
    this.renderTexture = root['~unstable']
      .createTexture({
        size: [width, height],
        format: RENDER_TARGET_FORMAT
      })
      .$usage('render', 'sampled');

    // Create sampler using TypeGPU
    this.sampler = root['~unstable'].createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });

    // Create render pipeline using TypeGPU
    // Use MAX blending for both color and alpha to prevent stamps within a batch from accumulating
    // This ensures overlapping stamps don't get darker than a single stamp
    // The brush texture acts as a "wet paint" layer where stamps merge without darkening
    this.pipeline = root['~unstable']
      .withVertex(brushVertexShader, {})
      .withFragment(brushFragmentShader, {
        format: RENDER_TARGET_FORMAT,
        blend: {
          color: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
          alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'max' }
        }
      })
      .withPrimitive({ topology: 'triangle-list' })
      .createPipeline();

    // Generate initial brush texture
    this.updateBrushTexture(this.currentSettings.hardness);
  }

  /**
   * Update brush texture with new hardness
   */
  updateBrushTexture(hardness: number): void {
    this.brushTexture.generate(hardness);
  }

  /**
   * Set brush settings
   */
  setBrushSettings(settings: Partial<BrushSettings>): void {
    const oldHardness = this.currentSettings.hardness;
    this.currentSettings = { ...this.currentSettings, ...settings };

    // Update brush texture if hardness changed
    if (settings.hardness !== undefined && settings.hardness !== oldHardness) {
      this.updateBrushTexture(settings.hardness);
    }
  }

  /**
   * Add stroke points to the pending instances
   */
  addStrokePoints(points: StrokePoint[]): void {
    const rgb = hexToRgb(this.currentSettings.color);
    const baseAlpha = this.currentSettings.opacity;
    const size = this.currentSettings.size;

    for (const point of points) {
      if (this.instanceCount >= MAX_BRUSH_INSTANCES) {
        console.warn('Max brush instances reached');
        break;
      }

      const offset = this.instanceCount * 12;

      // position
      this.pendingInstances[offset + 0] = point.x;
      this.pendingInstances[offset + 1] = point.y;

      // size (affected by pressure)
      this.pendingInstances[offset + 2] = size * (0.5 + point.pressure * 0.5);

      // rotation
      this.pendingInstances[offset + 3] = 0; // Could add rotation based on direction

      // color (RGBA)
      this.pendingInstances[offset + 4] = rgb.r;
      this.pendingInstances[offset + 5] = rgb.g;
      this.pendingInstances[offset + 6] = rgb.b;
      this.pendingInstances[offset + 7] = baseAlpha;

      // pressure
      this.pendingInstances[offset + 8] = point.pressure;

      // padding
      this.pendingInstances[offset + 9] = 0;
      this.pendingInstances[offset + 10] = 0;
      this.pendingInstances[offset + 11] = 0;

      this.instanceCount++;
    }
  }

  /**
   * Render pending instances to the brush texture
   * @param accumulate - If true, adds stamps to existing content (for stroke preview). If false, clears first.
   */
  render(accumulate: boolean = false): GPUTextureView | null {
    if (this.instanceCount === 0) {
      return null;
    }

    const device = this.root.device;

    // Upload instance data
    const dataToUpload = new Float32Array(this.pendingInstances.subarray(0, this.instanceCount * 12));
    device.queue.writeBuffer(this.root.unwrap(this.instanceBuffer), 0, dataToUpload);

    // Create bind group using TypeGPU
    const bindGroup = this.root.createBindGroup(brushBindGroupLayout, {
      uniforms: this.root.unwrap(this.uniformBuffer),
      instances: this.root.unwrap(this.instanceBuffer),
      brushTexture: this.brushTexture.view,
      brushSampler: this.sampler
    });

    // Render using TypeGPU pipeline
    const renderTextureView = this.root.unwrap(this.renderTexture).createView();
    this.pipeline
      .withColorAttachment({
        view: renderTextureView,
        loadOp: accumulate ? 'load' : 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: 'store'
      })
      .with(bindGroup)
      .draw(6, this.instanceCount);

    return renderTextureView;
  }

  /**
   * Clear pending instances after rendering
   */
  clearPending(): void {
    this.instanceCount = 0;
  }

  /**
   * Clear the render texture (for starting a new stroke)
   */
  clearTexture(): void {
    const device = this.root.device;
    const encoder = device.createCommandEncoder();
    const renderTextureView = this.root.unwrap(this.renderTexture).createView();

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: renderTextureView,
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          storeOp: 'store'
        }
      ]
    });
    pass.end();

    device.queue.submit([encoder.finish()]);
  }

  /**
   * Get the number of pending instances
   */
  get pendingCount(): number {
    return this.instanceCount;
  }

  /**
   * Resize the render target
   */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;

    this.width = width;
    this.height = height;

    // Destroy old texture
    this.renderTexture.destroy();

    // Create new texture using TypeGPU
    this.renderTexture = this.root['~unstable']
      .createTexture({
        size: [width, height],
        format: RENDER_TARGET_FORMAT
      })
      .$usage('render', 'sampled');

    // Update uniforms
    this.uniformBuffer.write({
      canvasSize: d.vec2f(width, height),
      _padding: d.vec2f(0, 0)
    });
  }

  /**
   * Get render texture view
   */
  get textureView(): GPUTextureView {
    return this.root.unwrap(this.renderTexture).createView();
  }

  /**
   * Destroy resources
   */
  destroy(): void {
    this.renderTexture.destroy();
    this.brushTexture.destroy();
  }
}
