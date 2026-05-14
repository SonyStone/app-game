/**
 * TypeGPU Drawing Framework - Drawing Engine
 *
 * The main orchestrator that ties together all components:
 * - GPU context management
 * - Render loop
 * - State management
 * - Brush and blend registries
 * - Input handling (delegated)
 */

import type { TgpuRoot } from 'typegpu';
import { BlendRegistry, createBlendRegistry } from '../blend/BlendRegistry';
import { BUILTIN_BRUSHES } from '../brushes/brushes/SoftRoundBrush';
import { BrushRegistry, createBrushRegistry } from '../brushes/BrushRegistry';
import { createDrawingState, type DrawingState } from '../state/DrawingState';
import { createGPUContext, destroyGPUContext, resizeCanvasToDisplaySize, type GPUContextState } from './GPUContext';
import { RenderLoop } from './RenderLoop';
import type { DrawingEngineConfig, EngineEvent, EngineEventCallback, StrokePoint } from './types';

// Import existing render components
import { BlendPass } from '../blend/BlendPass';
import { SwapBuffer } from '../blend/SwapBuffer';
import { BrushStroke } from '../brush/BrushStroke';
import { DisplayPass } from '../display/DisplayPass';

/** Engine initialization status */
export type EngineStatus = 'uninitialized' | 'initializing' | 'ready' | 'error' | 'destroyed';

/**
 * The main Drawing Engine class.
 *
 * Usage:
 * ```ts
 * const engine = new DrawingEngine();
 * await engine.init({ canvas: myCanvas });
 *
 * // Access state
 * engine.state.tool.setBrushSize(30);
 *
 * // Handle input (typically done via hooks)
 * engine.handleStrokeStart();
 * engine.handleStrokePoints([...]);
 * engine.handleStrokeEnd();
 *
 * // Cleanup
 * engine.destroy();
 * ```
 */
export class DrawingEngine {
  // Status
  private _status: EngineStatus = 'uninitialized';

  // GPU resources
  private gpuContext: GPUContextState | null = null;

  // Render components
  private brushStroke: BrushStroke | null = null;
  private swapBuffer: SwapBuffer | null = null;
  private blendPass: BlendPass | null = null;
  private displayPass: DisplayPass | null = null;

  // Render loop
  private renderLoop: RenderLoop | null = null;

  // State
  private _state: DrawingState | null = null;

  // Registries
  private _brushRegistry: BrushRegistry | null = null;
  private _blendRegistry: BlendRegistry | null = null;

  // Event listeners
  private eventListeners: Map<EngineEvent, Set<EngineEventCallback<unknown>>> = new Map();

  // Configuration
  private config: DrawingEngineConfig | null = null;

  // ============================================================================
  // MARK: Lifecycle
  // ============================================================================

  /**
   * Initialize the drawing engine.
   */
  async init(config: DrawingEngineConfig): Promise<void> {
    if (this._status !== 'uninitialized') {
      throw new Error(`Cannot initialize engine in status: ${this._status}`);
    }

    this._status = 'initializing';
    this.config = config;

    try {
      // Initialize GPU context
      this.gpuContext = await createGPUContext({
        canvas: config.canvas
      });

      // Resize canvas to display size
      resizeCanvasToDisplaySize(config.canvas);

      // Get dimensions
      const canvasWidth = config.width ?? 4000;
      const canvasHeight = config.height ?? 4000;
      const displayWidth = config.canvas.clientWidth;
      const displayHeight = config.canvas.clientHeight;

      // Initialize state
      this._state = createDrawingState({
        canvas: {
          width: canvasWidth,
          height: canvasHeight,
          displayWidth,
          displayHeight,
          backgroundColor: config.backgroundColor ?? '#ffffff'
        }
      });

      // Initialize registries
      this._brushRegistry = createBrushRegistry(BUILTIN_BRUSHES);
      this._blendRegistry = createBlendRegistry();

      // Register custom brushes
      if (config.brushes) {
        for (const brush of config.brushes) {
          this._brushRegistry.register(brush);
        }
      }

      // Register custom blend modes
      if (config.blendModes) {
        for (const mode of config.blendModes) {
          this._blendRegistry.registerBlendMode(mode);
        }
      }

      // Initialize render components
      const root = this.gpuContext.root;
      const format = this.gpuContext.format;

      this.brushStroke = new BrushStroke(root, canvasWidth, canvasHeight);
      this.swapBuffer = new SwapBuffer(root, canvasWidth, canvasHeight);
      this.blendPass = new BlendPass(root);
      this.displayPass = new DisplayPass(root, format);

      // Clear canvas to background color
      this.clearCanvas();

      // Initialize render loop
      this.renderLoop = new RenderLoop({
        onRender: this.render.bind(this)
      });
      this.renderLoop.start();

      this._status = 'ready';
      this.emit('initialized');
    } catch (error) {
      this._status = 'error';
      console.error('Failed to initialize drawing engine:', error);
      throw error;
    }
  }

