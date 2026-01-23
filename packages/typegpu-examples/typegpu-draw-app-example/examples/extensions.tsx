/**
 * TypeGPU Drawing Framework - Extension Examples
 *
 * This file demonstrates how to extend the framework with custom functionality:
 * - Custom brushes
 * - Custom blend modes
 * - Custom UI components
 * - Custom tools
 */

import type { Accessor, JSX, Setter } from 'solid-js';
import type { BrushDefinition, BrushSettingsType, BrushStampInstance, Point2D, StrokePoint } from '../framework';

// ============================================================================
// Helper: Convert StrokePoints to BrushStampInstances
// ============================================================================

/**
 * Extended stroke point with optional rotation for custom brushes
 */
interface ExtendedStrokePoint extends StrokePoint {
  rotation?: number;
}

/**
 * Helper function to parse hex color to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
      }
    : { r: 0, g: 0, b: 0 };
}

/**
 * Helper to convert a StrokePoint to a BrushStampInstance
 */
function pointToStamp(point: ExtendedStrokePoint, settings: BrushSettingsType): BrushStampInstance {
  const rgb = hexToRgb(settings.color);
  return {
    x: point.x,
    y: point.y,
    size: point.size ?? settings.size * point.pressure,
    rotation: point.rotation ?? 0,
    color: rgb,
    opacity: settings.opacity * point.pressure,
    pressure: point.pressure
  };
}

// ============================================================================
// EXAMPLE 1: Custom Brush Definition
// ============================================================================

/**
 * A custom scatter brush that adds random offset to each stroke point.
 * This creates a spray-paint effect.
 */
export const ScatterBrush: BrushDefinition = {
  id: 'scatter-brush',
  name: 'Scatter Brush',
  description: 'Spray-paint effect with randomized point positions',

  settings: {
    size: { min: 5, max: 100, default: 30, label: 'Size' },
    opacity: { min: 0, max: 1, default: 0.3, label: 'Opacity' },
    hardness: { min: 0, max: 1, default: 0.1, label: 'Hardness' },
    spacing: { min: 1, max: 50, default: 5, label: 'Spacing' },
    // Custom property for scatter amount
    scatter: { min: 0, max: 100, default: 30, label: 'Scatter' }
  },

  processPoints: (
    points: StrokePoint[],
    settings: BrushSettingsType,
    lastPoint: Point2D | null
  ): { stamps: BrushStampInstance[]; lastPoint: Point2D | null } => {
    const scatterAmount = (settings.scatter as number) || 30;
    const stamps: BrushStampInstance[] = [];

    for (const point of points) {
      // Generate multiple scattered points for each input point
      const count = Math.max(1, Math.floor(5 * point.pressure));

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * scatterAmount;

        const scatteredPoint: StrokePoint = {
          ...point,
          x: point.x + Math.cos(angle) * distance,
          y: point.y + Math.sin(angle) * distance,
          size: settings.size * (0.5 + Math.random() * 0.5) * point.pressure,
          pressure: point.pressure * (0.3 + Math.random() * 0.7)
        };

        stamps.push(pointToStamp(scatteredPoint, settings));
      }
    }

    // Return last point for continuity
    const newLastPoint =
      points.length > 0 ? { x: points[points.length - 1].x, y: points[points.length - 1].y } : lastPoint;

    return { stamps, lastPoint: newLastPoint };
  }
};

/**
 * A calligraphy brush that varies size based on stroke direction.
 */
