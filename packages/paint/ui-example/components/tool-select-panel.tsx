import { For } from 'solid-js';

export const ToolSelectPanel = (props: { isActive?: boolean }) => {
  return (
    <div
      class="absolute right-full flex w-40 translate-x-10 flex-col rounded border border-black bg-white p-1 text-xs transition-transform [.active_&]:translate-x-0"
      classList={{ 'pointer-events-auto': props.isActive, 'pointer-events-none': !props.isActive }}
    >
      Tools
      <div class="flex flex-wrap gap-1">
        <For each={['Pen', 'Brush', 'Color picker']}>
          {(tool) => <button class="h-8 w-8 truncate border border-black">{tool}</button>}
        </For>
      </div>
    </div>
  );
};
