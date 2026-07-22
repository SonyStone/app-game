import { createElementSize } from '@solid-primitives/resize-observer';
import { createScrollPosition } from '@solid-primitives/scroll';
import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import type { NestedItem } from '.';
import { Item } from '../shared/Item';
import { VirtualScrollPreview } from '../shared/VirtualPreview';

/** Renders the complete parsed tree as a non-virtualized comparison. */
export function OriginalList(props: {
  /** Removes the comparison panel chrome when rendered inside another panel. */
  bare?: boolean;
  /** Additional classes for the comparison panel. */
  class?: string;
  /** Root SVG element records. */
  items: readonly NestedItem[];
  /** Whether the scroll map is visible beside the regular tree. */
  mapVisible: boolean;
  /** Reports whether an element's descendants are visible. */
  isExpanded: (item: NestedItem) => boolean;
  /** Changes an element's expanded state. */
  onExpandedChange: (item: NestedItem, expanded: boolean) => void;
  /** Changes one flattened SVG attribute. */
  onAttributeChange: (item: NestedItem, name: string, value: string) => void;
}) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();
  const [content, setContent] = createSignal<HTMLDivElement | undefined>();
  const scrollerSize = createElementSize(scroller);
  const contentSize = createElementSize(content);
  const scroll = createScrollPosition(scroller);
  const itemElements = new Map<NestedItem, { element: HTMLElement; depth: number }>();
  const previewItems = createMemo(() => {
    void contentSize.height;
    return collectPreviewItems(props.items, props.isExpanded, itemElements, scroller(), scroll.y);
  });
  const totalHeight = () => Math.max(1, contentSize.height ?? 0, scroller()?.scrollHeight ?? 0);

  return (
    <section
      class={[
        'flex min-h-0 flex-col overflow-hidden',
        props.bare ? '' : 'rounded-xl border border-zinc-200 bg-white shadow-sm',
        props.class
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Show when={!props.bare}>
        <header class="flex h-12 shrink-0 items-center border-b border-zinc-200 px-4">
          <span class="text-sm font-semibold">Regular tree</span>
          <span class="ms-auto font-mono text-[10px] text-zinc-400">comparison</span>
        </header>
      </Show>
      <div class="flex min-h-0 flex-1">
        <div ref={setScroller} class="min-w-0 flex-1 overflow-auto bg-zinc-50/50">
          <div ref={setContent} class="flex flex-col gap-2 p-2">
            {renderItems(props.items, props, registerItem)}
          </div>
        </div>
        <Show when={props.mapVisible}>
          <VirtualScrollPreview
            totalHeight={totalHeight()}
            scrollPosition={scroll.y}
            viewportHeight={scrollerSize.height ?? 0}
            children={previewItems()}
            scrollTo={(position) => scroller()?.scrollTo({ top: position })}
          />
        </Show>
      </div>
    </section>
  );

  function registerItem(item: NestedItem, depth: number, element: HTMLElement): void {
    itemElements.set(item, { element, depth });
  }
}

function renderItems(
  items: readonly NestedItem[],
  props: Parameters<typeof OriginalList>[0],
  registerItem: (item: NestedItem, depth: number, element: HTMLElement) => void,
  depth = 0
): JSX.Element {
  return (
    <For each={items}>
      {(item) => (
        <Item
          ref={(element) => registerItem(item, depth, element)}
          index={item.index}
          title={`<${item.component}> · node ${item.index}`}
          data={readStringProperties(item)}
          onAttributeChange={(name, value) => props.onAttributeChange(item, name, value)}
          {...(item.children.length > 0
            ? {
                expanded: props.isExpanded(item),
                onExpandedChange: (expanded: boolean) => props.onExpandedChange(item, expanded)
              }
            : {})}
        >
          <Show when={item.children.length > 0 && props.isExpanded(item)}>
            {renderItems(item.children, props, registerItem, depth + 1)}
          </Show>
        </Item>
      )}
    </For>
  );
}

function collectPreviewItems(
  items: readonly NestedItem[],
  isExpanded: (item: NestedItem) => boolean,
  elements: ReadonlyMap<NestedItem, { element: HTMLElement; depth: number }>,
  scroller: HTMLElement | undefined,
  scrollPosition: number,
  result: { top: number; height: number; depth: number; colorIndex: number }[] = []
): { top: number; height: number; depth: number; colorIndex: number }[] {
  if (!scroller) return result;
  const scrollerTop = scroller.getBoundingClientRect().top;

  for (const item of items) {
    const registered = elements.get(item);
    if (registered?.element.isConnected) {
      const itemRect = registered.element.getBoundingClientRect();

      result.push({
        top: itemRect.top - scrollerTop + scrollPosition,
        height: Math.max(1, itemRect.height),
        depth: registered.depth,
        colorIndex: item.index
      });
    }

    if (isExpanded(item)) {
      collectPreviewItems(item.children, isExpanded, elements, scroller, scrollPosition, result);
    }
  }

  return result;
}

function readStringProperties(item: NestedItem): Record<string, string> {
  return Object.fromEntries(
    Object.entries(item).filter(
      (entry): entry is [string, string] => entry[0] !== 'component' && typeof entry[1] === 'string'
    )
  );
}
