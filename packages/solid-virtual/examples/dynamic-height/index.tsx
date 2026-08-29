import { createDynamicGap, createDynamicHeight, createVirtualList } from '@app-game/solid-virtual';
import { createMemo, createSignal, createStore, For, Show, storePath } from 'solid-js';
import { createFlatItem, createFlatItems, type FlatItem, type ItemId } from '../shared/flatItems';
import { Item as ExampleItem } from '../shared/Item';
import { makeUrlSearchParams } from '../shared/makeUrlSearchParams';
import { MapToggle } from '../shared/MapToggle';
import { ScrollModeToggle, type ScrollMode } from '../shared/ScrollModeToggle';
import { VirtualScrollPreview } from '../shared/VirtualPreview';
import { createRegularList } from './createRegularList';

/** Shows editable dynamic-height virtual and regular scrolling with a live Tailwind gap class. */
export default function DynamicHeightExample() {
  let nextItemIndex = DEFAULT_ITEM_COUNT;
  const [items, setItems] = createStore<FlatItem[]>(createFlatItems(DEFAULT_ITEM_COUNT));
  const [mapVisible, setMapVisible] = makeUrlSearchParams(createSignal(false), { key: 'map' });
  const [mode, setMode] = createSignal<ScrollMode>('virtual');
  const [tailwindGap, setTailwindGap] = createSignal(DEFAULT_TAILWIND_GAP);

  const actions = {
    addItemAfter(item: FlatItem): void {
      const position = items.indexOf(item);
      if (position < 0) return;

      setItems((currentItems) => [
        ...currentItems.slice(0, position + 1),
        createFlatItem(nextItemIndex++),
        ...currentItems.slice(position + 1)
      ]);
    },
    removeItem(item: FlatItem): void {
      setItems((currentItems) => currentItems.filter((candidate) => candidate !== item));
    },
    updateItem(item: FlatItem, data: Record<string, string>): void {
      const position = items.indexOf(item);
      if (position >= 0) setItems(storePath(position, 'data', data));
    },
    updateItemId(item: FlatItem, id: ItemId): void {
      const position = items.indexOf(item);
      if (position >= 0) setItems(storePath(position, 'id', id));
    }
  };

  return (
    <section class="flex min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <ExampleHeader
        title="Dynamic height"
        count={items.length}
        mode={mode()}
        onModeChange={setMode}
        mapVisible={mapVisible()}
        onMapVisibleChange={setMapVisible}
      />
      <DynamicGapControl value={tailwindGap()} onChange={setTailwindGap} />
      <Show
        when={mode() === 'virtual'}
        fallback={
          <RegularDynamicHeightList
            items={items}
            rowHeight={ESTIMATED_ROW_HEIGHT}
            mapVisible={mapVisible()}
            tailwindGap={tailwindGap()}
            actions={actions}
          />
        }
      >
        <VirtualDynamicHeightList
          items={items}
          rowHeight={ESTIMATED_ROW_HEIGHT}
          mapVisible={mapVisible()}
          tailwindGap={tailwindGap()}
          actions={actions}
        />
      </Show>
    </section>
  );
}

type DynamicHeightListProps = Readonly<{
  items: readonly FlatItem[];
  rowHeight: number;
  mapVisible: boolean;
  tailwindGap: TailwindGap;
  actions: DynamicHeightActions;
}>;

type DynamicHeightActions = Readonly<{
  addItemAfter: (item: FlatItem) => void;
  removeItem: (item: FlatItem) => void;
  updateItem: (item: FlatItem, data: Record<string, string>) => void;
  updateItemId: (item: FlatItem, id: ItemId) => void;
}>;

