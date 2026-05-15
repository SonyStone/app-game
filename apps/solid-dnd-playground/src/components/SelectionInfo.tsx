import { For, Show, type JSX } from 'solid-js';
import { type DemoItem } from '../data';

export type SelectionInfoProps = {
  selected: DemoItem[];
  onClear: () => void;
  hint?: string;
};

export function SelectionInfo(props: SelectionInfoProps): JSX.Element {
  const count = () => props.selected.length;

  return (
    <div class="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <span class="text-xs text-neutral-500">Selection:</span>

      <Show
        when={count() > 0}
        fallback={
          <span class="text-xs text-neutral-500 italic">
            {props.hint ?? 'Click items to select · Ctrl+click to multi-select · Shift+click for range'}
          </span>
        }
      >
        <div class="flex flex-wrap gap-1">
          <For each={props.selected}>
            {(item) => {
              return (
                <span class="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-xs text-purple-300">
                  <div class="h-2 w-2 rounded-full" style={{ background: item?.color ?? '#666' }} />
                  {item?.label ?? item.id}
                </span>
              );
            }}
          </For>
        </div>

        <button
          onClick={props.onClear}
          class="ml-auto cursor-pointer rounded px-2 py-0.5 text-xs text-neutral-400 hover:bg-white/10 hover:text-neutral-200"
        >
          Clear
        </button>
      </Show>
    </div>
  );
}
