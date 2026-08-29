import { createElementSize } from '@solid-primitives/resize-observer';
import { createScrollPosition } from '@solid-primitives/scroll';
import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { merge } from 'solid-js';

/** Options shared by flat and nested virtual lists. */
export type BaseVirtualListProps<T> = Readonly<{
  /** Root or flat items in display order. May be a reactive accessor. */
  items: MaybeAccessor<readonly T[]>;
  /** Scrollable element containing the rendered virtual levels. */
  elementRef: MaybeAccessor<HTMLElement | undefined>;
  /** Extra pixels rendered before and after the viewport. Defaults to `600`. */
  overscan?: MaybeAccessor<number>;
  /** Vertical space between sibling items or complete item branches. Defaults to `0`. */
  gap?: MaybeAccessor<number>;
}>;

/** Shared reactive state consumed by flat and nested layouts. */
export type VirtualListCore<T> = Readonly<{
  items: MaybeAccessor<readonly T[]>;
  elementRef: MaybeAccessor<HTMLElement | undefined>;
  viewportHeight: MaybeAccessor<number>;
  scrollPosition: MaybeAccessor<number>;
  gap: MaybeAccessor<number>;
  overscan: MaybeAccessor<number>;
}>;

/** Adds defaults and derived viewport state while preserving mode-specific props. */
export function createVirtualListCore<T, Props extends BaseVirtualListProps<T>>(inputProps: Props) {
  const viewportSize = createElementSize(() => access(inputProps.elementRef));
  const scroll = createScrollPosition(() => access(inputProps.elementRef));

  return merge({ gap: DEFAULT_GAP, overscan: DEFAULT_OVERSCAN }, inputProps, {
    get viewportHeight(): number {
      return viewportSize.height ?? 0;
    },
    get scrollPosition(): number {
      return scroll.y;
    }
  });
}

const DEFAULT_OVERSCAN = 600;
const DEFAULT_GAP = 0;
