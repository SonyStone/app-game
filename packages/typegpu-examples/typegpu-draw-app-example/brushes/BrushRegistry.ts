/**
 * TypeGPU Drawing Framework - Brush Registry
 *
 * Manages brush definitions and allows dynamic registration of custom brushes.
 */

import type { BrushDefinition, BrushSettings, BrushStampInstance, Point2D, StrokePoint } from '../core/types';

/**
 * Default point processing: interpolate points with spacing and apply pressure.
 */
export function defaultProcessPoints(
  points: StrokePoint[],
  settings: BrushSettings,
  lastPoint: Point2D | null,
  distanceAccumulator: number = 0
): { stamps: BrushStampInstance[]; lastPoint: Point2D | null; distanceAccumulator: number } {
  const stamps: BrushStampInstance[] = [];
  const spacing = Math.max(1, (settings.spacing / 100) * settings.size);

  let currentLast = lastPoint;
  let accum = distanceAccumulator;

  for (const point of points) {
    if (!currentLast) {
      // First point - place stamp
      stamps.push(createStamp(point, settings));
      currentLast = { x: point.x, y: point.y };
      accum = 0;
      continue;
    }

    // Calculate distance from last point
    const dx = point.x - currentLast.x;
    const dy = point.y - currentLast.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.001) continue;

    // Direction
    const dirX = dx / dist;
    const dirY = dy / dist;

    // Interpolate stamps along the path
    let traveled = accum;
    while (traveled < dist) {
      const remaining = dist - traveled;
      const stepNeeded = spacing - accum;

      if (stepNeeded > remaining) {
        // Not enough distance for another stamp
        accum += remaining;
        break;
      }

      // Place stamp
      traveled += stepNeeded;
      accum = 0;

      const stampX = currentLast.x + dirX * traveled;
      const stampY = currentLast.y + dirY * traveled;

      // Interpolate pressure
      const pressure = point.pressure; // Could lerp from previous

      stamps.push(
        createStamp(
          {
            x: stampX,
            y: stampY,
            pressure,
            size: point.size
          },
          settings
        )
      );
    }

    currentLast = { x: point.x, y: point.y };
  }

  return { stamps, lastPoint: currentLast, distanceAccumulator: accum };
}

function createStamp(point: StrokePoint, settings: BrushSettings): BrushStampInstance {
  const color = hexToRgbSimple(settings.color);
  return {
    x: point.x,
    y: point.y,
    size: settings.size * (0.5 + point.pressure * 0.5),
    rotation: 0,
    color,
    opacity: settings.opacity,
    pressure: point.pressure
  };
}

function hexToRgbSimple(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  };
}

/**
 * Brush Registry - manages all available brushes.
 */
export class BrushRegistry {
  private brushes: Map<string, BrushDefinition> = new Map();
  private defaultBrushId: string | null = null;

  /**
   * Register a brush definition.
   */
  register(brush: BrushDefinition): void {
    this.brushes.set(brush.id, brush);

    // Set as default if first brush
    if (this.defaultBrushId === null) {
      this.defaultBrushId = brush.id;
    }
  }

  /**
   * Unregister a brush.
   */
  unregister(id: string): void {
    this.brushes.delete(id);

    if (this.defaultBrushId === id) {
      this.defaultBrushId = this.brushes.keys().next().value ?? null;
    }
  }

  /**
   * Get a brush by ID.
   */
  get(id: string): BrushDefinition | undefined {
    return this.brushes.get(id);
  }

  /**
   * Get the default brush.
   */
  getDefault(): BrushDefinition | undefined {
    return this.defaultBrushId ? this.brushes.get(this.defaultBrushId) : undefined;
  }

  /**
   * Set the default brush ID.
   */
  setDefault(id: string): void {
    if (this.brushes.has(id)) {
      this.defaultBrushId = id;
    }
  }

  /**
   * Get all registered brushes.
   */
  getAll(): BrushDefinition[] {
    return Array.from(this.brushes.values());
  }

  /**
   * Get all brush IDs.
   */
  getIds(): string[] {
    return Array.from(this.brushes.keys());
  }

  /**
   * Check if a brush exists.
   */
  has(id: string): boolean {
    return this.brushes.has(id);
  }

  /**
   * Clear all brushes.
   */
  clear(): void {
    this.brushes.clear();
    this.defaultBrushId = null;
  }
}

/**
 * Create a brush registry with optional initial brushes.
 */
export function createBrushRegistry(brushes?: BrushDefinition[]): BrushRegistry {
  const registry = new BrushRegistry();

  if (brushes) {
    for (const brush of brushes) {
      registry.register(brush);
    }
  }

  return registry;
}
