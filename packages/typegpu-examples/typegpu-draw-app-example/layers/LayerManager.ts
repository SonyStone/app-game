/**
 * TypeGPU Drawing Framework - Layer Manager
 *
 * Manages the layer stack, layer textures, and compositing.
 * Each layer has its own texture that can be drawn to independently.
 */

import type { TgpuRoot, TgpuTexture } from 'typegpu';
import { RENDER_TARGET_FORMAT } from '../constants';
import type { Layer } from '../core/types';

/** Layer texture format */
type LayerTexture = TgpuTexture<{ size: [number, number]; format: typeof RENDER_TARGET_FORMAT }>;

/** Layer with texture */
export interface LayerWithTexture extends Omit<Layer, 'texture'> {
  texture: LayerTexture;
  textureView: GPUTextureView;
}

/**
 * Layer Manager - manages layer stack and textures.
 */
export class LayerManager {
  private layers: Map<string, LayerWithTexture> = new Map();
  private layerOrder: string[] = [];
  private _activeLayerId: string | null = null;

  constructor(
    private readonly root: TgpuRoot,
    private width: number,
    private height: number
  ) {}

  // ============================================================================
  // MARK: Layer Creation
  // ============================================================================

  /**
   * Create a new layer and add it to the stack.
   */
  createLayer(options?: Partial<Omit<Layer, 'id' | 'texture'>>): LayerWithTexture {
    const id = crypto.randomUUID();
    const name = options?.name ?? `Layer ${this.layers.size + 1}`;

    // Create layer texture
    const texture = this.root['~unstable']
      .createTexture({
        size: [this.width, this.height],
        format: RENDER_TARGET_FORMAT
      })
      .$usage('render', 'sampled');

    const textureView = this.root.unwrap(texture).createView();

    // Clear texture to transparent
    this.clearLayerTexture(texture);

    const layer: LayerWithTexture = {
      id,
      name,
      visible: options?.visible ?? true,
      opacity: options?.opacity ?? 1,
      blendMode: options?.blendMode ?? 'normal',
      locked: options?.locked ?? false,
      texture,
      textureView
    };

    this.layers.set(id, layer);
    this.layerOrder.push(id);

    // Set as active if first layer
    if (this._activeLayerId === null) {
      this._activeLayerId = id;
    }

    return layer;
  }

  /**
   * Remove a layer from the stack.
   */
  removeLayer(id: string): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;

    // Destroy texture
    layer.texture.destroy();

    // Remove from maps
    this.layers.delete(id);
    this.layerOrder = this.layerOrder.filter((layerId) => layerId !== id);

    // Update active layer if needed
    if (this._activeLayerId === id) {
      this._activeLayerId = this.layerOrder[this.layerOrder.length - 1] ?? null;
    }

