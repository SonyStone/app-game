/**
 * TypeGPU Drawing Framework - Core Types
 *
 * This file contains all the core type definitions for the drawing framework.
 * Re-exports common types from the base types.ts and adds framework-specific types.
 */

import type { TgpuRoot, TgpuTexture } from 'typegpu';

// Re-export base types
export * from '../types';

// ============================================================================
// MARK: Brush Types
// ============================================================================

/** Settings schema for a brush property */
export interface BrushPropertySchema {
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Default value */
  default: number;
  /** Step increment for UI (optional) */
  step?: number;
  /** Display label (optional) */
  label?: string;
}

/** Schema defining all configurable brush properties */
export interface BrushSettingsSchema {
  size: BrushPropertySchema;
  opacity: BrushPropertySchema;
  hardness?: BrushPropertySchema;
  spacing?: BrushPropertySchema;
  [key: string]: BrushPropertySchema | undefined;
}

/** Runtime brush settings (values, not schema) */
export interface BrushSettings {
  color: string;
  size: number;
  opacity: number;
  hardness: number;
  spacing: number;
  [key: string]: string | number;
}

/** Instance data for a single brush stamp */
export interface BrushStampInstance {
  x: number;
  y: number;
  size: number;
  rotation: number;
  color: { r: number; g: number; b: number };
  opacity: number;
  pressure: number;
}

/** Definition for a brush type */
export interface BrushDefinition {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description (optional) */
  description?: string;

  /** Settings schema for UI generation */
  settings: BrushSettingsSchema;

  /** Generate brush texture (called when hardness changes) */
  generateTexture?(root: TgpuRoot, size: number, hardness: number): GPUTexture;

  /**
   * Process stroke points into stamp instances.
   * Default: interpolate points with spacing, apply pressure.
   */
  processPoints?(
    points: import('../types').StrokePoint[],
    settings: BrushSettings,
    lastPoint: import('../types').Point2D | null
  ): { stamps: BrushStampInstance[]; lastPoint: import('../types').Point2D | null };

  /**
   * Custom fragment shader (optional).
   * If not provided, uses default soft round shader.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fragmentShader?: any; // TgpuFragmentShader
}

// ============================================================================
// MARK: Blend Mode Types
// ============================================================================

/** Definition for a blend mode */
export interface BlendModeDefinition {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description (optional) */
  description?: string;

  /**
   * The GPU function for blending.
   * Signature: (src: vec4f, dst: vec4f) -> vec4f
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blendFn: any; // TgpuFn<[d.vec4f, d.vec4f], d.vec4f>
}

/** Definition for a color blend mode (color space) */
export interface ColorBlendModeDefinition {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;

  /** Convert to this color space before blending */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toColorSpace?: any; // TgpuFn<[d.vec3f], d.vec3f>

  /** Convert from this color space after blending */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fromColorSpace?: any; // TgpuFn<[d.vec3f], d.vec3f>
}

// ============================================================================
// MARK: Layer Types
// ============================================================================

/** Blend mode for layer compositing */
export type LayerBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'add';

/** Layer definition */
export interface Layer {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Visibility */
  visible: boolean;
  /** Opacity (0-1) */
  opacity: number;
  /** Blend mode for compositing with layers below */
  blendMode: LayerBlendMode;
  /** Locked state */
  locked: boolean;
  /** Layer texture (RGBA) */
  texture: TgpuTexture<{ size: [number, number]; format: 'rgba8unorm' }> | null;
}

/** Layer stack state */
export interface LayerState {
  /** All layers in order (bottom to top) */
  layers: Layer[];
  /** Currently active layer ID */
  activeLayerId: string | null;
}

// ============================================================================
// MARK: Input Types
// ============================================================================

/** Input handler interface */
export interface InputHandler {
  /** Unique identifier */
  id: string;
  /** Priority (higher = handles events first) */
  priority: number;
  /** Whether this handler blocks lower-priority handlers when active */
  exclusive?: boolean;

  /** Attach to canvas element */
  attach(canvas: HTMLCanvasElement): void;
  /** Detach from canvas element */
  detach(): void;
  /** Temporarily disable */
  disable(): void;
  /** Re-enable */
  enable(): void;
}

// ============================================================================
// MARK: Engine Types
// ============================================================================

/** Engine configuration */
export interface DrawingEngineConfig {
  /** Canvas element to render to */
  canvas: HTMLCanvasElement;
  /** Drawing canvas width (pixels) */
  width?: number;
  /** Drawing canvas height (pixels) */
  height?: number;
  /** Initial background color (hex) */
  backgroundColor?: string;
  /** Custom brushes to register */
  brushes?: BrushDefinition[];
  /** Custom blend modes to register */
  blendModes?: BlendModeDefinition[];
  /** Enable layer support */
  enableLayers?: boolean;
}

/** Engine events */
export type EngineEvent =
  | 'initialized'
  | 'destroyed'
  | 'strokeStart'
  | 'strokeEnd'
  | 'beforeRender'
  | 'afterRender'
  | 'layerAdded'
  | 'layerRemoved'
  | 'layerChanged'
  | 'activeLayerChanged';

/** Event callback type */
export type EngineEventCallback<T = void> = (data: T) => void;

// ============================================================================
// MARK: Utility Types
// ============================================================================

/** Make all properties of T optional and nullable */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Extract the element type from an array type */
export type ArrayElement<T> = T extends readonly (infer E)[] ? E : never;