  /**
   * Destroy the engine and release all resources.
   */
  destroy(): void {
    if (this._status === 'destroyed') return;

    // Stop render loop
    this.renderLoop?.destroy();
    this.renderLoop = null;

    // Destroy render components
    this.brushStroke?.destroy();
    this.displayPass?.destroy();
    this.swapBuffer = null;
    this.blendPass = null;

    // Destroy GPU context
    if (this.gpuContext) {
      destroyGPUContext(this.gpuContext);
      this.gpuContext = null;
    }

    // Clear state
    this._state = null;
    this._brushRegistry = null;
    this._blendRegistry = null;

    // Clear event listeners
    this.eventListeners.clear();

    this._status = 'destroyed';
    this.emit('destroyed');
  }

  // ============================================================================
  // MARK: Accessors
  // ============================================================================

  get status(): EngineStatus {
    return this._status;
  }

  get state(): DrawingState {
    if (!this._state) throw new Error('Engine not initialized');
    return this._state;
  }

  get brushRegistry(): BrushRegistry {
    if (!this._brushRegistry) throw new Error('Engine not initialized');
    return this._brushRegistry;
  }

  get blendRegistry(): BlendRegistry {
    if (!this._blendRegistry) throw new Error('Engine not initialized');
    return this._blendRegistry;
  }

  get root(): TgpuRoot {
    if (!this.gpuContext) throw new Error('Engine not initialized');
    return this.gpuContext.root;
  }

  get canvas(): HTMLCanvasElement {
    if (!this.config) throw new Error('Engine not initialized');
    return this.config.canvas;
  }

  // ============================================================================
  // MARK: Stroke Handling
  // ============================================================================

  /**
   * Called when a stroke starts.
   */
  handleStrokeStart(): void {
    if (this._status !== 'ready') return;

    this._state?.stroke.startStroke();
    this.emit('strokeStart');
  }

  /**
   * Add stroke points during drawing.
   */
  handleStrokePoints(points: StrokePoint[]): void {
    if (this._status !== 'ready') return;
    if (!this._state?.stroke.inProgress()) return;

    this._state.stroke.addPoints(points);
    this.requestRender();
  }

  /**
   * Called when a stroke ends.
   */
  handleStrokeEnd(): void {
    if (this._status !== 'ready') return;

    this._state?.stroke.endStroke();
    this.requestRender();
    this.emit('strokeEnd');
  }

  // ============================================================================
  // MARK: Canvas Operations
  // ============================================================================

  /**
   * Clear the canvas to the background color.
   */
  clearCanvas(): void {
    if (!this.gpuContext || !this.swapBuffer) return;

    const bgColor = this._state?.canvas.state.backgroundColor ?? '#ffffff';
    const rgb = hexToRgb(bgColor);

    const encoder = this.gpuContext.root.device.createCommandEncoder();
    this.swapBuffer.clearRead(encoder, [rgb.r, rgb.g, rgb.b, 1]);
    this.gpuContext.root.device.queue.submit([encoder.finish()]);

    this.requestRender();
  }

