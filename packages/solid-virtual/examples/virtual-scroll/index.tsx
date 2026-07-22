import { createVirtualDynamicList } from '@app-game/solid-virtual/createVirtualDynamicList';
import { createVirtualList } from '@app-game/solid-virtual/createVirtualList';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createSignal, For, Show, type JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import { getRandomObject } from '../shared/getRandomObject';
import { Item as ExampleItem } from '../shared/Item';
import { makeUrlSearchParams } from '../shared/makeUrlSearchParams';
import { MapToggle } from '../shared/MapToggle';
import { ScrollModeToggle, type ScrollMode } from '../shared/ScrollModeToggle';
import { VirtualScrollPreview } from '../shared/VirtualPreview';
import { createRegularList } from './createRegularList';
import { DebugView } from './DebugView';
import type { FlatItem, ItemId } from './types';

/** Shows a fixed-height flat list with virtual and regular scrolling modes. */
export default function FixedHeightVirtualScrollExample(props: { embedded?: boolean } = {}) {
  const items = createFlatItems();
  const [mapVisible, setMapVisible] = makeUrlSearchParams(createSignal(false), { key: 'map' });

  return (
    <ExamplePage embedded={props.embedded}>
      <FixedHeightExample items={items} rowHeight={96} mapVisible={mapVisible()} onMapVisibleChange={setMapVisible} />
    </ExamplePage>
  );
}

/** Shows an editable dynamic-height list with virtual and regular scrolling modes. */
export function DynamicHeightVirtualScrollExample(props: { embedded?: boolean } = {}) {
  let nextItemIndex = 200;
  const [store, setStore] = createStore<FlatItem[]>(createFlatItems());
  const [mapVisible, setMapVisible] = makeUrlSearchParams(createSignal(false), { key: 'map' });

  const actions = {
    addItemAfter(item: FlatItem): void {
      const position = store.indexOf(item);
      if (position < 0) return;

      const index = nextItemIndex++;
      setStore((items) => [
        ...items.slice(0, position + 1),
        { id: `item-${index}` as ItemId, index, data: getRandomObject() },
        ...items.slice(position + 1)
      ]);
    },
    removeItem(item: FlatItem): void {
      setStore((items) => items.filter((candidate) => candidate !== item));
    },
    updateItem(item: FlatItem, data: Record<string, string>): void {
      const position = store.indexOf(item);
      if (position >= 0) setStore(position, 'data', data);
    },
    updateItemId(item: FlatItem, id: ItemId): void {
      const position = store.indexOf(item);
      if (position >= 0) setStore(position, 'id', id);
    }
  };

  return (
    <ExamplePage embedded={props.embedded}>
      <DynamicHeightExample
        items={store}
        rowHeight={128}
        mapVisible={mapVisible()}
        onMapVisibleChange={setMapVisible}
        {...actions}
      />
    </ExamplePage>
  );
}

function ExamplePage(props: { embedded?: boolean; children: JSX.Element }) {
  return <div class={props.embedded ? '' : 'min-h-screen bg-zinc-50 p-4 text-zinc-950'}>{props.children}</div>;
}

function FixedHeightExample(props: {
  items: FlatItem[];
  rowHeight: number;
  mapVisible: boolean;
  onMapVisibleChange: (visible: boolean) => void;
}) {
  const [mode, setMode] = createSignal<ScrollMode>('virtual');

  return (
    <section class="flex h-[640px] min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <PanelHeader
        title="Fixed height"
        count={props.items.length}
        mode={mode()}
        onModeChange={setMode}
        mapVisible={props.mapVisible}
        onMapVisibleChange={props.onMapVisibleChange}
      />
      <Show when={mode() === 'virtual'} fallback={<RegularFixedHeightList {...props} />}>
        <VirtualFixedHeightList {...props} />
      </Show>
    </section>
  );
}

function VirtualFixedHeightList(
  props: Pick<Parameters<typeof FixedHeightExample>[0], 'items' | 'rowHeight' | 'mapVisible'>
) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();
  const virtual = createVirtualList({
    items: props.items,
    rowHeight: props.rowHeight,
    elementRef: scroller
  });

  return (
    <>
      <DebugView
        totalHeight={virtual.totalHeight}
        scrollPosition={virtual.scrollPosition}
        visibleCount={virtual.children().length}
        startIndex={virtual.startIndex}
        endIndex={virtual.endIndex}
      />
      <div class="flex min-h-0 flex-1">
        <div ref={setScroller} class="min-w-0 flex-1 overflow-y-auto bg-zinc-50/50 outline-none">
          <div
            style={{
              'padding-top': `${virtual.paddingTop}px`,
              'padding-bottom': `${virtual.paddingBottom}px`
            }}
          >
            <For each={virtual.children()}>
              {(child) => <FixedRow item={child.item} index={child.index} top={child.top} height={child.height} />}
            </For>
          </div>
        </div>
        <Show when={props.mapVisible}>
          <VirtualScrollPreview
            totalHeight={virtual.totalHeight}
            scrollPosition={virtual.scrollPosition}
            viewportHeight={virtual.viewportHeight}
            children={virtual.children()}
            scrollTo={virtual.scrollToOffset}
          />
        </Show>
      </div>
    </>
  );
}

