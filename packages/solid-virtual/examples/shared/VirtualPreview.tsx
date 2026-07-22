import { For } from 'solid-js';

const MAP_HEIGHT = 1000;

/** Visualizes rendered rows and provides a draggable viewport. */
export function VirtualScrollPreview(props: {
  /** Estimated or measured height of the complete scrollable document. */
  totalHeight: number;
  /** Current scroll offset in document pixels. */
  scrollPosition: number;
  /** Visible scroller height in document pixels. */
  viewportHeight: number;
  /** Rows currently rendered in the DOM. */
  children?: readonly {
    height: number;
    top: number;
    depth?: number;
    colorIndex?: number;
    index?: number;
    item?: unknown;
  }[];
  /** Scrolls the example to an absolute document offset. */
  scrollTo: (position: number) => void;
}) {
  const scrollHandler = createScrollHandler(props);

  return (
    <aside class="flex w-16 shrink-0 flex-col border-s border-zinc-200 bg-white" aria-label="Scroll map">
      <svg
        {...scrollHandler}
        class="min-h-0 flex-1 cursor-ns-resize touch-none select-none"
        viewBox={`0 0 64 ${MAP_HEIGHT}`}
        preserveAspectRatio="none"
      >
        <For each={props.children}>
          {(child, index) => {
            const depth = () => Math.min(8, child.depth ?? 0);
            const x = () => 14 + depth() * 2;
            const top = () => scaleToMap(child.top, props.totalHeight);
            const height = () => scaleToMap(child.height, props.totalHeight);

            return (
              <rect
                x={x()}
                y={top() + 1}
                width={Math.max(8, 36 - depth() * 2)}
                height={Math.max(1.5, height() - 2)}
                fill={itemColor(readColorIndex(child, index()))}
                opacity="0.82"
                rx="0.75"
              />
            );
          }}
        </For>

        <ViewportFrame
          scrollPosition={props.scrollPosition}
          totalHeight={props.totalHeight}
          viewportHeight={props.viewportHeight}
        />
      </svg>
    </aside>
  );
}

function ViewportFrame(props: { scrollPosition: number; totalHeight: number; viewportHeight: number }) {
  const height = () => Math.max(10, scaleToMap(props.viewportHeight, props.totalHeight));
  const top = () => Math.min(MAP_HEIGHT - height(), scaleToMap(props.scrollPosition, props.totalHeight));

  return (
    <rect
      x="5"
      y={top()}
      width="54"
      height={height()}
      fill="rgba(255, 255, 255, 0.12)"
      stroke="#18181b"
      stroke-width="1.5"
      vector-effect="non-scaling-stroke"
      rx="2"
    />
  );
}

function createScrollHandler(
  props: Pick<Parameters<typeof VirtualScrollPreview>[0], 'scrollPosition' | 'scrollTo' | 'totalHeight'>
) {
  const onPointerDown = (event: PointerEvent & { currentTarget: SVGSVGElement }) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const mapHeight = Math.max(1, event.currentTarget.getBoundingClientRect().height);
    const startY = event.clientY;
    const startScroll = props.scrollPosition;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      props.scrollTo(startScroll + (deltaY / mapHeight) * props.totalHeight);
    };

    const onPointerUp = () => {
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('pointerup', onPointerUp);
    };

    addEventListener('pointermove', onPointerMove);
    addEventListener('pointerup', onPointerUp);
  };

  return { onPointerDown };
}

function scaleToMap(value: number, totalHeight: number): number {
  if (!Number.isFinite(value) || totalHeight <= 0) return 0;
  return Math.min(MAP_HEIGHT, Math.max(0, (value / totalHeight) * MAP_HEIGHT));
}

function itemColor(index: number): string {
  return `hsl(${(index * 137.50776405003785) % 360} 64% 52%)`;
}

function readColorIndex(
  child: NonNullable<Parameters<typeof VirtualScrollPreview>[0]['children']>[number],
  fallback: number
): number {
  if (child.colorIndex !== undefined) return child.colorIndex;
  if (child.index !== undefined) return child.index;
  if (typeof child.item === 'object' && child.item && 'index' in child.item && typeof child.item.index === 'number') {
    return child.item.index;
  }
  return fallback;
}
