import { For } from 'solid-js';

/** Labelled row of toggle buttons; exactly one option is pressed. */
export function Segmented<T extends string>(props: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div class="flex items-center gap-2" role="group" aria-label={props.label}>
      <span>{props.label}</span>
      <div class="flex overflow-hidden rounded-md border border-slate-300">
        <For each={props.options}>
          {(option) => (
            <button
              type="button"
              aria-pressed={props.value === option ? 'true' : 'false'}
              class={[
                'px-3 py-1 capitalize',
                props.value === option ? '!bg-blue-500 text-white' : '!bg-white hover:!bg-slate-100'
              ]}
              onClick={() => props.onChange(option)}
            >
              {option}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
