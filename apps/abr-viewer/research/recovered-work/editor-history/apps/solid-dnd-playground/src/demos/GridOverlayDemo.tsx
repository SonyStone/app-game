import { createBodyCursor } from '@solid-primitives/cursor';
import { createDnd, GAP_KEY, Place, Rect, reorderItems, type FlipAnimateEntry, type GapKey } from 'solid-dnd';
import { createSignal, For, Show, type JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import { makeUrlSearchParams } from '~/utils/makeUrlSearchParams';
import EventLog, { createEventLogger } from '../components/EventLog';
import { FlipDebugOverlay } from '../components/FlipDebugOverlay';
import { GridControls } from '../components/GridControls';
import { GridItem } from '../components/GridItem';
import { GridOverlayItem } from '../components/GridOverlayItem';
import { OrderDisplay } from '../components/OrderDisplay';
import { SelectionInfo } from '../components/SelectionInfo';
import { StateCard } from '../components/StateCard';
import { createGridItems } from '../data';

export default function GridOverlayDemo(): JSX.Element {
  const logger = createEventLogger();

  const [options, setOptions] = makeUrlSearchParams(
    createStore({
      animEnabled: true,
      animDuration: 200,
      debugEnabled: false,
      columns: 4
    }),
    { push: true }
  );

  const [items, setItems] = createSignal(createGridItems());
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement | undefined>(undefined);
  const [flipEntries, setFlipEntries] = createSignal<ReadonlyArray<FlipAnimateEntry<string | GapKey>>>([]);

  const dnd = createDnd({
    items,
    getKey: (item) => item.id,
    getContainerRect: () => Rect.fromElement(containerRef()),
    containerKey: 'grid',
    layout: 'grid',
    gridConfig: () => ({ columns: options.columns, gap: 8, rowHeight: 'auto' as const }),
    gridColumns: () => options.columns,
    duration: () => options.animDuration,
    animEnabled: () => options.animEnabled,
    onDragStart: (keys, pos) => {
      logger.addLog(`▶ DRAG  [${keys.join(', ')}] at (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`);
    },
    onFlipAnimate: setFlipEntries,
    onDrop: (keys, place) => {
      setItems((prev) => reorderItems(prev, keys, place, (item) => item.id));
      logger.addLog(`■ DROP  [${keys.join(', ')}] → ${Place.label(place)}`);
    },
    onCancel: () => logger.addLog('✕ CANCEL'),
    onSelectionChange: (keys) => {
      if (keys.length > 0) logger.addLog(`☑ SELECT  [${keys.join(', ')}]`);
    }
  });

  createBodyCursor(() => (dnd.isDragging() ? 'grabbing' : null));

  return (
    <div class="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 class="mb-1 text-sm font-semibold text-neutral-300">Sortable Grid — Drag Overlay</h2>
        <p class="mb-4 text-xs text-neutral-500">
          Grid items pop out as a floating overlay when dragged. A gap opens at the drop position. Uses{' '}
          <code class="rounded bg-white/10 px-1">createDnd</code> directly to compose{' '}
          <code class="rounded bg-white/10 px-1">createSortable</code> +{' '}
          <code class="rounded bg-white/10 px-1">createDisplayList</code> +{' '}
          <code class="rounded bg-white/10 px-1">createSelection</code> +{' '}
          <code class="rounded bg-white/10 px-1">createDragSensor</code> +{' '}
          <code class="rounded bg-white/10 px-1">createDragOverlay</code> +{' '}
          <code class="rounded bg-white/10 px-1">createFlip</code>.
        </p>
      </div>

      <SelectionInfo
        selected={dnd.selection.selected()}
        items={dnd.items()}
        onClear={() => dnd.selection.clear()}
        hint="Click to select · Ctrl+click toggle · Shift+click rectangular range"
      />

      {/*  Grid container  */}
      <div
        ref={setContainerRef}
        role="listbox"
        aria-label="Sortable grid"
        class="relative rounded-xl border border-white/10 bg-white/2 p-3"
        style={{ display: 'grid', 'grid-template-columns': `repeat(${options.columns}, 1fr)`, gap: '8px' }}
      >
        <For each={dnd.display.displayKeys()}>
          {(key) => {
            if (key === GAP_KEY) {
              const props = dnd.getGapBindings();
              return (
                <div
                  ref={props.ref}
                  class="rounded-lg border border-dashed border-blue-500/30 bg-blue-500/5"
                  style={{ height: `${props.height}px` }}
                />
              );
            }
            const props = dnd.getItemBindings(key);
            return <GridItem {...props} />;
          }}
        </For>
      </div>

      <GridControls
        columns={options.columns}
        setColumns={(value) => setOptions('columns', value)}
        animEnabled={options.animEnabled}
        setAnimEnabled={(value) => setOptions('animEnabled', value)}
        animDuration={options.animDuration}
        setAnimDuration={(value) => setOptions('animDuration', value)}
        isAnimating={dnd.isAnimating()}
        debugEnabled={options.debugEnabled}
        setDebugEnabled={(value) => setOptions('debugEnabled', value)}
      />

      {/*  Drag overlay  */}
      <Show when={dnd.drag.overlay.active()}>
        <div
          class="pointer-events-none fixed z-10000"
          style={{
            left: `${dnd.drag.overlay.position().x}px`,
            top: `${dnd.drag.overlay.position().y}px`,
            width: `${dnd.drag.overlay.size().x}px`,
            height: `${dnd.drag.overlay.size().y}px`
          }}
        >
          <GridOverlayItem items={dnd.items()} draggedIds={dnd.drag.draggedIds()} />
        </div>
      </Show>

      <FlipDebugOverlay
        entries={flipEntries()}
        elements={dnd.itemRefs as Map<string, HTMLElement>}
        isAnimating={dnd.isAnimating()}
        enabled={options.debugEnabled}
        isDragging={dnd.isDragging()}
        debugContext={(() =>
          dnd.isDragging()
            ? {
                dragging: dnd.drag.draggedIds(),
                place: Place.label(dnd.drag.dropPlace()),
                pointer: dnd.drag.sensor.position(),
                columns: options.columns,
                items: dnd.items(),
                displayKeys: dnd.display.displayKeys()
              }
            : undefined)()}
      />

      <OrderDisplay items={dnd.items()} columns={options.columns} />

      {/* State readout  */}
      <div class="grid grid-cols-4 gap-3">
        <StateCard label="isDragging" value={dnd.isDragging() ? 'true' : 'false'} active={dnd.isDragging()} />
        <StateCard
          label="dragging"
          value={dnd.drag.draggedIds().length > 0 ? dnd.drag.draggedIds().join(', ') : 'none'}
          active={dnd.drag.draggedIds().length > 0}
        />
        <StateCard
          label="dropPlace"
          value={Place.label(dnd.drag.dropPlace())}
          active={dnd.drag.dropPlace() !== undefined}
        />
        <StateCard
          label="selected"
          value={dnd.selection.selected().length > 0 ? `${dnd.selection.selected().length} items` : 'none'}
          active={dnd.selection.selected().length > 0}
        />
      </div>

      <EventLog logger={logger} />
    </div>
  );
}
