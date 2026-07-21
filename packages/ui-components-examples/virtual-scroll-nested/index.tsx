import { ReactiveSet } from '@solid-primitives/set';
import { createEffect, createMemo, createSignal, For, Show, type ComponentProps, type JSX } from 'solid-js';
import { createMutable } from 'solid-js/store';
import { Dynamic, SVGElements } from 'solid-js/web';
import tigerSvg from '../../three-examples/svg/tiger.svg?raw';
import { createVirtualNestedList } from './createVirtualNestedList';
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

/** Serializable display record for one parsed SVG element. */
export type NestedItem = {
  /** Document-order position used only for color and debug labels. */
  index: number;
  /** Original SVG element name. */
  component: string;
  /** Parsed direct child elements. */
  children: NestedItem[];
} &
  /** SVG attributes and direct text, ready to spread into Solid's `Dynamic`. */
  Record<string, string | number | NestedItem[]>;

/** Shows the same parsed SVG tree with virtualized and regular recursive rendering. */
export default function VirtualScrollNestedExample() {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();
  const collapsedIndexes = new ReactiveSet<number>();
  const nestedItems = createMutable(parseSvgTree(tigerSvg));
  const elementCount = countTreeItems(nestedItems);

  createEffect(() => {
    console.log('VirtualScrollNestedExample: elementCount', nestedItems);
  });

  const virtual = createVirtualNestedList({
    items: nestedItems,
    getChildren: (item) => item.children,
    isExpanded,
    elementRef: scroller,
    estimateOwnHeight: (item) => (Object.keys(readStringProperties(item)).length + 3) * 20 + 125,
    overscan: 800
  });
  const previewItems = createMemo(() => collectPreviewItems(virtual.children()));

  return (
    <virtual-scroll-nested-example class="flex h-full max-h-screen gap-4 overflow-hidden">
      <div class="flex min-w-0 flex-1 flex-col">
        <div class="flex items-center gap-2 border-b border-slate-300 bg-slate-100 px-3 py-2 text-xs">
          <span class="font-semibold text-slate-900">Virtualized SVG document</span>
          <span class="text-slate-500">tiger.svg · {elementCount} elements</span>
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

      <OriginalList
        items={nestedItems}
        isExpanded={isExpanded}
        onExpandedChange={setItemExpanded}
        onAttributeChange={setItemAttribute}
      />

      <div class="h-600px w-600px inset-e-0 absolute bottom-0 bg-white">
        <For each={nestedItems}>{(item) => <SvgElement item={item} />}</For>
      </div>
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
          {(node) => {
            const hasChildren = node.item.children.length > 0;

            return (
              <Item
                ref={node.setElementRef}
                data-virtual-depth={node.depth}
                title={`<${node.item.component}> · node ${node.item.index}`}
                index={node.item.index}
                data={readStringProperties(node.item)}
                onAttributeChange={(name, value) => setItemAttribute(node.item, name, value)}
                expanded={hasChildren ? isExpanded(node.item) : undefined}
                onExpandedChange={hasChildren ? (expanded) => setItemExpanded(node.item, expanded) : undefined}
                class={
                  node.depth > 0
                    ? 'group-child relative shadow-sm ring-1 ring-slate-900/10'
                    : 'relative shadow-sm ring-1 ring-slate-900/15'
                }
                role="treeitem"
                aria-level={node.depth + 1}
                aria-expanded={hasChildren ? isExpanded(node.item) : undefined}
                data-item-index={node.item.index}
                style={{ 'margin-bottom': `${virtual.gap}px`, 'overflow-anchor': 'none' }}
              >
                <Show when={node.childCount > 0}>{renderLevel(node, node.setChildrenRef)}</Show>
              </Item>
            );
          }}
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

  function isExpanded(item: NestedItem): boolean {
    return !collapsedIndexes.has(item.index);
  }

  function setItemExpanded(item: NestedItem, expanded: boolean): void {
    if (expanded) collapsedIndexes.delete(item.index);
    else collapsedIndexes.add(item.index);
  }

  function setItemAttribute(item: NestedItem, name: string, value: string): void {
    item[name] = value;
  }
}

/** Renders one parsed record and its descendants as native SVG elements. */
function SvgElement(props: { item: NestedItem }): JSX.Element {
  const component = props.item.component;
  if (!isSvgComponent(component)) return null;

  const properties = createMemo(() => readStringProperties(props.item));
  const attributes = createMemo(() =>
    Object.fromEntries(Object.entries(properties()).filter(([name]) => name !== 'textContent'))
  );

  return (
    <Dynamic component={component} {...attributes()}>
      {properties().textContent}
      <For each={props.item.children}>{(item) => <SvgElement item={item} />}</For>
    </Dynamic>
  );
}

function parseSvgTree(source: string): NestedItem[] {
  const svgDocument = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (svgDocument.documentElement.localName === 'parsererror') {
    throw new Error('Could not parse tiger.svg');
  }

  let nextIndex = 0;
  return [convertElement(svgDocument.documentElement)];

  function convertElement(element: Element): NestedItem {
    const index = nextIndex;
    nextIndex += 1;

    const item = {
      ...readElementProperties(element),
      index,
      component: element.tagName,
      children: Array.from(element.children, convertElement)
    } satisfies NestedItem;

    return item;
  }
}

function readElementProperties(element: Element): Record<string, string> {
  const properties: Record<string, string> = {};

  for (const attribute of element.attributes) {
    properties[attribute.name] = attribute.value;
  }

  const text = Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
  if (text) properties.textContent = text;

  return properties;
}

function readStringProperties(item: NestedItem): Record<string, string> {
  return Object.fromEntries(
    Object.entries(item).filter(
      (entry): entry is [string, string] => entry[0] !== 'component' && typeof entry[1] === 'string'
    )
  );
}

function countTreeItems(items: readonly NestedItem[]): number {
  return items.reduce((count, item) => count + 1 + countTreeItems(item.children), 0);
}

function isSvgComponent(component: string): component is keyof SVGElementTagNameMap {
  return SVGElements.has(component);
}
