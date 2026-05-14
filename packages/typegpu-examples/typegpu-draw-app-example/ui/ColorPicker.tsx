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

  /** Input size */
  size?: number;
}

export function ColorPicker(props: ColorPickerProps): JSX.Element {
  const label = () => props.label ?? 'Color:';
  const size = () => props.size ?? 32;

  return (
    <div class="flex items-center gap-2">
      <label class="text-xs text-neutral-400">{label()}</label>
      <input
        type="color"
        value={props.color()}
        onInput={(e) => props.setColor(e.currentTarget.value)}
        class="cursor-pointer border-none"
        style={{ width: `${size()}px`, height: `${size()}px` }}
      />
    </div>
  );
}
