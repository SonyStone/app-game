import { createVirtualNestedList, type VirtualNestedItem } from '@app-game/solid-virtual';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createScrollPosition } from '@solid-primitives/scroll';
import { ReactiveSet } from '@solid-primitives/set';
import type { JSX } from '@solidjs/web';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { makeUrlSearchParams } from '../shared/makeUrlSearchParams';
import { MapToggle } from '../shared/MapToggle';
import { ScrollModeToggle, type ScrollMode } from '../shared/ScrollModeToggle';
import { VirtualScrollPreview } from '../shared/VirtualPreview';

/** Shows a large bookmarks-style tree whose rows have one known height. */
export default function FixedTreeExample() {
  const [mode, setMode] = createSignal<ScrollMode>('virtual');
  const [mapVisible, setMapVisible] = makeUrlSearchParams(createSignal(false), { key: 'map' });
  const [selectedId, setSelectedId] = createSignal<string | undefined>();
  const collapsedIds = new ReactiveSet<string>();
  const items = createBookmarkTree();
  const itemCount = countItems(items);

  return (
    <section class="flex h-0 min-h-120 min-w-0 grow flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <header class="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 px-4">
        <span class="text-sm font-semibold">Fixed-height tree</span>
        <span class="rounded bg-zinc-100 px-2 py-1 font-mono text-[10px] text-zinc-500">bookmarks</span>
        <span class="font-mono text-[10px] text-zinc-400">
          {itemCount.toLocaleString()} items · {ITEM_HEIGHT}px rows
        </span>
        <div class="ms-auto flex items-center gap-2">
          <button
            type="button"
            class="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
            onClick={() => collapsedIds.clear()}
          >
            Expand all
          </button>
          <button
            type="button"
            class="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
            onClick={() => {
              forEachItem(items, (item) => {
                if (item.children.length > 0) collapsedIds.add(item.id);
              });
            }}
          >
            Collapse all
          </button>
          <MapToggle visible={mapVisible()} onChange={setMapVisible} />
          <ScrollModeToggle mode={mode()} onChange={setMode} />
        </div>
      </header>

      <Show
        when={mode() === 'virtual'}
        fallback={
          <RegularBookmarkTree
            items={items}
            mapVisible={mapVisible()}
            selectedId={selectedId()}
            isExpanded={isExpanded}
            onExpandedChange={setExpanded}
            onSelectedChange={setSelectedId}
          />
        }
      >
        <VirtualBookmarkTree
          items={items}
          mapVisible={mapVisible()}
          selectedId={selectedId()}
          isExpanded={isExpanded}
          onExpandedChange={setExpanded}
          onSelectedChange={setSelectedId}
        />
      </Show>
    </section>
  );

  function isExpanded(item: BookmarkItem): boolean {
    return !collapsedIds.has(item.id);
  }

  function setExpanded(item: BookmarkItem, expanded: boolean): void {
    if (expanded) collapsedIds.delete(item.id);
    else collapsedIds.add(item.id);
  }
}

type BookmarkTreeRendererProps = {
  items: readonly BookmarkItem[];
  mapVisible: boolean;
  selectedId: string | undefined;
  isExpanded: (item: BookmarkItem) => boolean;
  onExpandedChange: (item: BookmarkItem, expanded: boolean) => void;
  onSelectedChange: (id: string) => void;
};

