import { BlendMode, ColorBlendMode, ColorRGB } from './types';

/** Maximum number of brush instances per stroke batch */
export const MAX_BRUSH_INSTANCES = 10000;

/** Initial buffer size for brush instances */
export const INITIAL_BUFFER_SIZE = 1000;

/** Default brush size in pixels */
export const DEFAULT_BRUSH_SIZE = 20;

/** Default brush hardness (0 = soft, 1 = hard) */
export const DEFAULT_BRUSH_HARDNESS = 0.5;

/** Default brush spacing (percentage of brush size, 1-100%) */
export const DEFAULT_BRUSH_SPACING = 5;

/** Default brush color */
export const DEFAULT_BRUSH_COLOR: ColorRGB = { r: 0.2, g: 0.6, b: 0.9 };

/** Default background color */
export const DEFAULT_BACKGROUND_COLOR: ColorRGB = { r: 0.95, g: 0.95, b: 0.95 };

/** Default canvas color (white) */
export const DEFAULT_CANVAS_COLOR = '#ffffff';

/** Default canvas width */
export const DEFAULT_CANVAS_WIDTH = 4000;

/** Default canvas height */
export const DEFAULT_CANVAS_HEIGHT = 4000;

/** Default blend mode */
export const DEFAULT_BLEND_MODE = BlendMode.NORMAL;

/** Default color blend mode */
export const DEFAULT_COLOR_BLEND_MODE = ColorBlendMode.LINEAR;

/** Default brush opacity */
export const DEFAULT_BRUSH_OPACITY = 1.0;

/** Minimum distance between stroke points (in canvas space) */
export const MIN_STROKE_DISTANCE = 0.002;

/** Render target format */
export const RENDER_TARGET_FORMAT: GPUTextureFormat = 'rgba8unorm';

/** Blend mode labels for UI */
export const BLEND_MODE_LABELS: Record<BlendMode, string> = {
  [BlendMode.NORMAL]: 'Normal',
  [BlendMode.MULTIPLY]: 'Multiply',
  [BlendMode.SCREEN]: 'Screen',
  [BlendMode.OVERLAY]: 'Overlay'
};

/** Color blend mode labels for UI */
export const COLOR_BLEND_MODE_LABELS: Record<ColorBlendMode, string> = {
  [ColorBlendMode.GAMMA]: 'Gamma (sRGB)',
  [ColorBlendMode.LINEAR]: 'Linear',
  [ColorBlendMode.HSV]: 'HSV'
};
