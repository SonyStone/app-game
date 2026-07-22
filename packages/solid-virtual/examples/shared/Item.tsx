import { createEventBus } from '@solid-primitives/event-bus';
import { children, createSignal, For, onMount, Show, splitProps, type ComponentProps } from 'solid-js';
import type { ItemId } from '../virtual-scroll/types';

/** Renders one measurable, editable row with optional nested children. */
export function Item(
  props: Partial<{
    /** Human-readable item title. */
    title: string;
    /** Display index shown in the item header. */
    index: number;
    /** Additional item classes. */
    class: string;
    /** String fields shown by the selected editor. */
    data: Record<string, string>;
    /** Adds a sibling item. */
    onAdd: () => void;
    /** Removes this item. */
    onRemove: () => void;
    /** Replaces data parsed by the JSON editor. */
    onValueChange: (data: Record<string, string>) => void;
    /** Changes one field rendered by the attribute editor. */
    onAttributeChange: (name: string, value: string) => void;
    /** Changes the flat-list item ID. */
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
  const [error, setError] = createSignal(false);
  const { listen, handlers } = createDragHandler({ pointerCapture: true });
  let elementRef!: HTMLElement;
  let height = 0;

  onMount(() => {
    height = elementRef.offsetHeight;
    listen(({ deltaY, type }) => {
      elementRef.style.height = height + deltaY + 'px';
      if (type === 'end') height = elementRef.offsetHeight;
    });
  });

  return (
    <div class="contents">
      <li
        {...others}
        ref={(element) => {
          if (others.ref instanceof Function) others.ref(element);
          else if (others.ref) others.ref = element;
          elementRef = element;
        }}
        class={[
          'relative flex min-h-9 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition-colors hover:border-zinc-300',
          local.class
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <header class="flex h-9 w-full shrink-0 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-2.5 text-xs">
          <Show when={local.onExpandedChange}>
            <button
              type="button"
              class="grid h-5 w-5 shrink-0 place-items-center rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-950"
              aria-label={local.expanded ? 'Collapse element' : 'Expand element'}
              aria-expanded={local.expanded}
              onClick={() => local.onExpandedChange?.(!local.expanded)}
            >
              {local.expanded ? '−' : '+'}
            </button>
          </Show>
          <span class="font-mono text-[10px] text-zinc-400">{String(local.index ?? 0).padStart(3, '0')}</span>
          <span class="min-w-0 truncate font-medium text-zinc-800">{local.title}</span>
          <Show when={local.onAdd}>
            <button
              type="button"
              class="ms-auto grid h-6 w-6 place-items-center rounded border border-zinc-200 bg-white text-sm text-zinc-500 hover:border-zinc-300 hover:text-zinc-950"
              aria-label="Add item after"
              onClick={local.onAdd}
            >
              +
            </button>
          </Show>
          <Show when={local.onRemove}>
            <button
              type="button"
              class="grid h-6 w-6 place-items-center rounded border border-zinc-200 bg-white text-sm text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              aria-label="Remove item"
              onClick={local.onRemove}
            >
              −
            </button>
          </Show>
        </header>

        <Show when={local.expanded !== false}>
          <Show
            when={local.onAttributeChange}
            fallback={
              <textarea
                rows={Math.min(16, Object.values(local.data ?? {}).length + 2)}
                value={JSON.stringify(local.data, null, 2)}
                class={[
                  'm-3 min-h-20 resize-y rounded-md border bg-zinc-50 p-3 font-mono text-[11px] leading-5 text-zinc-700 outline-none focus:border-zinc-400',
                  error() ? 'border-red-400 ring-2 ring-red-100' : 'border-zinc-200'
                ].join(' ')}
                spellcheck={false}
                onInput={(event) => {
                  try {
                    local.onValueChange?.(JSON.parse(event.currentTarget.value));
                    setError(false);
                  } catch {
                    setError(true);
                  }
                }}
              />
            }
          >
            <div class="grid gap-2 p-3">
              <For each={Object.keys(local.data ?? {})}>
                {(name) => (
                  <label class="grid gap-1">
                    <span class="font-mono text-[10px] text-zinc-500">{name}</span>
                    <textarea
                      rows={attributeRows(local.data?.[name] ?? '')}
                      value={local.data?.[name] ?? ''}
                      class="min-h-8 resize-y rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px] leading-5 text-zinc-700 outline-none focus:border-zinc-400 focus:bg-white"
                      spellcheck={false}
                      onInput={(event) => local.onAttributeChange?.(name, event.currentTarget.value)}
                    />
                  </label>
                )}
              </For>
            </div>
          </Show>

          <Show when={local.onItemIdChange}>
            <label class="flex items-center gap-3 border-t border-zinc-200 bg-zinc-50 px-3 py-2">
              <span class="font-mono text-[10px] text-zinc-400 uppercase">ID</span>
              <input
                value={local.title}
                onInput={(event) => local.onItemIdChange?.(event.currentTarget.value as ItemId)}
                type="text"
                class="min-w-0 flex-1 bg-transparent font-mono text-xs text-zinc-700 outline-none"
              />
            </label>
          </Show>

          <Show when={resolved()}>
            <div role="group" class="relative m-2 flex flex-col gap-2 border-s border-zinc-300 ps-2">
              {resolved()}
            </div>
          </Show>

          <button
            {...handlers}
            type="button"
            aria-label="Resize item"
            class="absolute inset-x-0 bottom-0 h-1 cursor-ns-resize bg-transparent hover:bg-zinc-300 active:bg-zinc-400"
          />
        </Show>
      </li>
    </div>
  );
}

function attributeRows(value: string): number {
  return Math.min(4, Math.max(1, Math.ceil(value.length / 80)));
}

function createDragHandler(props?: { pointerCapture?: boolean }) {
  let deltaY = 0;
  let deltaX = 0;
  let target: HTMLElement | undefined;
  const { listen, emit } = createEventBus<{ deltaY: number; deltaX: number; type: 'start' | 'move' | 'end' }>();

  const onPointerDown = (event: PointerEvent) => {
    event.preventDefault();
    if (!(event.target instanceof HTMLElement)) return;

    target = event.target;
    if (props?.pointerCapture) target.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startX = event.clientX;
    emit({ deltaY: 0, deltaX: 0, type: 'start' });

    const onPointerMove = (moveEvent: PointerEvent) => {
      deltaY = moveEvent.clientY - startY;
      deltaX = moveEvent.clientX - startX;
      emit({ deltaY, deltaX, type: 'move' });
    };

    const onPointerUp = () => {
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('pointerup', onPointerUp);
      if (target && props?.pointerCapture) target.releasePointerCapture(event.pointerId);
      target = undefined;
      emit({ deltaY, deltaX, type: 'end' });
      deltaY = 0;
      deltaX = 0;
    };

    addEventListener('pointermove', onPointerMove);
    addEventListener('pointerup', onPointerUp);
  };

  return { listen, handlers: { onPointerDown } };
}
