import type { ComponentProps } from 'solid-js';

let global_id = 0;

export const Range = (
  props: {
    value?: number;
    valueChange?: (value: number) => void;
    name?: string;
    min?: number;
    max?: number;
    step?: number;
  } & ComponentProps<'div'>
) => {
  const id = global_id++;
  return (
    <div class="flex flex-col" {...props}>
      <label for={`${props.name}-${id}`} class="font-mono text-sm capitalize">
        {props.name}: {props.value}
      </label>
      <input
        class="w-100"
        type="range"
        min={props.min ?? 0}
        max={props.max ?? 100}
        step={props.step ?? 1}
        id={`${props.name}-${id}`}
        value={props.value}
        onInput={(event) => {
          props.valueChange?.(event.target.valueAsNumber);
        }}
      />
    </div>
  );
};
