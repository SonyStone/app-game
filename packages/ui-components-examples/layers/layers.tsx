import type { JSX } from '@solidjs/web';
import { createSignal, For } from 'solid-js';
import folder from './folder.png?url';

type LayerId = number;

/** Renders a native HTML drag-and-drop layer sorting example. */
export default function Layers(): JSX.Element {
  return (
    <div style={{ '--icon-folder': `url(${folder})` }}>
      <div class="w-268px bg-[#474747]">
        <SortableVerticalListExample />
      </div>
    </div>
  );
}

/** Reorders layer rows using browser drag events, with no Solid-1-only directives. */
export function SortableVerticalListExample(): JSX.Element {
  const [items, setItems] = createSignal<LayerId[]>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const [activeItem, setActiveItem] = createSignal<LayerId>();

  const moveActiveItem = (target: LayerId) => {
    const active = activeItem();

    if (active === undefined || active === target) {
      return;
    }

    setItems((current) => {
      const next = current.slice();
      const fromIndex = next.indexOf(active);
      const toIndex = next.indexOf(target);

      next.splice(toIndex, 0, ...next.splice(fromIndex, 1));
      return next;
    });
  };

  return (
    <div class="column self-stretch">
      <For each={items()}>
        {(item) => (
          <div
            draggable="true"
            class={[
              'h-28px flex cursor-grab border border-solid border-[#252525] text-white',
              { 'opacity-25': activeItem() === item }
            ]}
            onDragStart={(event) => {
              setActiveItem(item);
              event.dataTransfer?.setData('text/plain', String(item));

              if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              moveActiveItem(item);
              setActiveItem(undefined);
            }}
            onDragEnd={() => setActiveItem(undefined)}
          >
            <div class="w-1.7em filter-invert-78 h-full [background-image:var(--icon-folder)] bg-size-[15px] bg-center bg-no-repeat" />
            {item}
          </div>
        )}
      </For>
    </div>
  );
}
