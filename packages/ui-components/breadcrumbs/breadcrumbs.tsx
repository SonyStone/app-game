import { computePosition, offset } from '@floating-ui/dom';
import { createResizeObserver } from '@solid-primitives/resize-observer';
import type { ComponentProps } from '@solidjs/web';
import { Portal } from '@solidjs/web';
import { toObservable } from '@utils/toObservable';
import { toSignal } from '@utils/toSignal';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { For, Show, createEffect, createMemo, createSignal, merge, onCleanup, untrack } from 'solid-js';
import { Ripple } from '../ripple/Ripple';

declare module '@solidjs/web' {
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
  const merged = merge({ items: [], collapseFrom: Boundary.START }, props);

  const defaultChopSize = createMemo(() => halve(merged.items.length));
  const initialItems = untrack(() => merged.items);

  const [state, setState] = createSignal<OverflowListState<any>>({
    chopSize: untrack(defaultChopSize),
    lastChopSize: undefined,
    overflow: [],
    visible: initialItems,
    repartitioning: false
  });

  const overflowLength = toSignal(
    toObservable(createMemo(() => state().overflow.length)).pipe(debounceTime(1), distinctUntilChanged()),
    untrack(() => state().overflow.length)
  );

  createEffect(
    () => [defaultChopSize(), merged.items] as const,
    ([chopSize, items]) => {
      setState((prev) => ({
        ...prev,
        chopSize,
        visible: items
      }));
    }
  );

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
      requestAnimationFrame(repartition);
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
      if (untrack(() => merged.collapseFrom) === Boundary.END) {
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

      // Continue after Solid has committed the state update used by the next partition step.
      requestAnimationFrame(repartition);
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

  const [showOverflow, setShowOverflow] = createSignal(false);
  const [listElement, setListElement] = createSignal<HTMLUListElement>();
  let overflowButtonRef: HTMLButtonElement;
  let initialRepartitionTimer: ReturnType<typeof setTimeout> | undefined;

  createResizeObserver(listElement, repartition);
  onCleanup(() => clearTimeout(initialRepartitionTimer));

  return (
    <ul
      class="m-0 flex min-w-0 flex-nowrap place-content-start p-0"
      ref={(element) => {
        setListElement(element);
        initialRepartitionTimer = setTimeout(repartition, 0);
      }}
    >
      <Show when={merged.collapseFrom === Boundary.START && overflowLength() > 0}>
        <button
          ref={(ref) => {
            overflowButtonRef = ref;
          }}
          onClick={(e) => {
            setShowOverflow(true);
          }}
          class="relative flex-shrink-0 overflow-hidden border px-2"
        >
          ...
          <Ripple />
        </button>
        <Portal>
          <Show when={showOverflow()}>
            <div onClick={(e) => setShowOverflow(false)} class="fixed start-0 end-0 top-0 bottom-0 z-1000"></div>
          </Show>
          <Show when={showOverflow()}>
            <div
              ref={(ref) => {
                void ref.animate([{ opacity: 0, transform: 'translateY(-10%)' }, { opacity: 1 }], {
                  duration: 150
                }).finished;
                void computePosition(overflowButtonRef, ref, {
                  placement: 'bottom-start',
                  middleware: [offset()]
                }).then((pos) => {
                  ref.style.left = `${pos.x}px`;
                  ref.style.top = `${pos.y}px`;
                });
              }}
              class="absolute top-0 left-0 z-1001 flex flex-col rounded border bg-white shadow"
            >
              <For each={state().overflow}>
                {(item) => (
                  <a class="hover:bg-light relative truncate rounded px-1" href={item.href}>
                    {item.text}
                    <Ripple />
                  </a>
                )}
              </For>
            </div>
          </Show>
        </Portal>
      </Show>
      <For each={state().visible}>
        {(item, index) => (
          <li class="flex flex-shrink-0 flex-nowrap items-center truncate overflow-hidden">
            <Show when={index() !== 0 || state().overflow.length > 0}>
              <span class="px-1">&gt;</span>
            </Show>
            {item.icon && <i class={`fas fa-${item.icon}`}></i>}
            {item.href ? (
              <a class="hover:bg-light relative truncate rounded px-1" href={item.href}>
                {item.text}
                <Ripple />
              </a>
            ) : (
              <span class="hover:bg-light relative truncate px-1">
                {item.text}
                <Ripple />
              </span>
            )}
          </li>
        )}
      </For>
      <Show when={merged.collapseFrom === Boundary.END && overflowLength() > 0}>
        <span class="flex-shrink-0 border px-2">...{overflowLength()}</span>
      </Show>
      <overflow-list-spacer class="w-1px flex-shrink" ref={(ref) => (spacer = ref)} />
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
