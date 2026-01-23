/**
 * TypeGPU Drawing Framework
 *
 * A modular, extensible drawing framework built with TypeGPU and SolidJS.
 *
 * @example
 * ```tsx
 * import { createDrawingEngine, useDrawingEngine } from './framework';
 *
 * // Create engine
 * const engine = createDrawingEngine();
 * await engine.init({ canvas: myCanvas });
 *
 * // Access state
 * engine.state.tool.setBrushSize(30);
 * engine.state.tool.setBrushColor('#ff0000');
 *
 * // Register custom brush
 * engine.brushRegistry.register(myCustomBrush);
 *
 * // Handle input
 * engine.handleStrokeStart();
 * engine.handleStrokePoints(points);
 * engine.handleStrokeEnd();
 * ```
 */

// ============================================================================
// MARK: Core
// ============================================================================

export { DrawingEngine, createDrawingEngine } from '../core/DrawingEngine';
export type { EngineStatus } from '../core/DrawingEngine';

export { createGPUContext, destroyGPUContext, getDisplaySize, resizeCanvasToDisplaySize } from '../core/GPUContext';
export type { GPUContextConfig, GPUContextState } from '../core/GPUContext';

export { RenderLoop, createRenderLoop } from '../core/RenderLoop';
export type { RenderCallback, RenderLoopOptions } from '../core/RenderLoop';

// ============================================================================
// MARK: Types
// ============================================================================

export type {
  ArrayElement,
  // Blend types
  BlendModeDefinition,
  // Brush types
  BrushDefinition,
  BrushPropertySchema,
  BrushSettingsSchema,
  BrushSettings as BrushSettingsType,
  BrushStampInstance,
  CanvasTransform,
  ColorBlendModeDefinition,
  ColorRGB,
  ColorRGBA,
  // Utility types
  DeepPartial,
  // Engine types
  DrawingEngineConfig,
  EngineEvent,
  EngineEventCallback,
  // Input types
  InputHandler,
  // Layer types
  Layer,
  LayerBlendMode,
  LayerState,
  // Base types
  Point2D,
  StrokePoint
} from '../core/types';

export { BlendMode, ColorBlendMode, hexToRgb, rgbToHex, toVec2f, toVec3f } from '../core/types';

// ============================================================================
// MARK: State
// ============================================================================

export {
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_LAYER,
  DEFAULT_TRANSFORM,
  createCanvasState,
  createDrawingState,
  createLayerState,
  createStrokeState,
  createToolState
} from '../state/DrawingState';

export type { CanvasState, DrawingState, StrokeState, ToolState } from '../state/DrawingState';

// ============================================================================
// MARK: Brushes
// ============================================================================

export { BrushRegistry, createBrushRegistry, defaultProcessPoints } from '../brushes/BrushRegistry';

// Built-in brushes
export { Airbrush, BUILTIN_BRUSHES, HardRoundBrush, SoftRoundBrush } from '../brushes/brushes/SoftRoundBrush';

// ============================================================================
// MARK: Blend
// ============================================================================

export {
  // Built-in definitions
  BUILTIN_BLEND_MODES,
  BUILTIN_COLOR_BLEND_MODES,
  BlendRegistry,
  blendMultiply,
  // Built-in blend functions
  blendNormal,
  blendOverlay,
  blendScreen,
  createBlendRegistry,
  // Color space functions
  gammaToLinear,
  hsvToRgb,
  linearToGamma,
  rgbToHsv
} from '../blend/BlendRegistry';

// ============================================================================
// MARK: Layers
// ============================================================================

export { LayerManager, createLayerManager } from '../layers/LayerManager';
export type { LayerWithTexture } from '../layers/LayerManager';

// ============================================================================
// MARK: Render Components (Advanced)
// ============================================================================

// These are lower-level components for advanced usage
export { BlendPass } from '../blend/BlendPass';
export { SwapBuffer } from '../blend/SwapBuffer';
export { BrushStroke } from '../brush/BrushStroke';
export { BrushTexture } from '../brush/BrushTexture';
export { DisplayPass } from '../display/DisplayPass';

// ============================================================================
// MARK: Constants
// ============================================================================

export {
  BLEND_MODE_LABELS,
  COLOR_BLEND_MODE_LABELS,
  DEFAULT_BRUSH_HARDNESS,
  DEFAULT_BRUSH_OPACITY,
  DEFAULT_BRUSH_SIZE,
  DEFAULT_BRUSH_SPACING,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
  MAX_BRUSH_INSTANCES,
  RENDER_TARGET_FORMAT
} from '../constants';

// ============================================================================
// MARK: UI Components
// ============================================================================

export { BrushSettings, type BrushSettingsProps } from '../ui/BrushSettings';
export { CanvasView, type CanvasViewProps } from '../ui/CanvasView';
export { ColorPicker, type ColorPickerProps } from '../ui/ColorPicker';
export { LayerPanel, type LayerItem, type LayerPanelProps } from '../ui/LayerPanel';
export { Toolbar, type ToolbarProps } from '../ui/Toolbar';

// ============================================================================
// MARK: Presets
// ============================================================================

export { FullDrawApp, createFullDrawApp, type FullDrawAppConfig } from '../presets/FullDrawApp';
export { SimpleDrawApp, createSimpleDrawApp, type SimpleDrawAppConfig } from '../presets/SimpleDrawApp';

// ============================================================================
// MARK: Examples (for reference/extension)
// ============================================================================

export {
  // Custom UI components
  BrushPreview,
  CalligraphyBrush,
  // Custom brushes
  ScatterBrush,
  // Custom tools
  createEraserTool,
  dissolveBlendMode,
  // Custom blend modes
  glowBlendMode,
  // Utilities
  setupKeyboardShortcuts,
  type BrushPreviewProps,
  type EraserToolConfig,
  type ShortcutConfig
} from '../examples';
