/**
 * BrushSettings - Brush parameter controls
 *
 * Provides sliders for:
 * - Brush size
 * - Brush opacity
 * - Brush hardness
 * - Brush spacing
 */

import type { Accessor, JSX, Setter } from 'solid-js';

export interface BrushSettingsProps {
  /** Brush size in pixels */
  size: Accessor<number>;
  setSize: Setter<number>;

  /** Brush opacity (0-1) */
  opacity: Accessor<number>;
  setOpacity: Setter<number>;

  /** Brush hardness (0-1) - controls edge softness */
  hardness: Accessor<number>;
  setHardness: Setter<number>;

  /** Brush spacing as percentage of brush size */
  spacing: Accessor<number>;
  setSpacing: Setter<number>;

  /** Size range */
  sizeMin?: number;
  sizeMax?: number;

  /** Spacing range */
  spacingMin?: number;
  spacingMax?: number;
}

export function BrushSettings(props: BrushSettingsProps): JSX.Element {
  const sizeMin = () => props.sizeMin ?? 1;
  const sizeMax = () => props.sizeMax ?? 100;
  const spacingMin = () => props.spacingMin ?? 1;
  const spacingMax = () => props.spacingMax ?? 100;

  return (
    <>
      {/* Brush Size */}
      <div class="flex items-center gap-2">
        <label class="text-xs text-neutral-400">Size:</label>
        <input
          type="range"
          min={sizeMin()}
          max={sizeMax()}
          value={props.size()}
          onInput={(e) => props.setSize(parseInt(e.currentTarget.value))}
          class="w-20"
        />
        <span class="w-7.5 text-xs text-neutral-500">{props.size()}</span>
      </div>

      {/* Brush Opacity */}
      <div class="flex items-center gap-2">
        <label class="text-xs text-neutral-400">Opacity:</label>
        <input
          type="range"
          min="0"
          max="100"
          value={props.opacity() * 100}
          onInput={(e) => props.setOpacity(parseInt(e.currentTarget.value) / 100)}
          class="w-20"
        />
        <span class="w-7.5 text-xs text-neutral-500">{Math.round(props.opacity() * 100)}%</span>
      </div>

      {/* Brush Hardness */}
      <div class="flex items-center gap-2">
        <label class="text-xs text-neutral-400">Hardness:</label>
        <input
          type="range"
          min="0"
          max="100"
          value={props.hardness() * 100}
          onInput={(e) => props.setHardness(parseInt(e.currentTarget.value) / 100)}
          class="w-20"
        />
        <span class="w-7.5 text-xs text-neutral-500">{Math.round(props.hardness() * 100)}%</span>
      </div>

      {/* Brush Spacing */}
      <div class="flex items-center gap-2">
        <label class="text-xs text-neutral-400">Spacing:</label>
        <input
          type="range"
          min={spacingMin()}
          max={spacingMax()}
          value={props.spacing()}
          onInput={(e) => props.setSpacing(parseInt(e.currentTarget.value))}
          class="w-20"
        />
        <span class="w-7.5 text-xs text-neutral-500">{props.spacing()}%</span>
      </div>
    </>
  );
}

export default BrushSettings;
