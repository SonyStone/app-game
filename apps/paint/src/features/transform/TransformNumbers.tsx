import type { BoxState, TransformSettings } from './createTransform';
import styles from './Transform.module.css';

/**
 * Exact values of the transform box: width and height as percentages of the original, the clockwise angle in degrees
 * and the offset in document pixels. A value applies when it is committed, with Enter or by leaving the field; with
 * proportions kept, width and height change together. A distorted or warped box has no such values, so the fields are disabled.
 */
export function TransformNumbers(props: {
  /** Where the panel goes: its horizontal center and top, in CSS pixels of the canvas. */
  placement: { left: number; top: number };
  box: BoxState;
  settings: TransformSettings;
  onChange: (box: BoxState) => void;
}) {
  const disabled = () => props.box.corners !== undefined || props.box.warp !== undefined;
  const degrees = () => normalizeDegrees((props.box.angle * 180) / Math.PI);
  const setScale = (axis: 'x' | 'y', percent: number) => {
    const sign = Math.sign(props.box.scale[axis]) || 1;
    const next = (sign * Math.max(0.1, Math.abs(percent))) / 100;
    if (props.settings.proportional) {
      const factor = next / props.box.scale[axis];
      props.onChange({ ...props.box, scale: { x: props.box.scale.x * factor, y: props.box.scale.y * factor } });
      return;
    }

    props.onChange({ ...props.box, scale: { ...props.box.scale, [axis]: next } });
  };

  return (
    <div
      class={styles.numbers}
      style={{ left: `${props.placement.left}px`, top: `${props.placement.top}px` }}
      role="group"
      aria-label="Transform values"
    >
      <Field
        label="W"
        name="Width"
        unit="%"
        value={Math.abs(props.box.scale.x) * 100}
        disabled={disabled()}
        onCommit={(value) => setScale('x', value)}
      />
      <Field
        label="H"
        name="Height"
        unit="%"
        value={Math.abs(props.box.scale.y) * 100}
        disabled={disabled()}
        onCommit={(value) => setScale('y', value)}
      />
      <Field
        label="∠"
        name="Angle"
        unit="°"
        value={degrees()}
        disabled={disabled()}
        onCommit={(value) => props.onChange({ ...props.box, angle: (normalizeDegrees(value) * Math.PI) / 180 })}
      />
      <Field
        label="X"
        name="Move horizontally"
        unit="px"
        value={props.box.offset.x}
        disabled={disabled()}
        onCommit={(value) => props.onChange({ ...props.box, offset: { ...props.box.offset, x: value } })}
      />
      <Field
        label="Y"
        name="Move vertically"
        unit="px"
        value={props.box.offset.y}
        disabled={disabled()}
        onCommit={(value) => props.onChange({ ...props.box, offset: { ...props.box.offset, y: value } })}
      />
    </div>
  );
}

/** One labeled number, shown to a tenth; an invalid entry reverts to the current value. */
function Field(props: {
  label: string;
  name: string;
  unit: string;
  value: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const shown = () => String(Math.round(props.value * 10) / 10);
  return (
    <label class={styles.field} title={props.name}>
      <span>{props.label}</span>
      <input
        aria-label={props.name}
        inputmode="decimal"
        value={shown()}
        disabled={props.disabled}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        onChange={(event) => {
          const value = Number(event.currentTarget.value.replace(',', '.'));
          if (Number.isFinite(value)) {
            props.onCommit(value);
          }

          event.currentTarget.value = shown();
        }}
      />
      <small>{props.unit}</small>
    </label>
  );
}

/** An angle in degrees within `(-180, 180]`. */
function normalizeDegrees(value: number) {
  const turned = ((value % 360) + 360) % 360;
  return turned > 180 ? turned - 360 : turned;
}
