import { createBodyCursor } from '@solid-primitives/cursor';
import { createDnd, GAP_KEY, Place, Rect, reorderItems, type FlipAnimateEntry, type GapKey } from 'solid-dnd';
import { createSignal, For, Show, type JSX } from 'solid-js';
import { AnimationControls } from '../components/AnimationControls';
import EventLog, { createEventLogger } from '../components/EventLog';
import { FlipDebugOverlay } from '../components/FlipDebugOverlay';
import { ListItem } from '../components/ListItem';
import { ListOverlayItem } from '../components/ListOverlayItem';
import { OrderDisplay } from '../components/OrderDisplay';
import { SelectionInfo } from '../components/SelectionInfo';
import { StateCard } from '../components/StateCard';
import { createDemoItems } from '../data';

export default function ListOverlayDemo(): JSX.Element {
  const logger = createEventLogger();

  const [animEnabled, setAnimEnabled] = createSignal(true);
  const [animDuration, setAnimDuration] = createSignal(200);
  const [debugEnabled, setDebugEnabled] = createSignal(false);
  const [items, setItems] = createSignal(createDemoItems());
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement | undefined>(undefined);
  const [flipEntries, setFlipEntries] = createSignal<ReadonlyArray<FlipAnimateEntry<string | GapKey>>>([]);

  const dnd = createDnd({
    items,
    getKey: (item) => item.id,
    getContainerRect: () => Rect.fromElement(containerRef()),
    containerKey: 'list',
    duration: animDuration,
    animEnabled,
    onSelectionChange: (keys) => {
      if (keys.length > 0) logger.addLog(`☑ SELECT  [${keys.join(', ')}]`);
    },
    onDragStart: (keys, pos) => {
      logger.addLog(`▶ DRAG  [${keys.join(', ')}] at (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`);
    },
    onFlipAnimate: setFlipEntries,
    onDrop: (keys, place) => {
      setItems((prev) => reorderItems(prev, keys, place, (item) => item.id));
      logger.addLog(`■ DROP  [${keys.join(', ')}] → ${Place.label(place)}`);
    },
    onCancel: () => logger.addLog('✕ CANCEL')
  });

  createBodyCursor(() => (dnd.isDragging() ? 'grabbing' : null));

  return (
    <div class="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 class="mb-1 text-sm font-semibold text-neutral-300">Sortable List — Drag Overlay</h2>
        <p class="mb-4 text-xs text-neutral-500">
          Items pop out as a floating overlay when dragged. A gap opens at the drop position and items animate around
          it. Uses <code class="rounded bg-white/10 px-1">createDnd</code> directly to compose{' '}
          <code class="rounded bg-white/10 px-1">createSortable</code> +{' '}
          <code class="rounded bg-white/10 px-1">createDisplayList</code> +{' '}
          <code class="rounded bg-white/10 px-1">createSelection</code> +{' '}
          <code class="rounded bg-white/10 px-1">createDragSensor</code> +{' '}
          <code class="rounded bg-white/10 px-1">createDragOverlay</code> +{' '}
          <code class="rounded bg-white/10 px-1">createFlip</code>.
        </p>
      </div>

      <AnimationControls
        enabled={animEnabled()}
        setEnabled={setAnimEnabled}
        duration={animDuration()}
        setDuration={setAnimDuration}
        isAnimating={dnd.isAnimating()}
        debugEnabled={debugEnabled()}
        setDebugEnabled={setDebugEnabled}
      />

      <SelectionInfo selected={dnd.selection.selected()} items={dnd.items()} onClear={() => dnd.selection.clear()} />

      <div
        ref={setContainerRef}
        role="listbox"
        aria-label="Sortable list"
        class="relative flex flex-col gap-2 rounded-xl border border-white/10 bg-white/2 p-3"
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
            return <ListItem {...props} />;
          }}
        </For>
      </div>

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
          <ListOverlayItem items={dnd.items()} draggedIds={dnd.drag.draggedIds()} />
        </div>
      </Show>

      <FlipDebugOverlay
        entries={flipEntries()}
        elements={dnd.itemRefs as Map<string, HTMLElement>}
        isAnimating={dnd.isAnimating()}
        enabled={debugEnabled()}
        isDragging={dnd.isDragging()}
      />

      <OrderDisplay items={dnd.items()} />
      {/*  State readout */}
      <div class="grid grid-cols-4 gap-3">
        <StateCard
          label="isDragging"
          value={dnd.drag.sensor.isDragging() ? 'true' : 'false'}
          active={dnd.drag.sensor.isDragging()}
        />
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
