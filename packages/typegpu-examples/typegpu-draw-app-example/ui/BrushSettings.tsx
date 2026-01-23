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

  /** Custom label style */
  labelStyle?: JSX.CSSProperties;

  /** Custom value style */
  valueStyle?: JSX.CSSProperties;

  /** Custom slider style */
  sliderStyle?: JSX.CSSProperties;
}

const defaultLabelStyle: JSX.CSSProperties = {
  color: '#ccc',
  'font-size': '12px'
};

const defaultValueStyle: JSX.CSSProperties = {
  color: '#999',
  'font-size': '12px',
  width: '30px'
};

const defaultSliderStyle: JSX.CSSProperties = {
  width: '80px'
};

export function BrushSettings(props: BrushSettingsProps): JSX.Element {
  const sizeMin = () => props.sizeMin ?? 1;
  const sizeMax = () => props.sizeMax ?? 100;
  const spacingMin = () => props.spacingMin ?? 1;
  const spacingMax = () => props.spacingMax ?? 100;

  const labelStyle = () => ({ ...defaultLabelStyle, ...props.labelStyle });
  const valueStyle = () => ({ ...defaultValueStyle, ...props.valueStyle });
  const sliderStyle = () => ({ ...defaultSliderStyle, ...props.sliderStyle });

  return (
    <>
      {/* Brush Size */}
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
        <label style={labelStyle()}>Size:</label>
        <input
          type="range"
          min={sizeMin()}
          max={sizeMax()}
          value={props.size()}
          onInput={(e) => props.setSize(parseInt(e.currentTarget.value))}
          style={sliderStyle()}
        />
        <span style={valueStyle()}>{props.size()}</span>
      </div>

      {/* Brush Opacity */}
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
        <label style={labelStyle()}>Opacity:</label>
        <input
          type="range"
          min="0"
          max="100"
          value={props.opacity() * 100}
          onInput={(e) => props.setOpacity(parseInt(e.currentTarget.value) / 100)}
          style={sliderStyle()}
        />
        <span style={valueStyle()}>{Math.round(props.opacity() * 100)}%</span>
      </div>

      {/* Brush Hardness */}
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
        <label style={labelStyle()}>Hardness:</label>
        <input
          type="range"
          min="0"
          max="100"
          value={props.hardness() * 100}
          onInput={(e) => props.setHardness(parseInt(e.currentTarget.value) / 100)}
          style={sliderStyle()}
        />
        <span style={valueStyle()}>{Math.round(props.hardness() * 100)}%</span>
      </div>

      {/* Brush Spacing */}
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
        <label style={labelStyle()}>Spacing:</label>
        <input
          type="range"
          min={spacingMin()}
          max={spacingMax()}
          value={props.spacing()}
          onInput={(e) => props.setSpacing(parseInt(e.currentTarget.value))}
          style={sliderStyle()}
        />
        <span style={valueStyle()}>{props.spacing()}%</span>
      </div>
    </>
  );
}

export default BrushSettings;
