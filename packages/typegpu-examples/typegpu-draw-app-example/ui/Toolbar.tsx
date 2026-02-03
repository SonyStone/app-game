/**
 * Toolbar - Main drawing app toolbar container
 *
 * Provides the toolbar layout with:
 * - Color picker
 * - Brush settings
 * - Blend mode selectors
 * - Action buttons (Clear, Reset View)
 * - Debug toggle
 * - Help text
 * - Collapsible for full screen drawing
 */

import { createSignal, type Accessor, type JSX, type Setter } from 'solid-js';
import { BLEND_MODE_LABELS, COLOR_BLEND_MODE_LABELS } from '../constants';
import { BlendMode, ColorBlendMode } from '../types';
import { BrushSettings } from './BrushSettings.js';
import { ColorPicker } from './ColorPicker.js';

export interface ToolbarProps {
  // Color
  brushColor: Accessor<string>;
  setBrushColor: Setter<string>;

  // Brush settings
  brushSize: Accessor<number>;
  setBrushSize: Setter<number>;
  brushOpacity: Accessor<number>;
  setBrushOpacity: Setter<number>;
  brushHardness: Accessor<number>;
  setBrushHardness: Setter<number>;
  brushSpacing: Accessor<number>;
  setBrushSpacing: Setter<number>;

  // Blend modes
  blendMode: Accessor<BlendMode>;
  setBlendMode: Setter<BlendMode>;
  colorBlendMode: Accessor<ColorBlendMode>;
  setColorBlendMode: Setter<ColorBlendMode>;

  // Actions
  onClear: () => void;
  onResetView: () => void;

  // Debug
  debugEnabled?: Accessor<boolean>;
  setDebugEnabled?: Setter<boolean>;

  /** Additional toolbar content (children) */
  children?: JSX.Element;
}

export function Toolbar(props: ToolbarProps): JSX.Element {
  const [collapsed, setCollapsed] = createSignal(false);

  return (
    <>
      {/* Collapsed state - just show toggle button */}
      {collapsed() ? (
        <div class="z-1000 absolute left-2 top-2">
          <button
            onClick={() => setCollapsed(false)}
            class="min-w-8 cursor-pointer rounded border border-neutral-600 bg-neutral-700 px-1.5 py-1 text-sm text-neutral-400"
            title="Expand toolbar"
          >
            ☰
          </button>
        </div>
      ) : (
        <>
          <div class="flex flex-wrap items-center gap-4 border-b border-neutral-700 bg-neutral-800 px-4 py-2">
            {/* Collapse button */}
            <button
              onClick={() => setCollapsed(true)}
              class="min-w-8 cursor-pointer rounded border border-neutral-600 bg-neutral-700 px-1.5 py-1 text-sm text-neutral-400"
              title="Collapse toolbar"
            >
              ✕
            </button>

            {/* Color Picker */}
            <ColorPicker color={props.brushColor} setColor={props.setBrushColor} />

            {/* Brush Settings */}
            <BrushSettings
              size={props.brushSize}
              setSize={props.setBrushSize}
              opacity={props.brushOpacity}
              setOpacity={props.setBrushOpacity}
              hardness={props.brushHardness}
              setHardness={props.setBrushHardness}
              spacing={props.brushSpacing}
              setSpacing={props.setBrushSpacing}
            />

            {/* Blend Mode */}
            <div class="flex items-center gap-2">
              <label class="text-xs text-neutral-400">Blend:</label>
              <select
                value={props.blendMode()}
                onChange={(e) => props.setBlendMode(parseInt(e.currentTarget.value) as BlendMode)}
                class="rounded border border-neutral-600 bg-neutral-700 px-2 py-1 text-neutral-400"
              >
                {Object.entries(BLEND_MODE_LABELS).map(([value, label]) => (
                  <option value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Color Blend Mode */}
            <div class="flex items-center gap-2">
              <label class="text-xs text-neutral-400">Color Space:</label>
              <select
                value={props.colorBlendMode()}
                onChange={(e) => props.setColorBlendMode(parseInt(e.currentTarget.value) as ColorBlendMode)}
                class="rounded border border-neutral-600 bg-neutral-700 px-2 py-1 text-neutral-400"
              >
                {Object.entries(COLOR_BLEND_MODE_LABELS).map(([value, label]) => (
                  <option value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Clear Button */}
            <button
              onClick={props.onClear}
              class="cursor-pointer rounded border border-neutral-600 bg-neutral-700 px-3 py-1.5 text-neutral-400"
            >
              Clear
            </button>

            {/* Reset Transform */}
            <button
              onClick={props.onResetView}
              class="cursor-pointer rounded border border-neutral-600 bg-neutral-700 px-3 py-1.5 text-neutral-400"
            >
              Reset View
            </button>

            {/* Debug Toggle */}
            {props.debugEnabled && props.setDebugEnabled && (
              <button
                onClick={() => props.setDebugEnabled!(!props.debugEnabled!())}
                class={`cursor-pointer rounded border border-neutral-600 px-3 py-1.5 font-mono text-[11px] ${props.debugEnabled() ? 'bg-red-600 text-white' : 'bg-neutral-700 text-neutral-400'}`}
              >
                {props.debugEnabled() ? '🔴 Debug' : '⚪ Debug'}
              </button>
            )}

            {/* Additional content */}
            {props.children}
          </div>
        </>
      )}
    </>
  );
}

export default Toolbar;
