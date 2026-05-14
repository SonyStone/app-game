import { For, Setter, Show } from 'solid-js';

export function VirtualScrollPreview<T>(props: {
  totalHeight: number;
  paddingTop: number;
  paddingBottom: number;
  visibleHeight: number;
  scrollPosition: number;
  viewportHeight: number;
  visibleItems: T[] | (T & { children: T[] })[];
  children?: Readonly<
    {
      height: number;
      top: number;
      item: unknown;
      setElementRef: Setter<HTMLElement | undefined>;
    }[]
  >;
  scrollTo: (position: number) => void;
}) {
  const scrollHandler = (() => {
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startScroll = props.scrollPosition;
      const onPointerMove = (e: PointerEvent) => {
        const deltaY = e.clientY - startY;
        const newScroll = Math.min(
          Math.max(0, startScroll + (deltaY * props.totalHeight) / props.viewportHeight),
          props.totalHeight - props.viewportHeight
        );

        props.scrollTo(newScroll);
      };

      const onPointerUp = () => {
        removeEventListener('pointermove', onPointerMove);
        removeEventListener('pointerup', onPointerUp);
      };
      addEventListener('pointermove', onPointerMove);
      addEventListener('pointerup', onPointerUp);
    };

    return { onPointerDown };
  })();

  return (
    <svg {...scrollHandler} class="w-100px h-full" viewBox={`0 0 100 ${props.totalHeight}`} preserveAspectRatio="none">
      <g>
        <Show when={!props.children}>
          <For each={props.visibleItems}>
            {(item, index) => (
              <g
                transform={`translate(0, ${props.paddingTop + (index() * props.visibleHeight) / props.visibleItems.length + 10})`}
              >
                <rect
                  x="4"
                  vector-effect="non-scaling-stroke"
                  y="0"
                  width="92"
                  height={props.visibleHeight / props.visibleItems.length}
                  stroke="black"
                  stroke-width="0.5"
                  fill="gray"
                  opacity="0.5"
                />
                <g>
                  <For each={(item as { children: T[] }).children}>
                    {(child, childIndex) => (
                      <rect
                        x="4"
                        vector-effect="non-scaling-stroke"
                        y={childIndex() * 80}
                        width="92"
                        height="60"
                        fill="gray"
                        opacity="0.5"
                      />
                    )}
                  </For>
                </g>
              </g>
            )}
          </For>
        </Show>
      </g>
      <g>
        <Show when={props.children}>
          <For each={props.children}>
            {(child) => (
              <g transform={`translate(0, ${child.top})`}>
                <rect
                  x="4"
                  vector-effect="non-scaling-stroke"
                  y="0"
                  width="92"
                  height={child.height}
                  data-height={child.height ?? 'n/a'}
                  data-top={child.top ?? 'n/a'}
                  stroke="black"
                  stroke-width="0.5"
                  fill="gray"
                  opacity="0.5"
                />
              </g>
            )}
          </For>
        </Show>
      </g>
      {/* Viewport */}
      <rect
        class="active:(stroke-red-700) hover:(stroke-red-700) fill-red-300/20 stroke-red-500"
        x="0"
        y={props.scrollPosition}
        width="100"
        height={props.viewportHeight}
        stroke="black"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
      {/* <rect
        x="2"
        y={props.paddingTop}
        width="96"
        height={props.visibleHeight}
        stroke="black"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
        fill="none"
      /> */}
    </svg>
  );
}