export const CalligraphyBrush: BrushDefinition = {
  id: 'calligraphy-brush',
  name: 'Calligraphy',
  description: 'Pen-like brush that varies with stroke direction',

  settings: {
    size: { min: 5, max: 80, default: 20, label: 'Size' },
    opacity: { min: 0, max: 1, default: 1, label: 'Opacity' },
    hardness: { min: 0, max: 1, default: 0.9, label: 'Hardness' },
    spacing: { min: 1, max: 30, default: 10, label: 'Spacing' },
    // Angle of the calligraphy pen
    penAngle: { min: 0, max: 180, default: 45, label: 'Pen Angle' }
  },

  processPoints: (
    points: StrokePoint[],
    settings: BrushSettingsType,
    lastPoint: Point2D | null
  ): { stamps: BrushStampInstance[]; lastPoint: Point2D | null } => {
    const penAngle = ((settings.penAngle as number) || 45) * (Math.PI / 180);
    const stamps: BrushStampInstance[] = [];

    for (let index = 0; index < points.length; index++) {
      const point = points[index];

      // Calculate stroke direction
      let strokeAngle = 0;
      if (index > 0) {
        const prev = points[index - 1];
        strokeAngle = Math.atan2(point.y - prev.y, point.x - prev.x);
      }

      // Size varies based on angle between stroke and pen
      const angleDiff = Math.abs(Math.sin(strokeAngle - penAngle));
      const sizeMultiplier = 0.3 + angleDiff * 0.7;

      const calligraphyPoint: ExtendedStrokePoint = {
        ...point,
        size: settings.size * sizeMultiplier * point.pressure,
        // Rotate brush stamp based on stroke direction
        rotation: strokeAngle
      };

      stamps.push(pointToStamp(calligraphyPoint, settings));
    }

    // Return last point for continuity
    const newLastPoint =
      points.length > 0 ? { x: points[points.length - 1].x, y: points[points.length - 1].y } : lastPoint;

    return { stamps, lastPoint: newLastPoint };
  }
};

// ============================================================================
// EXAMPLE 2: Custom Blend Mode (TypeGPU WGSL functions)
// ============================================================================

/**
 * Custom "Glow" blend mode that adds a luminous effect.
 *
 * This would be registered with BlendRegistry and implemented in WGSL.
 * The TypeGPU function syntax uses 'use gpu' directive.
 */
export const glowBlendMode = {
  id: 'glow',
  name: 'Glow',
  description: 'Adds a luminous glow effect',

  // WGSL blend function (would be used in BlendPass shader)
  wgslFunction: `
    fn blendGlow(base: vec3f, blend: vec3f) -> vec3f {
      // Screen blend with enhanced brightness
      let screened = 1.0 - (1.0 - base) * (1.0 - blend);
      // Add extra luminosity
      let glow = blend * blend;
      return min(screened + glow * 0.5, vec3f(1.0));
    }
  `
};

/**
 * Custom "Dissolve" blend mode that creates a dithered effect.
 */
export const dissolveBlendMode = {
  id: 'dissolve',
  name: 'Dissolve',
  description: 'Dithered transparency effect',

  wgslFunction: `
    fn blendDissolve(base: vec4f, blend: vec4f, uv: vec2f) -> vec4f {
      // Simple hash function for pseudo-random dithering
      let hash = fract(sin(dot(uv, vec2f(12.9898, 78.233))) * 43758.5453);

      // Use blend color if random > (1 - alpha)
      if (hash > (1.0 - blend.a)) {
        return vec4f(blend.rgb, 1.0);
      }
      return base;
    }
  `
};

// ============================================================================
// EXAMPLE 3: Custom UI Component
// ============================================================================

export interface BrushPreviewProps {
  /** Current brush size */
  size: Accessor<number>;
  /** Current brush hardness */
  hardness: Accessor<number>;
  /** Current brush color */
  color: Accessor<string>;
  /** Preview size in pixels */
  previewSize?: number;
}

/**
 * A brush preview component that shows what the current brush looks like.
 * This could be rendered using a mini WebGPU canvas or SVG.
 */
export function BrushPreview(props: BrushPreviewProps): JSX.Element {
  const previewSize = () => props.previewSize ?? 64;

  // Calculate gradient for soft brush preview
  const gradientId = 'brush-preview-gradient';

  return (
    <div
      style={{
        width: `${previewSize()}px`,
        height: `${previewSize()}px`,
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        background: '#333',
        'border-radius': '4px',
        border: '1px solid #555'
      }}
    >
      <svg width={previewSize()} height={previewSize()} viewBox="0 0 64 64">
        <defs>
          <radialGradient id={gradientId}>
            <stop offset={`${props.hardness() * 80}%`} stop-color={props.color()} />
            <stop offset="100%" stop-color={props.color()} stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="32" r={Math.min(30, (props.size() / 100) * 30)} fill={`url(#${gradientId})`} />
      </svg>
    </div>
  );
}

// ============================================================================
// EXAMPLE 4: Custom Tool (Eraser)
// ============================================================================

export interface EraserToolConfig {
  /** Eraser size */
  size: number;
  /** Eraser hardness */
  hardness: number;
  /** Eraser opacity (how much to erase) */
  opacity: number;
}