  /**
   * Request a render on the next frame.
   */
  requestRender(): void {
    this.renderLoop?.requestRender();
  }

  /**
   * Handle canvas resize.
   */
  handleResize(): void {
    if (!this.gpuContext || !this._state) return;

    const canvas = this.gpuContext.canvas;
    if (resizeCanvasToDisplaySize(canvas)) {
      this._state.canvas.setDisplayDimensions(canvas.clientWidth, canvas.clientHeight);
      this.requestRender();
    }
  }

  // ============================================================================
  // MARK: Transform
  // ============================================================================

  /**
   * Reset the canvas transform (pan, zoom, rotation).
   */
  resetTransform(): void {
    this._state?.canvas.resetTransform();
    this.requestRender();
  }

  // ============================================================================
  // MARK: Render
  // ============================================================================

  /**
   * Main render function called by the render loop.
   */
  private render(): void {
    if (
      !this.gpuContext ||
      !this.brushStroke ||
      !this.swapBuffer ||
      !this.blendPass ||
      !this.displayPass ||
      !this._state
    ) {
      return;
    }

    const { root, context } = this.gpuContext;
    const state = this._state;

    this.emit('beforeRender');

    // Update brush settings
    const brushSettings = state.tool.state.brush;
    this.brushStroke.setBrushSettings({
      color: brushSettings.color,
      size: brushSettings.size,
      opacity: brushSettings.opacity,
      hardness: brushSettings.hardness
    });

    // Update blend modes
    this.blendPass.setBlendMode(state.tool.state.blendMode);
    this.blendPass.setColorBlendMode(state.tool.state.colorBlendMode);

    // Process pending stroke points
    const pendingPoints = state.stroke.consumePoints();
    if (pendingPoints.length > 0) {
      this.brushStroke.addStrokePoints(pendingPoints);
    }

    // Create command encoder
    const encoder = root.device.createCommandEncoder();

    // Render brush strokes
    const strokeInProgress = state.stroke.inProgress();
    const hasPendingStamps = this.brushStroke.pendingCount > 0;

    if (hasPendingStamps) {
      this.brushStroke.render(true); // Always accumulate
      this.brushStroke.clearPending();
    }

    // Get brush texture for display/compositing
    const brushTextureView = this.brushStroke.textureView;

    if (strokeInProgress) {
      // During stroke: show brush overlay for preview
      this.displayPass.setBrushOverlay(brushTextureView);
    } else {
      // Stroke ended or not active
      const needsComposite = this.displayPass.hasBrushOverlayActive;

      if (needsComposite) {
        // Composite accumulated brush strokes to canvas
        this.blendPass.render(encoder, brushTextureView, this.swapBuffer);
        this.brushStroke.clearTexture();
      }
      this.displayPass.setBrushOverlay(null);
    }

    // Update display transform
    const canvasState = state.canvas.state;
    this.displayPass.updateTransform(
      canvasState.transform,
      canvasState.displayWidth,
      canvasState.displayHeight,
      canvasState.width,
      canvasState.height
    );

    // Render to screen
    const outputView = context.getCurrentTexture().createView();
    this.displayPass.render(encoder, this.swapBuffer.read.view, outputView);

    // Submit
    root.device.queue.submit([encoder.finish()]);

    this.emit('afterRender');
  }

  // ============================================================================
  // MARK: Events
  // ============================================================================

  /**
   * Subscribe to an engine event.
   */
  on<T = void>(event: EngineEvent, callback: EngineEventCallback<T>): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback as EngineEventCallback<unknown>);

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(event)?.delete(callback as EngineEventCallback<unknown>);
    };
  }

  /**
   * Emit an event to all listeners.
   */
  private emit<T = void>(event: EngineEvent, data?: T): void {
    this.eventListeners.get(event)?.forEach((callback) => callback(data));
  }
}

// ============================================================================
// MARK: Utilities
// ============================================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 1, g: 1, b: 1 };
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  };
}

/**
 * Create a drawing engine instance.
 */
export function createDrawingEngine(): DrawingEngine {
  return new DrawingEngine();
}
