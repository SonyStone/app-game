import { For } from 'solid-js';

export const LayersPanel = (props: { isActive?: boolean }) => {
  return (
    <div
      class="absolute -top-full left-full flex w-40 -translate-x-10 flex-col rounded border  border-black bg-white p-1 text-xs transition-transform [.active_&]:translate-x-0"
      classList={{ 'pointer-events-auto': props.isActive, 'pointer-events-none': !props.isActive }}
    >
      Layers
      <For each={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}>
        {(layer) => (
          <div class="flex border-t border-black text-xs last:border-b">
            <button class="bg-blue-3 h-8 w-8 flex-shrink-0"></button>
            <button class="bg-blue-2 h-8 w-8 flex-shrink-0"></button>
            <button class="flex w-full select-none flex-col truncate">
              <span>Type</span>
              <span>Layer {layer}</span>
            </button>
          </div>
        )}
      </For>
    </div>
  );
};