/**
 * Eraser tool implementation.
 *
 * The eraser works by drawing with the background color or
 * by using a "destination-out" blend mode.
 */
export function createEraserTool(
  setBlendMode: Setter<number>,
  setBrushColor: Setter<string>,
  originalColor: Accessor<string>
) {
  let wasErasing = false;
  let savedColor = '#000000';

  return {
    activate: () => {
      if (!wasErasing) {
        savedColor = originalColor();
        // Set to erase blend mode (would need to be implemented)
        // Or set color to white/background and use normal blend
        setBrushColor('#ffffff');
        wasErasing = true;
      }
    },

    deactivate: () => {
      if (wasErasing) {
        setBrushColor(savedColor);
        wasErasing = false;
      }
    }
  };
}

// ============================================================================
// EXAMPLE 5: Keyboard Shortcuts Handler
// ============================================================================

export interface ShortcutConfig {
  /** Increase brush size */
  increaseBrushSize?: string;
  /** Decrease brush size */
  decreaseBrushSize?: string;
  /** Toggle eraser */
  toggleEraser?: string;
  /** Undo */
  undo?: string;
  /** Redo */
  redo?: string;
  /** Clear canvas */
  clear?: string;
  /** Reset view */
  resetView?: string;
}

const defaultShortcuts: ShortcutConfig = {
  increaseBrushSize: ']',
  decreaseBrushSize: '[',
  toggleEraser: 'e',
  undo: 'ctrl+z',
  redo: 'ctrl+shift+z',
  clear: 'ctrl+delete',
  resetView: 'ctrl+0'
};

/**
 * Sets up keyboard shortcuts for the drawing app.
 */
export function setupKeyboardShortcuts(
  config: ShortcutConfig = defaultShortcuts,
  handlers: {
    onIncreaseBrushSize?: () => void;
    onDecreaseBrushSize?: () => void;
    onToggleEraser?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onClear?: () => void;
    onResetView?: () => void;
  }
) {
  const handleKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    // Build key combo string
    let combo = '';
    if (ctrl) combo += 'ctrl+';
    if (shift) combo += 'shift+';
    combo += key;

    // Match against shortcuts
    if (combo === config.increaseBrushSize) {
      e.preventDefault();
      handlers.onIncreaseBrushSize?.();
    } else if (combo === config.decreaseBrushSize) {
      e.preventDefault();
      handlers.onDecreaseBrushSize?.();
    } else if (combo === config.toggleEraser) {
      e.preventDefault();
      handlers.onToggleEraser?.();
    } else if (combo === config.undo) {
      e.preventDefault();
      handlers.onUndo?.();
    } else if (combo === config.redo) {
      e.preventDefault();
      handlers.onRedo?.();
    } else if (combo === config.clear) {
      e.preventDefault();
      handlers.onClear?.();
    } else if (combo === config.resetView) {
      e.preventDefault();
      handlers.onResetView?.();
    }
  };

  // Add listener
  window.addEventListener('keydown', handleKeyDown);

  // Return cleanup function
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example: Registering custom brushes
 *
 * ```tsx
 * import { BrushRegistry } from './framework';
 * import { ScatterBrush, CalligraphyBrush } from './examples/extensions';
 *
 * const registry = new BrushRegistry();
 * registry.register(ScatterBrush);
 * registry.register(CalligraphyBrush);
 *
 * // Get all brushes including custom ones
 * const allBrushes = registry.getAll();
 * ```
 */

/**
 * Example: Using keyboard shortcuts
 *
 * ```tsx
 * import { setupKeyboardShortcuts } from './examples/extensions';
 *
 * onMount(() => {
 *   const cleanup = setupKeyboardShortcuts({}, {
 *     onIncreaseBrushSize: () => setBrushSize(s => Math.min(100, s + 5)),
 *     onDecreaseBrushSize: () => setBrushSize(s => Math.max(1, s - 5)),
 *     onClear: clearCanvas,
 *     onResetView: resetTransform
 *   });
 *
 *   onCleanup(cleanup);
 * });
 * ```
 */

/**
 * Example: Adding brush preview to toolbar
 *
 * ```tsx
 * import { BrushPreview } from './examples/extensions';
 *
 * <Toolbar {...toolbarProps}>
 *   <BrushPreview
 *     size={brushSize}
 *     hardness={brushHardness}
 *     color={brushColor}
 *   />
 * </Toolbar>
 * ```
 */
