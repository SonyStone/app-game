import { createBodyCursor } from '@solid-primitives/cursor';
import { createDnd, Place, reorderItems } from 'solid-dnd';
import { createSignal, For, Show, type JSX } from 'solid-js';
import { AnimationControls } from '../components/AnimationControls';
import { DropIndicator } from '../components/DropIndicator';
import EventLog, { createEventLogger } from '../components/EventLog';
import { ListItem } from '../components/ListItem';
import { OrderDisplay } from '../components/OrderDisplay';
import { SelectionInfo } from '../components/SelectionInfo';
import { StateCard } from '../components/StateCard';
import { createDemoItems } from '../data';

export default function ListDemo(): JSX.Element {
  const logger = createEventLogger();
  const [items, setItems] = createSignal(createDemoItems());
  let containerRef: HTMLDivElement | undefined;
  const [animEnabled, setAnimEnabled] = createSignal(true);
  const [animDuration, setAnimDuration] = createSignal(200);

  const dnd = createDnd({
    items,
    getKey: (item) => item.id,
    getContainerRect: () => containerRef?.getBoundingClientRect(),
    containerKey: 'list',
    duration: animDuration,
    animEnabled,
    onSelectionChange: (keys) => {
      if (keys.length > 0) {
        logger.addLog(LOGS.SELECT(keys));
      }
    },
    onDrop: (keys, place) => {
      setItems((prev) => reorderItems(prev, keys, place, (item) => item.id));
      logger.addLog(LOGS.DROP(keys, place));
    },
    onDragStart: (keys, pos) => {
      logger.addLog(LOGS.DRAG(keys, keys[0] ?? '', { position: pos }));
    },
    onCancel: () => logger.addLog(LOGS.CANCEL())
  });

  createBodyCursor(() => (dnd.isDragging() ? 'grabbing' : null));

  function indicatorY(): number | undefined {
    if (!dnd.isDragging()) {
      return undefined;
    }

    return dnd.sortable.getIndicatorOffset(dnd.drag.dropPlace());
  }

  return (
    <div class="flex flex-col gap-6">
      <div>
        <h2 class="mb-1 text-sm font-semibold text-neutral-300">Sortable List</h2>
        <p class="mb-4 text-xs text-neutral-500">
          Drag items to reorder. Click to select, Ctrl+click to toggle, Shift+click for range. Uses{' '}
          <code class="rounded bg-white/10 px-1">createDnd</code> to compose{' '}
          <code class="rounded bg-white/10 px-1">createSortable</code> +{' '}
          <code class="rounded bg-white/10 px-1">createSelection</code>.
        </p>
      </div>

      <AnimationControls
        enabled={animEnabled()}
        setEnabled={setAnimEnabled}
        duration={animDuration()}
        setDuration={setAnimDuration}
        isAnimating={dnd.isAnimating()}
      />

      <SelectionInfo selected={dnd.selection.selected()} items={items()} onClear={() => dnd.selection.clear()} />

      <div
        ref={containerRef}
        role="listbox"
        aria-label="Sortable list"
        class="relative flex flex-col gap-2 rounded-xl border border-white/10 bg-white/2 p-3"
      >
        <For each={items()}>{(item) => <ListItem {...dnd.getItemBindings(item.id)} />}</For>

        <Show when={indicatorY() !== undefined}>
          <DropIndicator y={indicatorY()!} />
        </Show>
      </div>

      <OrderDisplay items={items()} />

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

const LOGS = {
  SELECT: (ids: ReadonlyArray<string>) => `☑ SELECT  [${ids.join(', ')}]`,
  DRAG: (ids: ReadonlyArray<string>, id: string | null = '', e: { position: { x: number; y: number } }) => {
    const label = ids.length > 1 ? `[${ids.join(', ')}]` : `id="${id}"`;
    return `▶ DRAG  ${label} at (${e.position.x.toFixed(0)}, ${e.position.y.toFixed(0)})`;
  },
  DROP: (ids: ReadonlyArray<string>, place: Place.Place<string> | undefined) => {
    const label = ids.length > 1 ? `[${ids.join(', ')}]` : `id="${ids[0]}"`;
    return `■ DROP  ${label} → ${Place.label(place)}`;
  },
  CANCEL: () => `✕ CANCEL`
};
