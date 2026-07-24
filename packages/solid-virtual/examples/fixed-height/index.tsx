import { createVirtualList } from '@app-game/solid-virtual';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createSignal, For, Show } from 'solid-js';
import { createFlatItems, type FlatItem } from '../shared/flatItems';
import { makeUrlSearchParams } from '../shared/makeUrlSearchParams';
import { MapToggle } from '../shared/MapToggle';
import { ScrollModeToggle, type ScrollMode } from '../shared/ScrollModeToggle';
import { VirtualScrollPreview } from '../shared/VirtualPreview';

/** Shows fixed-height virtual and regular scrolling over the same records. */
export default function FixedHeightExample() {
  const items = createFlatItems();
  const [mapVisible, setMapVisible] = makeUrlSearchParams(createSignal(false), { key: 'map' });
  const [mode, setMode] = createSignal<ScrollMode>('virtual');

  return (
    <section class="flex min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <ExampleHeader
        title="Fixed height"
        count={items.length}
        mode={mode()}
        onModeChange={setMode}
        mapVisible={mapVisible()}
        onMapVisibleChange={setMapVisible}
      />
      <Show
        when={mode() === 'virtual'}
        fallback={<RegularFixedHeightList items={items} rowHeight={ROW_HEIGHT} mapVisible={mapVisible()} />}
      >
        <VirtualFixedHeightList items={items} rowHeight={ROW_HEIGHT} mapVisible={mapVisible()} />
      </Show>
    </section>
  );
}

type FixedHeightListProps = Readonly<{
  items: readonly FlatItem[];
  rowHeight: number;
  mapVisible: boolean;
}>;

function VirtualFixedHeightList(props: FixedHeightListProps) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();
  const virtual = createVirtualList({
    items: props.items,
    itemHeight: props.rowHeight,
    elementRef: scroller
  });

  return (
    <>
      <Metrics
        range={`${virtual.startIndex}–${virtual.endIndex}`}
        rendered={virtual.children().length}
        scroll={virtual.scrollPosition}
        height={virtual.totalHeight}
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

function RegularFixedHeightList(props: FixedHeightListProps) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();
  const scrollerSize = createElementSize(scroller);
  const [scrollPosition, setScrollPosition] = createSignal(0);
  const totalHeight = () => props.items.length * props.rowHeight;

  return (
    <>
      <Metrics
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

function Metrics(props: { range: string; rendered: number; scroll: number; height: number }) {
  return (
    <dl class="grid shrink-0 grid-cols-4 border-b border-zinc-200 bg-zinc-50">
      <Metric label="Range" value={props.range} />
      <Metric label="Rendered" value={props.rendered} />
      <Metric label="Scroll" value={Math.round(props.scroll)} />
      <Metric label="Height" value={Math.round(props.height)} />
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

function createFixedPreviewItems(
  itemCount: number,
  rowHeight: number
): { top: number; height: number; index: number }[] {
  return Array.from({ length: itemCount }, (_, index) => ({ top: index * rowHeight, height: rowHeight, index }));
}

const ROW_HEIGHT = 96;