    return true;
  }

  /**
   * Clear a layer's texture to transparent.
   */
  private clearLayerTexture(texture: LayerTexture): void {
    const device = this.root.device;
    const encoder = device.createCommandEncoder();

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.root.unwrap(texture).createView(),
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          storeOp: 'store'
        }
      ]
    });
    pass.end();

    device.queue.submit([encoder.finish()]);
  }

  // ============================================================================
  // MARK: Layer Access
  // ============================================================================

  /**
   * Get a layer by ID.
   */
  getLayer(id: string): LayerWithTexture | undefined {
    return this.layers.get(id);
  }

  /**
   * Get the active layer.
   */
  get activeLayer(): LayerWithTexture | null {
    return this._activeLayerId ? (this.layers.get(this._activeLayerId) ?? null) : null;
  }

  /**
   * Get the active layer ID.
   */
  get activeLayerId(): string | null {
    return this._activeLayerId;
  }

  /**
   * Set the active layer.
   */
  setActiveLayer(id: string): boolean {
    if (!this.layers.has(id)) return false;
    this._activeLayerId = id;
    return true;
  }

  /**
   * Get all layers in order (bottom to top).
   */
  getLayers(): LayerWithTexture[] {
    return this.layerOrder.map((id) => this.layers.get(id)!);
  }

  /**
   * Get visible layers in order (bottom to top).
   */
  getVisibleLayers(): LayerWithTexture[] {
    return this.getLayers().filter((layer) => layer.visible);
  }

  /**
   * Get the layer count.
   */
  get count(): number {
    return this.layers.size;
  }

  // ============================================================================
  // MARK: Layer Modification
  // ============================================================================

  /**
   * Update layer properties.
   */
  updateLayer(id: string, updates: Partial<Omit<Layer, 'id' | 'texture'>>): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;

    Object.assign(layer, updates);
    return true;
  }

  /**
   * Move a layer to a new position in the stack.
   */
  moveLayer(id: string, newIndex: number): boolean {
    const currentIndex = this.layerOrder.indexOf(id);
    if (currentIndex === -1) return false;

    const clampedIndex = Math.max(0, Math.min(this.layerOrder.length - 1, newIndex));

    // Remove from current position
    this.layerOrder.splice(currentIndex, 1);
    // Insert at new position
    this.layerOrder.splice(clampedIndex, 0, id);

    return true;
  }

  /**
   * Move a layer up in the stack (towards top).
   */
  moveLayerUp(id: string): boolean {
    const currentIndex = this.layerOrder.indexOf(id);
    if (currentIndex === -1 || currentIndex === this.layerOrder.length - 1) return false;
    return this.moveLayer(id, currentIndex + 1);
  }

  /**
   * Move a layer down in the stack (towards bottom).
   */
  moveLayerDown(id: string): boolean {
    const currentIndex = this.layerOrder.indexOf(id);
    if (currentIndex === -1 || currentIndex === 0) return false;
    return this.moveLayer(id, currentIndex - 1);
  }

  /**
   * Duplicate a layer.
   */
  duplicateLayer(id: string): LayerWithTexture | null {
    const source = this.layers.get(id);
    if (!source) return null;

    // Create new layer with same properties
    const newLayer = this.createLayer({
      name: `${source.name} copy`,
      visible: source.visible,
      opacity: source.opacity,
      blendMode: source.blendMode,
      locked: false
    });

    // TODO: Copy texture contents
    // This requires a texture copy operation

    return newLayer;
  }

  /**
   * Merge a layer down (merge with the layer below).
   */
  mergeLayerDown(id: string): boolean {
    const currentIndex = this.layerOrder.indexOf(id);
    if (currentIndex <= 0) return false;

    const _sourceLayer = this.layers.get(id);
    const _targetLayer = this.layers.get(this.layerOrder[currentIndex - 1]);
    if (!_sourceLayer || !_targetLayer) return false;

    // TODO: Implement actual merge with compositing
    // For now, just remove the source layer
    return this.removeLayer(id);
  }

  /**
   * Clear a layer's content.
   */
  clearLayer(id: string): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;

    this.clearLayerTexture(layer.texture);
    return true;
  }

  // ============================================================================
  // MARK: Resize
  // ============================================================================

  /**
   * Resize all layer textures.
   * Note: This will clear all layer contents!
   */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;

    this.width = width;
    this.height = height;

    // Recreate all layer textures
    for (const layer of this.layers.values()) {
      // Destroy old texture
      layer.texture.destroy();

      // Create new texture
      const texture = this.root['~unstable']
        .createTexture({
          size: [width, height],
          format: RENDER_TARGET_FORMAT
        })
        .$usage('render', 'sampled');

      layer.texture = texture;
      layer.textureView = this.root.unwrap(texture).createView();

      this.clearLayerTexture(texture);
    }
  }

  // ============================================================================
  // MARK: Cleanup
  // ============================================================================

  /**
   * Destroy all layers and release resources.
   */
  destroy(): void {
    for (const layer of this.layers.values()) {
      layer.texture.destroy();
    }
    this.layers.clear();
    this.layerOrder = [];
    this._activeLayerId = null;
  }
}

/**
 * Create a layer manager.
 */
export function createLayerManager(root: TgpuRoot, width: number, height: number): LayerManager {
  return new LayerManager(root, width, height);
}
