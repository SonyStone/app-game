import { createEventBus } from '@solid-primitives/event-bus';
import { children, ComponentProps, createSignal, onMount, Show, splitProps } from 'solid-js';
import { ItemId } from '../virtual-scroll';
import { getColorByIndex } from '../virtual-scroll/get-bg-color';

/**
 * A simple virtual list implementation
 *
 * We need to track:
 * - container size
 *
 **/
export function Item(
  props: Partial<{
    title: string;
    index: number;
    class: string;
    data: Record<string, string>;
    onAdd: () => void;
    onRemove: () => void;
    onValueChange: (data: Record<string, string>) => void;
    onItemIdChange: (id: ItemId) => void;
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
    'onItemIdChange'
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
    <test-item class="contesnts">
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
          Header {local.title}
          <Show when={local.onAdd}>
            <button class="ms-auto flex h-4 w-4 place-content-center place-items-center border" onClick={local.onAdd}>
              +
            </button>
          </Show>
          <Show when={local.onRemove}>
            <button class=" flex h-4 w-4 place-content-center place-items-center border" onClick={local.onRemove}>
              -
            </button>
          </Show>
        </div>
        <textarea
          rows={Object.values(local.data as unknown as unknown[]).length + 3}
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
        <div class="flex w-full items-center border-t bg-gray-50/50 p-1 text-sm">
          <label class="m-2 text-xs text-gray-500">ID:</label>
          <input
            value={local.title}
            onInput={(e) => local.onItemIdChange?.(e.currentTarget.value as ItemId)}
            type="text"
            class="m-2 h-auto resize-none border-0 bg-transparent outline-none"
          />
        </div>

        <div class="flex flex-col gap-2 p-2">
          <Show when={resolved()}>
            <ul class="flex flex-col gap-2">{resolved()}</ul>
          </Show>
        </div>
        <button
          {...handlers}
          type="button"
          class="inset-x border-t-5 absolute bottom-0 w-full cursor-ns-resize border-gray-300 hover:border-gray-400 active:border-gray-500 "
        ></button>
      </li>
    </test-item>
  );
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
