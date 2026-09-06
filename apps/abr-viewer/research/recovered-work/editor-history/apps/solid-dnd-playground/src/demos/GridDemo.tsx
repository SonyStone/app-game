import { createBodyCursor } from '@solid-primitives/cursor';
import type { GridConfig } from 'solid-dnd';
import { createDnd, Place, reorderItems } from 'solid-dnd';
import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import EventLog, { createEventLogger } from '../components/EventLog';
import { GridControls } from '../components/GridControls';
import { GridDropIndicator } from '../components/GridDropIndicator';
import { GridItem } from '../components/GridItem';
import { OrderDisplay } from '../components/OrderDisplay';
import { SelectionInfo } from '../components/SelectionInfo';
import { StateCard } from '../components/StateCard';
import { createGridItems } from '../data';

export default function GridDemo(): JSX.Element {
  const logger = createEventLogger();
  const [items, setItems] = createSignal(createGridItems());
  const [columns, setColumns] = createSignal(4);
  const gridConfig = createMemo<GridConfig>(() => ({
    columns: columns(),
    gap: 8,
    rowHeight: 'auto'
  }));
  let containerRef: HTMLDivElement | undefined;
  const [animEnabled, setAnimEnabled] = createSignal(true);
  const [animDuration, setAnimDuration] = createSignal(200);

  const dnd = createDnd({
    items,
    getKey: (item) => item.id,
    getContainerRect: () => containerRef?.getBoundingClientRect(),
    containerKey: 'grid',
    layout: 'grid',
    gridConfig,
    gridColumns: columns,
    duration: animDuration,
    animEnabled,
    onSelectionChange: (keys) => {
      if (keys.length > 0) {
        logger.addLog(`☑ SELECT  [${keys.join(', ')}]`);
      }
    },
    onDrop: (keys, place) => {
      setItems((prev) => reorderItems(prev, keys, place, (item) => item.id));
      logger.addLog(`■ DROP  [${keys.join(', ')}] → ${Place.label(place)}`);
    },
    onDragStart: (keys, pos) => {
      logger.addLog(`▶ DRAG  [${keys.join(', ')}] at (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`);
    },
    onCancel: () => logger.addLog('✕ CANCEL')
  });

  createBodyCursor(() => (dnd.isDragging() ? 'grabbing' : null));

  function indicatorPos() {
    if (!dnd.isDragging()) {
      return undefined;
    }

    return dnd.sortable.getGridIndicator(dnd.drag.dropPlace());
  }

  return (
    <div class="flex flex-col gap-6">
      <div>
        <h2 class="mb-1 text-sm font-semibold text-neutral-300">Sortable Grid</h2>
        <p class="mb-4 text-xs text-neutral-500">
          Drag items to reorder in a grid. Click to select, Ctrl+click to toggle, Shift+click for rectangular range.
          Uses <code class="rounded bg-white/10 px-1">createDnd</code> to compose{' '}
          <code class="rounded bg-white/10 px-1">createSortable</code> (grid mode) +{' '}
          <code class="rounded bg-white/10 px-1">createSelection</code> (grid range).
        </p>
      </div>

      <GridControls
        columns={columns()}
        setColumns={setColumns}
        animEnabled={animEnabled()}
        setAnimEnabled={setAnimEnabled}
        animDuration={animDuration()}
        setAnimDuration={setAnimDuration}
        isAnimating={dnd.isAnimating()}
      />

      <SelectionInfo
        selected={dnd.selection.selected()}
        items={items()}
        onClear={() => dnd.selection.clear()}
        hint="Click items to select · Ctrl+click to multi-select · Shift+click for rectangular range"
      />

      <div
        ref={containerRef}
        role="listbox"
        aria-label="Sortable grid"
        class="relative rounded-xl border border-white/10 bg-white/2 p-3"
        style={{ display: 'grid', 'grid-template-columns': `repeat(${columns()}, 1fr)`, gap: '8px' }}
      >
        <For each={items()}>{(item) => <GridItem {...dnd.getItemBindings(item.id)} />}</For>

        <Show when={indicatorPos()}>
          {(pos) => <GridDropIndicator x={pos().x} y={pos().y} height={pos().height} />}
        </Show>
      </div>

      <OrderDisplay items={items()} columns={columns()} />

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
