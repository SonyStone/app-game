import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { createVirtualNestedList } from './index';

/**
 * Creates a headless dynamic-height virtual list.
 *
 * This is the flat-list form of {@link createVirtualNestedList}. It returns the
 * same `children()` nodes and measurement refs without adding a provider or a
 * component wrapper.
 */
export function createVirtualDynamicList<T>(props: {
  /** Items in display order. May be a reactive accessor. */
  items: MaybeAccessor<readonly T[]>;
  /** Scrollable element containing the rendered list. */
  elementRef: MaybeAccessor<HTMLElement | undefined>;
  /** Estimated item height in pixels. Defaults to `120`. */
  estimateHeight?: number | ((item: T, index: number) => number);
  /** Extra pixels rendered before and after the viewport. Defaults to `600`. */
  overscan?: MaybeAccessor<number>;
  /** Vertical space after every item. Defaults to `8`. */
  gap?: MaybeAccessor<number>;
}) {
  return createVirtualNestedList({
    items: props.items,
    getChildren: () => undefined,
    elementRef: props.elementRef,
    estimateOwnHeight: (item) => {
      const configured = props.estimateHeight ?? 120;
      if (typeof configured === 'number') return configured;
      return configured(item, access(props.items).indexOf(item));
    },
    ...(props.overscan === undefined ? {} : { overscan: props.overscan }),
    ...(props.gap === undefined ? {} : { gap: props.gap })
  });
}

/** Props accepted by {@link createVirtualDynamicList}. */
export type VirtualDynamicListProps<T> = Parameters<typeof createVirtualDynamicList<T>>[0];
