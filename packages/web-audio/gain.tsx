import type { ComponentProps } from 'solid-js';

export const Gain = (props: { gain?: number; changeGain?: (value: number) => void } & ComponentProps<'div'>) => {
  return (
    <div class="flex flex-col" {...props}>
      <label for="detune" class="font-mono text-sm">
        Gain: {props.gain}
      </label>
      <input
        class="w-100"
        type="range"
        max={1}
        step={0.01}
        id="detune"
        value={props.gain}
        onInput={(event) => {
          props.changeGain?.(event.target.valueAsNumber);
        }}
      />
    </div>
  );
};
