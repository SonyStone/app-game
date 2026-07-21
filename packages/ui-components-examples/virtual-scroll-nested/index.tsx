import { createMemo, createSignal, For, Show, type ComponentProps, type JSX } from 'solid-js';
import { createVirtualNestedList } from './createVirtualNestedList';
import { getRandomObject } from './getRandomObject';
import { Item } from './Item';
import { OriginalList } from './OriginalList';
import { VirtualScrollPreview } from './VirtualPreview';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'test-item': ComponentProps<'div'>;
      'virtual-scroll-nested-example': ComponentProps<'div'>;
    }
  }
}

export type NestedItem = {
  id: number;
  data: Record<string, string>;
  children: NestedItem[];
};

export default function VirtualScrollNestedExample() {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();
  const nestedItems: NestedItem[] = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    data: getRandomObject(),
    children: Array.from({ length: 20 }, (_, j) => ({
      id: 30 + i * 20 + j,
      data: getRandomObject(),
      children: []
    }))
  }));

  const virtual = createVirtualNestedList({
    items: nestedItems,
    getChildren: (item) => item.children,
    elementRef: scroller,
    estimateOwnHeight: (item) => (Object.keys(item.data).length + 3) * 20 + 125,
    overscan: 800
  });
  const previewItems = createMemo(() => collectPreviewItems(virtual.children()));

  return (
    <virtual-scroll-nested-example class="flex h-full max-h-screen gap-4 overflow-hidden">
      <div class="flex min-w-0 flex-1 flex-col">
        <div class="flex items-center gap-2 border-b border-slate-300 bg-slate-100 px-3 py-2 text-xs">
          <span class="font-semibold text-slate-900">Nested virtual tree</span>
          <span class="text-slate-500">Each child level lives inside its parent card</span>
        </div>
        <div class="flex min-h-0 flex-1 overflow-hidden bg-gray-50">
          <div
            ref={setScroller}
            class="min-w-0 flex-1 overflow-auto bg-slate-50 px-2 outline-none"
            role="tree"
            aria-label="Nested virtual list"
            tabindex="0"
            style={{ 'overflow-anchor': 'none' }}
          >
            {renderLevel(virtual)}
          </div>
          <VirtualScrollPreview
            totalHeight={virtual.totalHeight}
            paddingTop={virtual.paddingTop}
            paddingBottom={virtual.paddingBottom}
            visibleHeight={virtual.viewportHeight}
            scrollPosition={virtual.scrollPosition}
            viewportHeight={virtual.viewportHeight}
            visibleItems={previewItems().map(({ item }) => item)}
            children={previewItems()}
            scrollTo={virtual.scrollTo}
          />
        </div>
      </div>

      <OriginalList items={nestedItems} rowHeight={60} />
    </virtual-scroll-nested-example>
  );

  function renderLevel(
    level: Pick<typeof virtual, 'children' | 'paddingTop' | 'paddingBottom'>,
    setChildrenRef?: (element: HTMLElement) => void
  ): JSX.Element {
    return (
      <div
        ref={(element) => setChildrenRef?.(element)}
        data-virtual-level
        class="flex flex-col"
        style={{
          'padding-top': `${level.paddingTop}px`,
          'padding-bottom': `${level.paddingBottom}px`,
          'overflow-anchor': 'none'
        }}
      >
        <For each={level.children()}>
          {(node) => (
            <Item
              ref={node.setElementRef}
              data-virtual-depth={node.depth}
              title={`${node.depth === 0 ? 'Item' : 'Child'} ${node.item.id}`}
              index={node.item.id}
              data={node.item.data}
              class={
                node.depth > 0
                  ? 'group-child relative shadow-sm ring-1 ring-slate-900/10'
                  : 'relative shadow-sm ring-1 ring-slate-900/15'
              }
              role="treeitem"
              aria-level={node.depth + 1}
              aria-expanded={node.childCount > 0 ? true : undefined}
              data-item-index={node.item.id}
              style={{ 'margin-bottom': `${virtual.gap}px`, 'overflow-anchor': 'none' }}
            >
              <Show when={node.childCount > 0}>{renderLevel(node, node.setChildrenRef)}</Show>
            </Item>
          )}
        </For>
      </div>
    );
  }

  function collectPreviewItems(
    nodes: ReturnType<typeof virtual.children>,
    result: { top: number; height: number; item: NestedItem }[] = []
  ): { top: number; height: number; item: NestedItem }[] {
    for (const node of nodes) {
      result.push({ top: node.top, height: node.height, item: node.item });
      collectPreviewItems(node.children(), result);
    }
    return result;
  }
}