function VirtualDynamicHeightList(props: DynamicHeightListProps) {
  const [scroller, setScroller] = createSignal<HTMLElement | undefined>();
  const gap = createDynamicGap();
  const virtual = createVirtualList({
    items: () => props.items,
    elementRef: scroller,
    itemHeight: createDynamicHeight<FlatItem>({
      estimate: () => props.rowHeight
    }),
    overscan: 640,
    gap
  });

  return (
    <>
      <Metrics
        range={`${virtual.children()[0]?.item.index ?? '-'}–${
          virtual.children()[virtual.children().length - 1]?.item.index ?? '-'
        }`}
        rendered={virtual.children().length}
        scroll={virtual.scrollPosition}
        height={virtual.totalHeight}
        gap={virtual.gap}
      />
      <div class="flex min-h-0 flex-1">
        <EditableList
          items={virtual.children()}
          setLayoutRef={gap.setElementRef}
          setScroller={setScroller}
          virtual={virtual}
          tailwindGap={props.tailwindGap}
          actions={props.actions}
        />
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

function RegularDynamicHeightList(props: DynamicHeightListProps) {
  const [scroller, setScroller] = createSignal<HTMLElement | undefined>();
  const regular = createRegularList({
    items: () => props.items,
    elementRef: scroller,
    rowHeight: () => props.rowHeight,
    gap: () => props.tailwindGap.pixels
  });
  const previewItems = createMemo(() => createRegularPreviewItems(regular.children(), props.tailwindGap.pixels));

  return (
    <>
      <Metrics
        range={`0–${Math.max(0, props.items.length - 1)}`}
        rendered={regular.children().length}
        scroll={regular.scrollPosition}
        height={regular.totalHeight}
        gap={props.tailwindGap.pixels}
      />
      <div class="flex min-h-0 flex-1">
        <EditableList
          items={regular.children()}
          setScroller={setScroller}
          tailwindGap={props.tailwindGap}
          actions={props.actions}
        />
        <Show when={props.mapVisible}>
          <VirtualScrollPreview
            totalHeight={regular.totalHeight}
            scrollPosition={regular.scrollPosition}
            viewportHeight={regular.viewportHeight}
            children={previewItems()}
            scrollTo={regular.scrollToOffset}
          />
        </Show>
      </div>
    </>
  );
}

function createRegularPreviewItems(
  children: readonly { height: number }[],
  gap: number
): { top: number; height: number; index: number }[] {
  let top = 0;
  return children.map((child, index) => {
    const previewItem = { top, height: child.height, index };
    top += child.height + gap;
    return previewItem;
  });
}

function EditableList(props: {
  items: readonly {
    item: FlatItem;
    setElementRef: (element: HTMLElement) => void;
  }[];
  setScroller: (element: HTMLUListElement) => void;
  setLayoutRef?: (element: HTMLDivElement) => void;
  virtual?: { paddingTop: number; paddingBottom: number };
  tailwindGap: TailwindGap;
  actions: DynamicHeightActions;
}) {
  return (
    <ul ref={props.setScroller} class="min-w-0 flex-1 overflow-y-auto bg-zinc-50/50 p-2 outline-none">
      <div
        ref={(element) => props.setLayoutRef?.(element)}
        class={`flex flex-col ${props.tailwindGap.className}`}
        style={{
          'padding-top': `${props.virtual?.paddingTop ?? 0}px`,
          'padding-bottom': `${props.virtual?.paddingBottom ?? 0}px`
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

function DynamicGapControl(props: { value: TailwindGap; onChange: (value: TailwindGap) => void }) {
  function selectGap(className: string): void {
    const selectedGap = TAILWIND_GAPS.find((gap) => gap.className === className);
    if (selectedGap) props.onChange(selectedGap);
  }

  return (
    <label class="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-500">
      <span class="font-medium text-zinc-700">Tailwind gap class</span>
      <select
        class="rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-[11px] text-zinc-700"
        value={props.value.className}
        onChange={(event) => selectGap(event.currentTarget.value)}
      >
        <For each={TAILWIND_GAPS}>
          {(gap) => (
            <option value={gap.className}>
              {gap.className} ({gap.pixels}px)
            </option>
          )}
        </For>
      </select>
      <span class="text-[11px] text-zinc-400">
        Virtual mode reads the computed gap after the layout element's class changes.
      </span>
    </label>
  );
}

function ExampleHeader(props: {
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

function Metrics(props: { range: string; rendered: number; scroll: number; height: number; gap: number }) {
  return (
    <dl class="grid shrink-0 grid-cols-5 border-b border-zinc-200 bg-zinc-50">
      <Metric label="Range" value={props.range} />
      <Metric label="Rendered" value={props.rendered} />
      <Metric label="Scroll" value={Math.round(props.scroll)} />
      <Metric label="Height" value={Math.round(props.height)} />
      <Metric label="Detected gap" value={`${props.gap}px`} />
    </dl>
  );
}

function Metric(props: { label: string; value: string | number }) {
  return (
    <div class="border-e border-zinc-200 px-3 py-2 last:border-e-0">
      <dt class="text-[9px] font-medium tracking-wider text-zinc-400 uppercase">{props.label}</dt>
      <dd class="mt-0.5 truncate font-mono text-[11px] text-zinc-700">{props.value}</dd>
    </div>
  );
}

const DEFAULT_ITEM_COUNT = 200;
const ESTIMATED_ROW_HEIGHT = 128;
const TAILWIND_GAPS = [
  { className: 'gap-0', pixels: 0 },
  { className: 'gap-1', pixels: 4 },
  { className: 'gap-2', pixels: 8 },
  { className: 'gap-3', pixels: 12 },
  { className: 'gap-4', pixels: 16 },
  { className: 'gap-6', pixels: 24 },
  { className: 'gap-8', pixels: 32 },
  { className: 'gap-12', pixels: 48 }
] as const;
type TailwindGap = (typeof TAILWIND_GAPS)[number];
const DEFAULT_TAILWIND_GAP = TAILWIND_GAPS[2];
