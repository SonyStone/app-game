/**
 * TypeGPU Drawing Framework - Render Loop
 *
 * Manages the requestAnimationFrame loop with dirty-flag optimization.
 * Only renders when something has changed.
 */

/** Render callback type */
export type RenderCallback = (deltaTime: number, timestamp: number) => void;

/** Render loop options */
export interface RenderLoopOptions {
  /** Maximum FPS (0 = unlimited) */
  maxFps?: number;
  /** Callback before each frame */
  onBeforeRender?: RenderCallback;
  /** Main render callback */
  onRender: RenderCallback;
  /** Callback after each frame */
  onAfterRender?: RenderCallback;
}

/**
 * Render loop manager with dirty-flag optimization.
 */
export class RenderLoop {
  private animationFrameId: number | null = null;
  private lastTimestamp: number = 0;
  private minFrameTime: number = 0;
  private isRunning: boolean = false;

  private needsRender: boolean = false;
  private continuousMode: boolean = false;

  private onBeforeRender?: RenderCallback;
  private onRender: RenderCallback;
  private onAfterRender?: RenderCallback;

  constructor(options: RenderLoopOptions) {
    this.onBeforeRender = options.onBeforeRender;
    this.onRender = options.onRender;
    this.onAfterRender = options.onAfterRender;

    if (options.maxFps && options.maxFps > 0) {
      this.minFrameTime = 1000 / options.maxFps;
    }

    // Bind the loop method
    this.loop = this.loop.bind(this);
  }

  /**
   * Start the render loop.
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTimestamp = performance.now();
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  /**
   * Stop the render loop.
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Request a render on the next frame.
   * Call this when something changes that requires a redraw.
   */
  requestRender(): void {
    this.needsRender = true;
  }

  /**
   * Enable continuous rendering (ignores dirty flag).
   * Useful for animations or continuous updates.
   */
  setContinuousMode(enabled: boolean): void {
    this.continuousMode = enabled;
  }

  /**
   * Check if the loop is running.
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Force an immediate render (synchronous).
   */
  renderNow(): void {
    const now = performance.now();
    const deltaTime = now - this.lastTimestamp;
    this.lastTimestamp = now;

    this.onBeforeRender?.(deltaTime, now);
    this.onRender(deltaTime, now);
    this.onAfterRender?.(deltaTime, now);

    this.needsRender = false;
  }

  /**
   * The main loop function.
   */
  private loop(timestamp: number): void {
    if (!this.isRunning) return;

    const deltaTime = timestamp - this.lastTimestamp;

    // FPS limiting
    if (this.minFrameTime > 0 && deltaTime < this.minFrameTime) {
      this.animationFrameId = requestAnimationFrame(this.loop);
      return;
    }

    this.lastTimestamp = timestamp;

    // Only render if needed or in continuous mode
    if (this.needsRender || this.continuousMode) {
      this.onBeforeRender?.(deltaTime, timestamp);
      this.onRender(deltaTime, timestamp);
      this.onAfterRender?.(deltaTime, timestamp);
      this.needsRender = false;
    }

    // Schedule next frame
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  /**
   * Destroy the render loop.
   */
  destroy(): void {
    this.stop();
  }
}

/**
 * Create a simple render loop.
 */
export function createRenderLoop(onRender: RenderCallback, options?: Partial<RenderLoopOptions>): RenderLoop {
  return new RenderLoop({
    onRender,
    ...options
  });
}
