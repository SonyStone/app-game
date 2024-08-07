import type { ComponentProps } from 'solid-js';

export const Frequency = (
  props: { freq?: number; changeFreq?: (value: number) => void; max?: number } & ComponentProps<'div'>
) => {
  return (
    <div class="flex flex-col" {...props}>
      <label for="frequency" class="font-mono text-sm">
        Frequency: {props.freq}
      </label>
      <input
        class="w-100"
        type="range"
        max={props.max ?? 5000}
        id="frequency"
        value={props.freq}
        onInput={(event) => {
          props.changeFreq?.(event.target.valueAsNumber);
        }}
      />
    </div>
  );
};