function VirtualBookmarkTree(props: BookmarkTreeRendererProps) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();
  const virtual = createVirtualNestedList({
    items: props.items,
    elementRef: scroller,
    itemHeight: ITEM_HEIGHT,
    getChildren: (item) => item.children,
    isExpanded: props.isExpanded,
    overscan: 240,
    gap: 0
  });
  const previewItems = createMemo(() => collectVirtualPreviewItems(virtual.children()));

  return (
    <div class="flex min-h-0 flex-1">
      <div class="flex min-w-0 flex-1 flex-col bg-white text-zinc-950">
        <div
          ref={setScroller}
          class="min-h-0 flex-1 overflow-auto bg-white px-2 outline-none"
          role="tree"
          aria-label="Fixed-height virtual bookmarks"
          tabindex="0"
          style={{ 'overflow-anchor': 'none' }}
        >
          {renderLevel(virtual)}
        </div>
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

  function renderLevel(level: Pick<typeof virtual, 'children' | 'paddingTop' | 'paddingBottom'>): JSX.Element {
    return (
      <ul
        class="m-0 min-w-max list-none p-0"
        role={level === virtual ? 'presentation' : 'group'}
        style={{
          'padding-top': `${level.paddingTop}px`,
          'padding-bottom': `${level.paddingBottom}px`
        }}
      >
        <For each={level.children()}>
          {(node) => {
            const hasChildren = node.childCount > 0;
            const expanded = () => hasChildren && props.isExpanded(node.item);

            return (
              <li class="relative m-0 min-w-max list-none p-0" role="none">
                <BookmarkRow
                  item={node.item}
                  depth={node.depth}
                  childCount={node.childCount}
                  expanded={expanded()}
                  selected={props.selectedId === node.item.id}
                  onExpandedChange={(nextExpanded) => props.onExpandedChange(node.item, nextExpanded)}
                  onSelected={() => props.onSelectedChange(node.item.id)}
                />

                <Show when={expanded()}>
                  <div class="ms-5 border-s border-zinc-200">{renderLevel(node)}</div>
                </Show>
              </li>
            );
          }}
        </For>
      </ul>
    );
  }
}

function RegularBookmarkTree(props: BookmarkTreeRendererProps) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();
  const scrollerSize = createElementSize(scroller);
  const scroll = createScrollPosition(scroller);
  const previewItems = createMemo(() => collectRegularPreviewItems(props.items, props.isExpanded));
  const totalHeight = createMemo(() => countVisibleItems(props.items, props.isExpanded) * ITEM_HEIGHT);

  return (
    <div class="flex min-h-0 flex-1">
      <div class="flex min-w-0 flex-1 flex-col bg-white text-zinc-950">
        <div
          ref={setScroller}
          class="min-h-0 flex-1 overflow-auto bg-white px-2 outline-none"
          role="tree"
          aria-label="Fixed-height regular bookmarks"
          tabindex="0"
        >
          {renderRegularLevel(props.items, props)}
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
  );
}

function renderRegularLevel(items: readonly BookmarkItem[], props: BookmarkTreeRendererProps, depth = 0): JSX.Element {
  return (
    <ul class="m-0 min-w-max list-none p-0" role={depth === 0 ? 'presentation' : 'group'}>
      <For each={items}>
        {(item) => {
          const hasChildren = item.children.length > 0;
          const expanded = () => hasChildren && props.isExpanded(item);

          return (
            <li class="relative m-0 min-w-max list-none p-0" role="none">
              <BookmarkRow
                item={item}
                depth={depth}
                childCount={item.children.length}
                expanded={expanded()}
                selected={props.selectedId === item.id}
                onExpandedChange={(nextExpanded) => props.onExpandedChange(item, nextExpanded)}
                onSelected={() => props.onSelectedChange(item.id)}
              />

              <Show when={expanded()}>
                <div class="ms-5 border-s border-zinc-200">{renderRegularLevel(item.children, props, depth + 1)}</div>
              </Show>
            </li>
          );
        }}
      </For>
    </ul>
  );
}

