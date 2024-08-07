import type { ComponentProps } from 'solid-js';

export const Detune = (props: { detune?: number; changeDetune?: (value: number) => void } & ComponentProps<'div'>) => {
  return (
    <div class="flex flex-col" {...props}>
      <label for="detune" class="font-mono text-sm">
        Detune: {props.detune}
      </label>
      <input
        class="w-100"
        type="range"
        max={100}
        id="detune"
        value={props.detune}
        onInput={(event) => {
          props.changeDetune?.(event.target.valueAsNumber);
        }}
      />
    </div>
  );
};
