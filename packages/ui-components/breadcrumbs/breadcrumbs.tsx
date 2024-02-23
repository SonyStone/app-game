import { createResizeObserver } from '@solid-primitives/resize-observer';
import { toObservable } from '@utils/to-observable';
import { toSignal } from '@utils/to-signal';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ComponentProps, For, Show, createEffect, createMemo, createSignal, mergeProps, untrack } from 'solid-js';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'overflow-list-spacer': ComponentProps<'div'>;
    }
  }
}

export const Boundary = {
  START: 'start' as const,
  END: 'end' as const
};
export type Boundary = (typeof Boundary)[keyof typeof Boundary];

export interface BreadcrumbProps {
  href?: string;
  icon?: string;
  text: string;
}

interface OverflowListState<T> {
  overflow: T[];
  visible: T[];
  chopSize: number;
  lastChopSize: number | undefined;
  repartitioning: boolean;
}

export const Breadcrumbs = (props: {
  items: BreadcrumbProps[];

  /**
   * Which direction the items should collapse from: start or end of the
   * children. This also determines whether `overflowRenderer` appears before
   * (`START`) or after (`END`) the visible items.
   *
   * @default Boundary.START
   */
  collapseFrom?: Boundary;
}) => {
  const merged = mergeProps({ items: [], collapseFrom: Boundary.START }, props);

  createResizeObserver;

  const defaultChopSize = createMemo(() => halve(merged.items.length));

  const [state, setState] = createSignal<OverflowListState<any>>({
    chopSize: defaultChopSize(),
    lastChopSize: undefined,
    overflow: [],
    visible: merged.items,
    repartitioning: false
  });

  const overflowLength = toSignal(
    toObservable(createMemo(() => state().overflow.length)).pipe(debounceTime(1), distinctUntilChanged()),
    state().overflow.length
  );

  createEffect(() => {
    setState((prev) => ({
      ...prev,
      chopSize: defaultChopSize(),
      visible: merged.items
    }));
  });

  const minVisible = 0;

  let spacer: HTMLDivElement;

  const repartition = () => {
    if (!spacer) {
      return;
    }

    const prev = untrack(state);

    if (prev.repartitioning === false) {
      setState({
        ...prev,
        repartitioning: true
      });
      return;
    }

    // if lastChopSize was 1, then our binary search has exhausted.
    const partitionExhausted = prev.lastChopSize === 1;

    // spacer has flex-shrink and width 1px so if it's much smaller then we know to shrink
    const shouldShrink = spacer.offsetWidth < 0.9 && prev.visible.length > minVisible;

    // we only check partitionExhausted for shouldGrow to ensure shrinking is the final operation.
    const shouldGrow =
      (spacer.offsetWidth >= 1 || prev.visible.length < minVisible) && prev.overflow.length > 0 && !partitionExhausted;

    if (shouldShrink || shouldGrow) {
      let visible;
      let overflow;
      if (merged.collapseFrom === Boundary.END) {
        const result = shiftElements(prev.visible, prev.overflow, prev.chopSize * (shouldShrink ? 1 : -1));
        visible = result[0];
        overflow = result[1];
      } else {
        const result = shiftElements(prev.overflow, prev.visible, prev.chopSize * (shouldShrink ? -1 : 1));
        overflow = result[0];
        visible = result[1];
      }

      setState({
        chopSize: halve(prev.chopSize),
        lastChopSize: prev.chopSize,
        // if we're starting a new partition cycle, record the last overflow count so we can track whether the UI changes after the new overflow is calculated
        // state.lastOverflowCount = this.isFirstPartitionCycle(state.chopSize)
        // ? state.overflow.length
        // : state.lastOverflowCount,
        overflow,
        repartitioning: true,
        visible
      });

      // repition until no more repartition are needed
      repartition();
    } else {
      // repartition complete!
      setState({
        ...prev,
        chopSize: defaultChopSize(),
        lastChopSize: undefined,
        repartitioning: false
      });
    }
  };

  return (
    <ul class="flex flex-nowrap min-w-0 p-0 m-0 gap-1" ref={(element) => createResizeObserver(element, repartition)}>
      <Show when={merged.collapseFrom === Boundary.START && overflowLength() > 0}>
        <span class="border flex-shrink-0 px-2">...{overflowLength()}</span>
      </Show>
      <For each={state().visible}>
        {(item) => (
          <li class="truncate flex flex-shrink-0 items-center gap-2 flex-nowrap overflow-hidden">
            {item.icon && <i class={`fas fa-${item.icon}`}></i>}
            {item.href ? (
              <a class="truncate" href={item.href}>
                {item.text}
              </a>
            ) : (
              <span>{item.text}</span>
            )}
          </li>
        )}
      </For>
      <Show when={merged.collapseFrom === Boundary.END && overflowLength() > 0}>
        <span class="border flex-shrink-0 px-2">...{overflowLength()}</span>
      </Show>
      <overflow-list-spacer class="flex-shrink w-1px" ref={(ref) => (spacer = ref)} />
    </ul>
  );
};

function halve(num: number): number {
  return Math.ceil(num / 2);
}

function shiftElements<T>(leftArray: readonly T[], rightArray: readonly T[], num: number): [newFrom: T[], newTo: T[]] {
  // if num is positive then elements are shifted from left-to-right, if negative then right-to-left
  const allElements = leftArray.concat(rightArray);
  const newLeftLength = leftArray.length - num;

  if (newLeftLength <= 0) {
    return [[], allElements];
  } else if (newLeftLength >= allElements.length) {
    return [allElements, []];
  }

  const sliceIndex = allElements.length - newLeftLength;

  return [allElements.slice(0, -sliceIndex), allElements.slice(-sliceIndex)];
}