function BookmarkRow(props: {
  item: BookmarkItem;
  depth: number;
  childCount: number;
  expanded: boolean;
  selected: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSelected: () => void;
}) {
  const hasChildren = () => props.childCount > 0;

  return (
    <div
      class={[
        'group relative mx-1 flex min-w-max cursor-default items-center rounded-md px-1.5 pe-6 text-sm text-zinc-700 transition-colors select-none hover:bg-zinc-100 hover:text-zinc-950',
        {
          'before:absolute before:top-1/2 before:-left-6 before:w-5 before:border-t before:border-zinc-200':
            props.depth > 0,
          'bg-zinc-100 text-zinc-950': props.selected
        }
      ]}
      role="treeitem"
      aria-level={props.depth + 1}
      aria-expanded={hasChildren() ? (props.expanded ? 'true' : 'false') : undefined}
      aria-selected={props.selected ? 'true' : 'false'}
      style={{ height: `${ITEM_HEIGHT}px` }}
      onClick={props.onSelected}
    >
      <Show when={hasChildren()} fallback={<span class="h-6 w-6 flex-none" aria-hidden="true" />}>
        <button
          type="button"
          class="grid h-6 w-6 flex-none place-items-center rounded-sm text-zinc-500 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
          aria-label={props.expanded ? 'Collapse branch' : 'Expand branch'}
          onClick={(event) => {
            event.stopPropagation();
            props.onExpandedChange(!props.expanded);
          }}
        >
          <ChevronIcon expanded={props.expanded} />
        </button>
      </Show>
      <BookmarkIcon item={props.item} />
      <span
        class={[
          'max-w-[42rem] overflow-hidden text-ellipsis whitespace-nowrap',
          { 'font-medium text-zinc-900': props.item.kind !== 'bookmark' }
        ]}
        title={props.item.title}
      >
        {props.item.title}
      </span>
      <Show when={hasChildren() && !props.expanded}>
        <span class="ms-1.5 text-xs text-zinc-400">{countItems(props.item.children)}</span>
      </Show>
    </div>
  );
}

function BookmarkIcon(props: { item: BookmarkItem }) {
  const iconProps = {
    'aria-hidden': 'true',
    class: 'me-2 h-4 w-4 flex-none text-zinc-400',
    fill: 'none',
    viewBox: '0 0 24 24',
    stroke: 'currentColor',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'stroke-width': '1.75'
  } as const;

  switch (props.item.kind) {
    case 'browser':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3.6 9h16.8M8 21c2.7-3 3.5-6 3.5-9S10.7 6 8 3M16 3c-2.7 3-3.5 6-3.5 9s.8 6 3.5 9" />
        </svg>
      );
    case 'window':
      return (
        <svg {...iconProps}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 8h18M7 6h.01M10 6h.01" />
        </svg>
      );
    case 'folder':
      return (
        <svg {...iconProps}>
          <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2h7.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
        </svg>
      );
    case 'bookmark':
      return (
        <svg {...iconProps}>
          <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.15 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.15-1.1" />
        </svg>
      );
    default: {
      const exhaustiveKind: never = props.item.kind;
      return exhaustiveKind;
    }
  }
}

