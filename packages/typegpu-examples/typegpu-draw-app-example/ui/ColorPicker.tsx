/**
 * ColorPicker - Simple color input component
 *
 * Wraps the native color input with a label
 */

import type { Accessor, JSX, Setter } from 'solid-js';

export interface ColorPickerProps {
  /** Current color (hex format) */
  color: Accessor<string>;

  /** Color setter */
  setColor: Setter<string>;

  /** Label text */
  label?: string;

  /** Custom label style */
  labelStyle?: JSX.CSSProperties;

  /** Custom input style */
  inputStyle?: JSX.CSSProperties;

  /** Input size */
  size?: number;
}

const defaultLabelStyle: JSX.CSSProperties = {
  color: '#ccc',
  'font-size': '12px'
};

const defaultInputStyle: JSX.CSSProperties = {
  border: 'none',
  cursor: 'pointer'
};

export function ColorPicker(props: ColorPickerProps): JSX.Element {
  const label = () => props.label ?? 'Color:';
  const size = () => props.size ?? 32;

  const labelStyle = () => ({ ...defaultLabelStyle, ...props.labelStyle });
  const inputStyle = () => ({
    ...defaultInputStyle,
    width: `${size()}px`,
    height: `${size()}px`,
    ...props.inputStyle
  });

  return (
    <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
      <label style={labelStyle()}>{label()}</label>
      <input
        type="color"
        value={props.color()}
        onInput={(e) => props.setColor(e.currentTarget.value)}
        style={inputStyle()}
      />
    </div>
  );
}
