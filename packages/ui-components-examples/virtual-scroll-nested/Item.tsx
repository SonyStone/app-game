import { createEventBus } from '@solid-primitives/event-bus';
import { children, createSignal, For, onMount, Show, splitProps, type ComponentProps } from 'solid-js';
import type { ItemId } from '../virtual-scroll';
import { getColorByIndex } from '../virtual-scroll/get-bg-color';

/** Renders one measurable card with optional attribute editing and tree controls. */
export function Item(
  props: Partial<{
    /** Human-readable card title. */
    title: string;
    /** Display index used to select the card color. */
    index: number;
    /** Additional card classes. */
    class: string;
    /** String fields shown by the selected editor. */
    data: Record<string, string>;
    /** Adds a sibling item. */
    onAdd: () => void;
    /** Removes this item. */
    onRemove: () => void;
    /** Replaces data parsed by the legacy JSON editor. */
    onValueChange: (data: Record<string, string>) => void;
    /** Changes one field rendered by the attribute editor. */
    onAttributeChange: (name: string, value: string) => void;
    /** Changes the legacy flat-list item ID. */
    onItemIdChange: (id: ItemId) => void;
    /** Whether nested children are visible. */
    expanded: boolean;
    /** Changes nested-child visibility. */
    onExpandedChange: (expanded: boolean) => void;
  }> &
    ComponentProps<'li'>
) {
  const [local, others] = splitProps(props, [
    'title',
    'index',
    'children',
    'class',
    'data',
    'onAdd',
    'onRemove',
    'onValueChange',
    'onAttributeChange',
    'onItemIdChange',
    'expanded',
    'onExpandedChange'
  ]);
  const resolved = children(() => local.children);

  const { listen, handlers } = createDragHandler({
    pointerCapture: true
  });
  let elementRef!: HTMLElement;
  let height = 0;

  onMount(() => {
    height = elementRef.offsetHeight;
    listen(({ deltaY, type }) => {
      elementRef.style.height = height + deltaY + 'px';
      if (type === 'end') {
        height = elementRef.offsetHeight;
      }
    });
  });

  const [error, setError] = createSignal(false);

  return (
    <test-item class="contents">
      <li
        {...others}
        ref={(ref) => {
          if (others.ref instanceof Function) {
            others.ref(ref);
          } else if (others.ref) {
            others.ref = ref;
          }

          elementRef = ref;
        }}
        class={[
          'rounded-2 [&:not(:has(.group-child:hover))]:hover:(outline-size-2) relative flex min-h-8 flex-col overflow-hidden border',
          getColorByIndex(local.index ?? 0),
          local.class
        ].join(' ')}
      >
        <div class="flex w-full place-items-center gap-1 border-b bg-white/50 p-1 text-sm">
          <Show when={local.onExpandedChange}>
            <button
              type="button"
              class="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-black/10"
              aria-label={local.expanded ? 'Collapse element' : 'Expand element'}
              aria-expanded={local.expanded}
              onClick={() => local.onExpandedChange?.(!local.expanded)}
            >
              {local.expanded ? '▾' : '▸'}
            </button>
          </Show>
          Header {local.title}
          <Show when={local.onAdd}>
            <button class="ms-auto flex h-4 w-4 place-content-center place-items-center border" onClick={local.onAdd}>
              +
            </button>
          </Show>
          <Show when={local.onRemove}>
            <button class="flex h-4 w-4 place-content-center place-items-center border" onClick={local.onRemove}>
              -
            </button>
          </Show>
        </div>
        <Show when={local.expanded !== false}>
          <Show
            when={local.onAttributeChange}
            fallback={
              <textarea
                rows={Object.values(local.data ?? {}).length + 3}
                class={[
                  'm-2 h-auto resize-none border-0 bg-transparent p-2 text-sm outline-none',
                  error() ? 'ring-1 ring-red-500' : ''
                ].join(' ')}
                onInput={(e) => {
                  try {
                    const result = JSON.parse(e.currentTarget.value);
                    local.onValueChange?.(result);
                    setError(false);
                  } catch {
                    setError(true);
                  }
                }}
              >
                {JSON.stringify(local.data, null, 2)}
              </textarea>
            }
          >
            <div class="m-2 flex flex-col gap-2">
              <For each={Object.keys(local.data ?? {})}>
                {(name) => (
                  <label class="grid gap-1 text-xs">
                    <span class="font-mono text-slate-600">{name}</span>
                    <textarea
                      rows={attributeRows(local.data?.[name] ?? '')}
                      value={local.data?.[name] ?? ''}
                      class="min-h-8 resize-y rounded border border-black/20 bg-white/50 px-2 py-1 font-mono text-sm outline-none focus:border-blue-500"
                      onInput={(event) => local.onAttributeChange?.(name, event.currentTarget.value)}
                    />
                  </label>
                )}
              </For>
            </div>
          </Show>
          <Show when={local.onItemIdChange}>
            <div class="flex w-full items-center border-t bg-gray-50/50 p-1 text-sm">
              <label class="m-2 text-xs text-gray-500">ID:</label>
              <input
                value={local.title}
                onInput={(e) => local.onItemIdChange?.(e.currentTarget.value as ItemId)}
                type="text"
                class="m-2 h-auto resize-none border-0 bg-transparent outline-none"
              />
            </div>
          </Show>

          <Show when={resolved()}>
            <div role="group" class="relative m-2 flex flex-col gap-2 border-s-2 border-slate-300">
              {resolved()}
            </div>
          </Show>
          <button
            {...handlers}
            type="button"
            class="inset-x absolute bottom-0 w-full cursor-ns-resize border-t-5 border-gray-300 hover:border-gray-400 active:border-gray-500"
          ></button>
        </Show>
      </li>
    </test-item>
  );
}

function attributeRows(value: string): number {
  return Math.min(4, Math.max(1, Math.ceil(value.length / 80)));
}

const createDragHandler = (props?: { pointerCapture?: boolean }) => {
  let deltaY = 0;
  let deltaX = 0;
  const { listen, emit } = createEventBus<{ deltaY: number; deltaX: number; type: 'start' | 'move' | 'end' }>();
  let target: HTMLElement | undefined;

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    target = e.target as HTMLElement;
    if (target && props?.pointerCapture) {
      target.setPointerCapture(e.pointerId);
    }
    const startY = e.clientY;
    const startX = e.clientX;
    emit({ deltaY: 0, deltaX: 0, type: 'start' });

    const onPointerMove = (e: PointerEvent) => {
      deltaY = e.clientY - startY;
      deltaX = e.clientX - startX;
      emit({ deltaY, deltaX, type: 'move' });
    };

    const onPointerUp = () => {
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('pointerup', onPointerUp);
      if (target && props?.pointerCapture) {
        target.releasePointerCapture(e.pointerId);
        target = undefined;
      }
      emit({ deltaY, deltaX, type: 'end' });
      deltaY = 0;
      deltaX = 0;
    };
    addEventListener('pointermove', onPointerMove);
    addEventListener('pointerup', onPointerUp);
  };

  return { listen, handlers: { onPointerDown } };
};
