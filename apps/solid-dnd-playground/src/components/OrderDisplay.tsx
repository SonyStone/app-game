import { For, type JSX } from 'solid-js';
import { type DemoItem } from '../data';

export type OrderDisplayProps = {
  items: DemoItem[];
  columns?: number;
};

export function OrderDisplay(props: OrderDisplayProps): JSX.Element {
  const isGrid = () => props.columns !== undefined;

  return (
    <div class={isGrid() ? 'flex flex-col gap-1' : 'flex items-center gap-2'}>
      <span class="text-xs text-neutral-500">{isGrid() ? `Order (${props.columns} columns):` : 'Order:'}</span>
      <div
        class={isGrid() ? 'flex flex-wrap gap-1' : 'flex gap-1'}
        style={isGrid() ? { 'max-width': `${props.columns! * 32 + (props.columns! - 1) * 4}px` } : undefined}
      >
        <For each={props.items}>
          {(item) => (
            <span
              class={`inline-flex items-center justify-center rounded text-xs font-bold text-white ${isGrid() ? 'h-7 w-7' : 'h-6 w-6'}`}
              style={{ background: item.color }}
            >
              {item.id}
            </span>
          )}
        </For>
      </div>
    </div>
  );
}