function ChevronIcon(props: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      class="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    >
      <path d={props.expanded ? 'm6 9 6 6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}

function createBookmarkTree(): BookmarkItem[] {
  const recentWindows = Array.from({ length: 36 }, (_, windowIndex) =>
    createWindow(windowIndex, windowIndex === 0 ? 'Today' : `${windowIndex} days ago`)
  );

  return [
    {
      id: 'browser',
      kind: 'browser',
      title: 'Chromium profile',
      children: [
        {
          id: 'bookmarks-bar',
          kind: 'folder',
          title: 'Bookmarks bar',
          children: [
            bookmark('solid-docs', 'Solid Docs — Fine-grained reactivity'),
            bookmark('typegpu', 'TypeGPU — Type-safe WebGPU'),
            bookmark('pixijs', 'PixiJS — The HTML5 Creation Engine'),
            {
              id: 'reference',
              kind: 'folder',
              title: 'Reference',
              children: [
                bookmark('mdn-resize-observer', 'ResizeObserver — Web APIs | MDN'),
                bookmark('solid-primitives', 'Solid Primitives'),
                bookmark('webgpu-spec', 'WebGPU specification')
              ]
            }
          ]
        },
        {
          id: 'recent-windows',
          kind: 'folder',
          title: 'Recently closed windows',
          children: recentWindows
        }
      ]
    }
  ];
}

function createWindow(windowIndex: number, dateLabel: string): BookmarkItem {
  return {
    id: `window-${windowIndex}`,
    kind: 'window',
    title: `Window (${dateLabel})`,
    children: Array.from({ length: 9 }, (_, groupIndex) => ({
      id: `window-${windowIndex}-group-${groupIndex}`,
      kind: 'folder' as const,
      title: GROUP_NAMES[groupIndex % GROUP_NAMES.length] ?? 'Research',
      children: Array.from({ length: 12 }, (_, bookmarkIndex) =>
        bookmark(
          `window-${windowIndex}-group-${groupIndex}-bookmark-${bookmarkIndex}`,
          BOOKMARK_TITLES[(windowIndex * 7 + groupIndex * 3 + bookmarkIndex) % BOOKMARK_TITLES.length] ??
            'Untitled bookmark'
        )
      )
    }))
  };
}

function bookmark(id: string, title: string): BookmarkItem {
  return { id, kind: 'bookmark', title, children: [] };
}

function hashString(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
}

function countItems(items: readonly BookmarkItem[]): number {
  return items.reduce((count, item) => count + 1 + countItems(item.children), 0);
}

function collectVirtualPreviewItems(
  nodes: readonly VirtualNestedItem<BookmarkItem>[],
  result: BookmarkPreviewItem[] = []
): BookmarkPreviewItem[] {
  for (const node of nodes) {
    result.push({
      top: node.top,
      height: node.ownHeight,
      depth: node.depth,
      colorIndex: hashString(node.item.id)
    });
    collectVirtualPreviewItems(node.children(), result);
  }
  return result;
}

function collectRegularPreviewItems(
  items: readonly BookmarkItem[],
  isExpanded: (item: BookmarkItem) => boolean
): BookmarkPreviewItem[] {
  const result: BookmarkPreviewItem[] = [];
  collectLevel(items, 0, 0);
  return result;

  function collectLevel(levelItems: readonly BookmarkItem[], depth: number, startTop: number): number {
    let top = startTop;

    for (const item of levelItems) {
      const itemTop = top;
      const previewItem: BookmarkPreviewItem = {
        top: itemTop,
        height: ITEM_HEIGHT,
        depth,
        colorIndex: hashString(item.id)
      };
      result.push(previewItem);
      top += ITEM_HEIGHT;

      if (isExpanded(item)) {
        top = collectLevel(item.children, depth + 1, top);
      }
    }

    return top;
  }
}

function countVisibleItems(items: readonly BookmarkItem[], isExpanded: (item: BookmarkItem) => boolean): number {
  return items.reduce(
    (count, item) => count + 1 + (isExpanded(item) ? countVisibleItems(item.children, isExpanded) : 0),
    0
  );
}

function forEachItem(items: readonly BookmarkItem[], visit: (item: BookmarkItem) => void): void {
  for (const item of items) {
    visit(item);
    forEachItem(item.children, visit);
  }
}

type BookmarkItem = {
  id: string;
  kind: 'browser' | 'window' | 'folder' | 'bookmark';
  title: string;
  children: BookmarkItem[];
};

type BookmarkPreviewItem = {
  top: number;
  height: number;
  depth: number;
  colorIndex: number;
};

const ITEM_HEIGHT = 32;

const GROUP_NAMES = [
  'Solid and TypeScript',
  'Graphics and WebGPU',
  'Documentation',
  'Issue research',
  'Performance',
  'UI references',
  'Articles',
  'Tools',
  'Later'
] as const;

const BOOKMARK_TITLES = [
  'SolidJS documentation — Signals and effects',
  'TypeScript: Documentation — Type inference',
  'WebGPU samples — Compute and rendering',
  'CSS selector patterns — MDN',
  'ResizeObserver: observe() method',
  'Virtual scrolling and dynamic content',
  'GitHub — solidjs-community/solid-primitives',
  'PixiJS API documentation',
  'Three.js manual — Creating a scene',
  'Chrome Developers — Performance',
  'ARIA Authoring Practices — Tree View',
  'JavaScript event loop visualization'
] as const;
