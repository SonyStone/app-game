import type { GpuError } from '@app-game/solid-gpu/errors';
import type { SceneFrame } from './createFrame';

/**
 * The contract both profile renderers (`prepareGlyphDocument`, `prepareCurveDocument`) satisfy.
 * GPU resources belong to the `keep` owner passed at preparation; this object only draws and observes them.
 */
export type PreparedDocument = {
  /** Dispatches `change` when streamed resources or refinement need another frame. */
  events: EventTarget;
  /** First asynchronous GPU/streaming failure; once set, drawing must stop. */
  readonly failure: GpuError | undefined;
  /** Estimated explicit buffer and texture bytes, excluding driver overhead and swapchain. */
  readonly resourceBytes: number;
  /** Composed-page counters of the curve renderer; `undefined` for glyph documents. */
  readonly refinement: RefinementCounters | undefined;
  /** Resolves when the current visible working set is resident and refined. Never rejects for GPU errors. */
  settle(): Promise<void>;
  /**
   * Creates an independent view, such as one canvas of a split screen. Views share every GPU resource; streamed
   * images and refined tiles follow the merged working set of all views.
   */
  createView(): PreparedView;
};

/** One view of a prepared document. */
export type PreparedView = {
  /** Records the frame into a scene-owned pass without ending or submitting it. May throw TypeGPU errors. */
  draw(pass: GPURenderPassEncoder, frame: SceneFrame): void;
  /** Stops requesting this view's images and tiles. */
  destroy(): void;
};

/** Read-only composed-page diagnostics for performance and in-motion quality checks. */
export type RefinementCounters = {
  /** Pages with a composed (tile-cached) prefix. */
  pages: number;
  /** Tiles wanted by the last frame. */
  requested: number;
  /** Wanted tiles not yet at their current revision. */
  missing: number;
  /** Missing tiles waiting for image sources, fallbacks or motion to settle. */
  blocked: number;
  /** Whether a refinement batch is in flight. */
  pending: boolean;
  /** Pages always drawn directly. */
  directPages: number;
  /** Pages whose composed prefix is only used at overview scales. */
  overviewPages: number;
  /** Overview pages the GPU budget has permanently switched to composed drawing. */
  budgetCachedPages: number;
  /** Composed pages with a directly drawn foreground. */
  foregroundPages: number;
};
