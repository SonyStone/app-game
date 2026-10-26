import type { JSX } from '@solidjs/web';
import './poster.css';

/** A numbered section heading on a black rule, with anything in `children` at its right end. */
export function Section(props: { number: string; title: string; children?: JSX.Element }) {
  return (
    <div class="tk-section">
      <span class="tk-number">{props.number}</span>
      <span class="tk-section-title">{props.title}</span>
      <span class="tk-rule" />
      {props.children}
    </div>
  );
}

/**
 * A slider for one knob, in the three columns of `.tk-knobs`: its label, the slider with a notch
 * at the knob's default, and its value as `text`, yellow while it differs from the default.
 *
 * @param onChange - Receives the slider's value as it moves.
 */
export function KnobSlider(props: {
  label: JSX.Element;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  text: string;
  onChange: (value: number) => void;
}) {
  const share = (at: number) => (at - props.min) / (props.max - props.min);
  const changed = () => Math.abs(props.value - props.defaultValue) > props.step * 1e-6;

  return (
    <label class="tk-knob">
      <span class="tk-label">{props.label}</span>
      <span class="tk-slider" style={{ '--fill': share(props.value), '--notch': share(props.defaultValue) }}>
        <span class="tk-notch" />
        <input
          type="range"
          class="tk-range"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          onInput={(event) => props.onChange(Number(event.currentTarget.value))}
        />
      </span>
      <span class={['tk-value', { 'tk-changed': changed() }]}>{props.text}</span>
    </label>
  );
}