function RegularFixedHeightList(
  props: Pick<Parameters<typeof FixedHeightExample>[0], 'items' | 'rowHeight' | 'mapVisible'>
) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();
  const scrollerSize = createElementSize(scroller);
  const [scrollPosition, setScrollPosition] = createSignal(0);
  const totalHeight = () => props.items.length * props.rowHeight;

  return (
    <>
      <ComparisonMetrics
        range={`0–${Math.max(0, props.items.length - 1)}`}
        rendered={props.items.length}
        scroll={scrollPosition()}
        height={totalHeight()}
      />
      <div class="flex min-h-0 flex-1">
        <div
          ref={setScroller}
          class="min-h-0 min-w-0 flex-1 overflow-y-auto bg-zinc-50/50 outline-none"
          onScroll={(event) => setScrollPosition(event.currentTarget.scrollTop)}
        >
          <For each={props.items}>
            {(item, index) => (
              <FixedRow item={item} index={index()} top={index() * props.rowHeight} height={props.rowHeight} />
            )}
          </For>
        </div>
        <Show when={props.mapVisible}>
          <VirtualScrollPreview
            totalHeight={totalHeight()}
            scrollPosition={scrollPosition()}
            viewportHeight={scrollerSize.height ?? 0}
            children={createFixedPreviewItems(props.items.length, props.rowHeight)}
            scrollTo={(position) => scroller()?.scrollTo({ top: position })}
          />
        </Show>
      </div>
    </>
  );
}

function FixedRow(props: { item: FlatItem; index: number; top: number; height: number }) {
  return (
    <article
      class="flex border-b border-zinc-200 bg-white px-4 py-3 last:border-b-0"
      style={{ height: `${props.height}px`, 'overflow-anchor': 'none' }}
    >
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-zinc-100 font-mono text-[11px] text-zinc-500">
          {String(props.index).padStart(3, '0')}
        </span>
        <div class="min-w-0">
          <p class="truncate text-sm font-medium">{props.item.id}</p>
          <p class="mt-1 font-mono text-[11px] text-zinc-400">top {props.top}px</p>
        </div>
      </div>
      <span class="self-center rounded-md border border-zinc-200 px-2 py-1 font-mono text-[10px] text-zinc-400">
        {props.height}px
      </span>
    </article>
  );
}

function DynamicHeightExample(props: {
  items: FlatItem[];
  rowHeight: number;
  mapVisible: boolean;
  onMapVisibleChange: (visible: boolean) => void;
  addItemAfter: (item: FlatItem) => void;
  removeItem: (item: FlatItem) => void;
  updateItem: (item: FlatItem, data: Record<string, string>) => void;
  updateItemId: (item: FlatItem, id: ItemId) => void;
}) {
  const [mode, setMode] = createSignal<ScrollMode>('virtual');

  return (
    <section class="flex h-[640px] min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <PanelHeader
        title="Dynamic height"
        count={props.items.length}
        mode={mode()}
        onModeChange={setMode}
        mapVisible={props.mapVisible}
        onMapVisibleChange={props.onMapVisibleChange}
      />
      <Show when={mode() === 'virtual'} fallback={<RegularDynamicHeightList {...props} />}>
        <VirtualDynamicHeightList {...props} />
      </Show>
    </section>
  );
}

function VirtualDynamicHeightList(props: Parameters<typeof DynamicHeightExample>[0]) {
  const [scroller, setScroller] = createSignal<HTMLElement | undefined>();
  const virtual = createVirtualDynamicList({
    items: props.items,
    elementRef: scroller,
    overscan: 640,
    estimateHeight: () => props.rowHeight,
    gap: 8
  });

  return (
    <>
      <ComparisonMetrics
        range={`${virtual.children()[0]?.item.index ?? '-'}–${
          virtual.children()[virtual.children().length - 1]?.item.index ?? '-'
        }`}
        rendered={virtual.children().length}
        scroll={virtual.scrollPosition}
        height={virtual.totalHeight}
      />
      <div class="flex min-h-0 flex-1">
        <EditableList items={virtual.children()} setScroller={setScroller} virtual={virtual} actions={props} />
        <Show when={props.mapVisible}>
          <VirtualScrollPreview
            totalHeight={virtual.totalHeight}
            scrollPosition={virtual.scrollPosition}
            viewportHeight={virtual.viewportHeight}
            children={virtual.children()}
            scrollTo={virtual.scrollToOffset}
          />
        </Show>
      </div>
    </>
  );
}

