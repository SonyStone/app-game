/**
 * Toolbar - Main drawing app toolbar container
 *
 * Provides the toolbar layout with:
 * - Color picker
 * - Brush settings
 * - Blend mode selectors
 * - Action buttons (Clear, Reset View)
 * - Help text
 */

import type { Accessor, JSX, Setter } from 'solid-js';
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

  /** Show help text */
  showHelp?: boolean;

  /** Custom help text */
  helpText?: string;

  /** Additional toolbar content (children) */
  children?: JSX.Element;
}

const toolbarStyle: JSX.CSSProperties = {
  display: 'flex',
  'align-items': 'center',
  gap: '16px',
  padding: '8px 16px',
  background: '#2a2a2a',
  'border-bottom': '1px solid #444',
  'flex-wrap': 'wrap'
};

const selectStyle: JSX.CSSProperties = {
  background: '#333',
  color: '#ccc',
  border: '1px solid #555',
  padding: '4px 8px',
  'border-radius': '4px'
};

const buttonStyle: JSX.CSSProperties = {
  background: '#444',
  color: '#ccc',
  border: '1px solid #555',
  padding: '6px 12px',
  'border-radius': '4px',
  cursor: 'pointer'
};

const helpStyle: JSX.CSSProperties = {
  padding: '4px 16px',
  background: '#222',
  'font-size': '11px',
  color: '#888'
};

const labelStyle: JSX.CSSProperties = {
  color: '#ccc',
  'font-size': '12px'
};

export function Toolbar(props: ToolbarProps): JSX.Element {
  const showHelp = () => props.showHelp ?? true;
  const helpText = () =>
    props.helpText ?? 'Draw with left mouse • Middle mouse to pan • Scroll to zoom • Alt+drag to rotate';

  return (
    <>
      <div style={toolbarStyle}>
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
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <label style={labelStyle}>Blend:</label>
          <select
            value={props.blendMode()}
            onChange={(e) => props.setBlendMode(parseInt(e.currentTarget.value) as BlendMode)}
            style={selectStyle}
          >
            {Object.entries(BLEND_MODE_LABELS).map(([value, label]) => (
              <option value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* Color Blend Mode */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <label style={labelStyle}>Color Space:</label>
          <select
            value={props.colorBlendMode()}
            onChange={(e) => props.setColorBlendMode(parseInt(e.currentTarget.value) as ColorBlendMode)}
            style={selectStyle}
          >
            {Object.entries(COLOR_BLEND_MODE_LABELS).map(([value, label]) => (
              <option value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* Clear Button */}
        <button onClick={props.onClear} style={buttonStyle}>
          Clear
        </button>

        {/* Reset Transform */}
        <button onClick={props.onResetView} style={buttonStyle}>
          Reset View
        </button>

        {/* Additional content */}
        {props.children}
      </div>

      {/* Help text */}
      {showHelp() && <div style={helpStyle}>{helpText()}</div>}
    </>
  );
}

export default Toolbar;
