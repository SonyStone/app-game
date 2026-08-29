import { createDynamicGap, createDynamicHeight, createVirtualNestedList } from '@app-game/solid-virtual';
import { ReactiveSet } from '@solid-primitives/set';
import type { JSX } from '@solidjs/web';
import { Dynamic, SVGElements } from '@solidjs/web';
import { createMemo, createSignal, For, Show } from 'solid-js';
import tigerSvg from '../../../three-examples/svg/tiger.svg?raw';
import { Item } from '../shared/Item';
import { makeUrlSearchParams } from '../shared/makeUrlSearchParams';
import { MapToggle } from '../shared/MapToggle';
import { ScrollModeToggle, type ScrollMode } from '../shared/ScrollModeToggle';
import { VirtualScrollPreview } from '../shared/VirtualPreview';
import { OriginalList } from './OriginalList';

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

/** Shows virtualized and regular renderers for one editable SVG tree. */
export default function NestedTreeExample() {
  const [mode, setMode] = createSignal<ScrollMode>('virtual');
  const [mapVisible, setMapVisible] = makeUrlSearchParams(createSignal(false), { key: 'map' });
  const collapsedIndexes = new ReactiveSet<number>();
  const nestedItems = parseSvgTree(tigerSvg);
  const elementCount = countTreeItems(nestedItems);

  return (
    <div class="flex h-0 min-w-0 grow gap-4 max-lg:flex-col">
      <section class="flex min-w-0 grow flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white max-lg:min-h-screen">
        <header class="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 px-4">
          <span class="text-sm font-semibold">Tree</span>
          <span class="rounded bg-zinc-100 px-2 py-1 font-mono text-[10px] text-zinc-500">tiger.svg</span>
          <span class="font-mono text-[10px] text-zinc-400">{elementCount}</span>
          <div class="ms-auto flex items-center gap-2">
            <MapToggle visible={mapVisible()} onChange={setMapVisible} />
            <ScrollModeToggle mode={mode()} onChange={setMode} />
          </div>
        </header>

        <Show
          when={mode() === 'virtual'}
          fallback={
            <OriginalList
              bare
              class="min-h-0 flex-1"
              items={nestedItems}
              mapVisible={mapVisible()}
              isExpanded={isExpanded}
              onExpandedChange={setItemExpanded}
              onAttributeChange={setItemAttribute}
            />
          }
        >
          <VirtualTree
            items={nestedItems}
            mapVisible={mapVisible()}
            isExpanded={isExpanded}
            onExpandedChange={setItemExpanded}
            onAttributeChange={setItemAttribute}
          />
        </Show>
      </section>

      <RenderedSvg items={nestedItems} />
    </div>
  );

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

function VirtualTree(props: {
  items: readonly NestedItem[];
  mapVisible: boolean;
  isExpanded: (item: NestedItem) => boolean;
  onExpandedChange: (item: NestedItem, expanded: boolean) => void;
  onAttributeChange: (item: NestedItem, name: string, value: string) => void;
}) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();
  const gap = createDynamicGap();
  const virtual = createVirtualNestedList({
    items: props.items,
    elementRef: scroller,
    itemHeight: createDynamicHeight<NestedItem>({
      estimate: (item) => Object.keys(readStringProperties(item)).length * 54 + 48
    }),
    getChildren: (item) => item.children,
    isExpanded: props.isExpanded,
    overscan: 800,
    gap
  });
  const previewItems = createMemo(() => collectPreviewItems(virtual.children()));

  return (
    <div class="flex min-h-0 flex-1">
      <div
        ref={setScroller}
        class="min-w-0 flex-1 overflow-auto bg-zinc-50/50 p-2 outline-none"
        role="tree"
        aria-label="Nested virtual list"
        tabindex="0"
        style={{ 'overflow-anchor': 'none' }}
      >
        {renderLevel(virtual)}
      </div>
      <Show when={props.mapVisible}>
        <VirtualScrollPreview
          totalHeight={virtual.totalHeight}
          scrollPosition={virtual.scrollPosition}
          viewportHeight={virtual.viewportHeight}
          children={previewItems()}
          scrollTo={virtual.scrollToOffset}
        />
      </Show>
    </div>
  );

  function renderLevel(
    level: Pick<typeof virtual, 'children' | 'paddingTop' | 'paddingBottom'>,
    setChildrenRef?: (element: HTMLElement) => void
  ): JSX.Element {
    return (
      <div
        ref={(element) => {
          setChildrenRef?.(element);
          if (level === virtual) gap.setElementRef(element);
        }}
        data-virtual-level
        class="flex flex-col gap-2"
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
                title={`<${node.item.component}>`}
                index={node.item.index}
                data={readStringProperties(node.item)}
                onAttributeChange={(name, value) => props.onAttributeChange(node.item, name, value)}
                {...(hasChildren
                  ? {
                      expanded: props.isExpanded(node.item),
                      onExpandedChange: (expanded: boolean) => props.onExpandedChange(node.item, expanded)
                    }
                  : {})}
                class={node.depth > 0 ? 'group-child' : ''}
                role="treeitem"
                aria-level={node.depth + 1}
                aria-expanded={hasChildren ? (props.isExpanded(node.item) ? 'true' : 'false') : undefined}
                data-item-index={node.item.index}
                style={{ 'overflow-anchor': 'none' }}
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
    result: { top: number; height: number; depth: number; colorIndex: number }[] = []
  ): { top: number; height: number; depth: number; colorIndex: number }[] {
    for (const node of nodes) {
      result.push({ top: node.top, height: node.height, depth: node.depth, colorIndex: node.item.index });
      collectPreviewItems(node.children(), result);
    }
    return result;
  }
}

function RenderedSvg(props: { items: readonly NestedItem[] }) {
  return (
    <section class="flex min-h-150 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <header class="flex h-12 shrink-0 items-center border-b border-zinc-200 px-4">
        <span class="text-sm font-semibold">Rendered SVG</span>
        <span class="ms-auto font-mono text-[10px] text-zinc-400">600 × 600</span>
      </header>
      <div class="grid min-h-0 flex-1 place-items-center overflow-hidden bg-zinc-50 p-4">
        <div class="h-full max-h-full max-w-full border border-zinc-200 bg-white [&>svg]:h-full [&>svg]:w-full">
          <For each={props.items}>{(item) => <SvgElement item={item} />}</For>
        </div>
      </div>
    </section>
  );
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
  if (svgDocument.documentElement.localName === 'parsererror') throw new Error('Could not parse tiger.svg');

  let nextIndex = 0;
  return [convertElement(svgDocument.documentElement)];

  function convertElement(element: Element): NestedItem {
    const index = nextIndex++;
    return {
      ...readElementProperties(element),
      index,
      component: element.tagName,
      children: Array.from(element.children, convertElement)
    } satisfies NestedItem;
  }
}

function readElementProperties(element: Element): Record<string, string> {
  const properties: Record<string, string> = {};
  for (const attribute of element.attributes) properties[attribute.name] = attribute.value;

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