function RegularDynamicHeightList(props: Parameters<typeof DynamicHeightExample>[0]) {
  const [scroller, setScroller] = createSignal<HTMLElement | undefined>();
  const regular = createRegularList({
    items: props.items,
    elementRef: scroller,
    rowHeight: props.rowHeight,
    gap: 8
  });

  return (
    <>
      <ComparisonMetrics
        range={`0–${Math.max(0, props.items.length - 1)}`}
        rendered={regular.children().length}
        scroll={regular.scrollPosition}
        height={regular.totalHeight}
      />
      <div class="flex min-h-0 flex-1">
        <EditableList items={regular.children()} setScroller={setScroller} actions={props} />
        <Show when={props.mapVisible}>
          <VirtualScrollPreview
            totalHeight={regular.totalHeight}
            scrollPosition={regular.scrollPosition}
            viewportHeight={regular.viewportHeight}
            children={regular.children()}
            scrollTo={regular.scrollToOffset}
          />
        </Show>
      </div>
    </>
  );
}

function EditableList(props: {
  items: readonly {
    item: FlatItem;
    setElementRef: (element: HTMLElement) => void;
  }[];
  setScroller: (element: HTMLUListElement) => void;
  virtual?: { paddingTop: number; paddingBottom: number; gap: number };
  actions: Pick<
    Parameters<typeof DynamicHeightExample>[0],
    'addItemAfter' | 'removeItem' | 'updateItem' | 'updateItemId'
  >;
}) {
  return (
    <ul ref={props.setScroller} class="min-w-0 flex-1 overflow-y-auto bg-zinc-50/50 p-2 outline-none">
      <div
        class="flex flex-col"
        style={{
          'padding-top': `${props.virtual?.paddingTop ?? 0}px`,
          'padding-bottom': `${props.virtual?.paddingBottom ?? 0}px`,
          gap: `${props.virtual?.gap ?? 8}px`
        }}
      >
        <For each={props.items}>
          {(child) => (
            <ExampleItem
              ref={child.setElementRef}
              onAdd={() => props.actions.addItemAfter(child.item)}
              onRemove={() => props.actions.removeItem(child.item)}
              onValueChange={(data) => props.actions.updateItem(child.item, data)}
              onItemIdChange={(id) => props.actions.updateItemId(child.item, id)}
              title={child.item.id}
              index={child.item.index}
              data={child.item.data}
            />
          )}
        </For>
      </div>
    </ul>
  );
}

function PanelHeader(props: {
  title: string;
  count: number;
  mode: ScrollMode;
  onModeChange: (mode: ScrollMode) => void;
  mapVisible: boolean;
  onMapVisibleChange: (visible: boolean) => void;
}) {
  return (
    <header class="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 px-4">
      <span class="text-sm font-semibold">{props.title}</span>
      <span class="rounded bg-zinc-100 px-2 py-1 font-mono text-[10px] text-zinc-500">{props.count}</span>
      <div class="ms-auto flex items-center gap-2">
        <MapToggle visible={props.mapVisible} onChange={props.onMapVisibleChange} />
        <ScrollModeToggle mode={props.mode} onChange={props.onModeChange} />
      </div>
    </header>
  );
}

function ComparisonMetrics(props: { range: string; rendered: number; scroll: number; height: number }) {
  return (
    <dl class="grid shrink-0 grid-cols-4 border-b border-zinc-200 bg-zinc-50">
      <DebugMetric label="Range" value={props.range} />
      <DebugMetric label="Rendered" value={props.rendered} />
      <DebugMetric label="Scroll" value={Math.round(props.scroll)} />
      <DebugMetric label="Height" value={Math.round(props.height)} />
    </dl>
  );
}

function DebugMetric(props: { label: string; value: string | number }) {
  return (
    <div class="border-e border-zinc-200 px-3 py-2 last:border-e-0">
      <dt class="text-[9px] font-medium tracking-wider text-zinc-400 uppercase">{props.label}</dt>
      <dd class="mt-0.5 truncate font-mono text-[11px] text-zinc-700">{props.value}</dd>
    </div>
  );
}

function createFlatItems(): FlatItem[] {
  return Array.from({ length: 200 }, (_, index) => ({
    id: `item-${index}` as ItemId,
    index,
    data: getRandomObject()
  }));
}

function createFixedPreviewItems(
  itemCount: number,
  rowHeight: number
): { top: number; height: number; index: number }[] {
  return Array.from({ length: itemCount }, (_, index) => ({ top: index * rowHeight, height: rowHeight, index }));
}
