import { ReactiveMap } from '@solid-primitives/map';
import { getElementSize, NullableSize } from '@solid-primitives/resize-observer';
import { createStaticStore, StaticStoreSetter } from '@solid-primitives/static-store';
import { access, Size } from '@solid-primitives/utils';
import { Accessor, createEffect, createSignal, onCleanup, sharedConfig } from 'solid-js';

const ELEMENT_SIZE_FALLBACK = { width: null, height: null } as const satisfies NullableSize;

export function createMultipleElementSizes() {
  const [anySizeChanged, setAnySizeChanged] = createSignal<void>(void 0, { equals: false });

  const map = new ReactiveMap<Element, [access: NullableSize, write: StaticStoreSetter<NullableSize>]>();

  const ro = new ResizeObserver(([entry]) => {
    const target = entry.target;
    map.get(target)?.[1](getElementSize(entry.target));
    setAnySizeChanged();
  });
  onCleanup(() => ro.disconnect());

  function observe(element: Element): Readonly<Size>;
  function observe(element: Accessor<Element | undefined>): Readonly<NullableSize>;
  function observe(element: Accessor<Element | undefined> | Element): Readonly<NullableSize> {
    const isFn = typeof element === 'function';

    const staticStore = createStaticStore(
      sharedConfig.context || isFn ? ELEMENT_SIZE_FALLBACK : getElementSize(element)
    );

    const [size, setSize] = staticStore;

    if (isFn) {
      createEffect(() => {
        const el = access(element);
        if (!el) return;
        ro.observe(el);
        setSize(getElementSize(el));
        map.set(el, staticStore);
        onCleanup(() => {
          ro.unobserve(el);
          map.delete(el);
        });
      });
    } else if (element) {
      ro.observe(element);
      map.set(element, staticStore);
      onCleanup(() => {
        ro.unobserve(element);
        map.delete(element);
      });
    }

    return size;
  }

  return {
    anySizeChanged,
    observe
  };
}
