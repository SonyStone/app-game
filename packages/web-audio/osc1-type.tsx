import type { ComponentProps } from 'solid-js';

export const Osc1Type = (
  props: { type?: string; changeType?: (value: OscillatorType) => void } & ComponentProps<'div'>
) => {
  return (
    <div class="flex flex-col" {...props}>
      <label for="osc1Type" class="font-mono text-sm">
        Wave Type: {props.type}
      </label>
      <select
        id="osc1Type"
        value={props.type}
        onChange={(event) => {
          props.changeType?.(event.target.value as OscillatorType);
        }}
      >
        <option value="sawtooth">Sawtooth</option>
        <option value="sine">Sine</option>
        <option value="square">Square</option>
        <option value="triangle">Triangle</option>
      </select>
    </div>
  );
};
