import { createBodyCursor } from '@solid-primitives/cursor';
import { createDnd, Place, reorderItems, type FlipAnimateEntry, type GapKey } from 'solid-dnd';
import { createSignal, For, Show, type JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import EventLog, { createEventLogger } from '../components/EventLog';
import { FlipDebugOverlay } from '../components/FlipDebugOverlay';
import { OrderDisplay } from '../components/OrderDisplay';
import { SelectionInfo } from '../components/SelectionInfo';
import { SortableItem } from '../components/SortableItem';
import { SortableOverlayItem } from '../components/SortableOverlayItem';
import { StateCard } from '../components/StateCard';
import { createDemoItems } from '../data';
import { makeUrlSearchParams } from '../utils/makeUrlSearchParams';

type Layout = 'vertical' | 'horizontal' | 'grid';

export default function SortableOverlayDemo(): JSX.Element {
  const logger = createEventLogger();

  const [options, setOptions] = makeUrlSearchParams(
    createStore({
      layout: 'vertical' as Layout,
      animEnabled: true,
      animDuration: 200,
      easing: 'linear',
      debugEnabled: false,
      columns: 4,
      itemCount: 8
    }),
    { push: true }
  );

  const isGrid = () => options.layout === 'grid';
  const isHorizontal = () => options.layout === 'horizontal';

  const [items, setItems] = createSignal(createDemoItems(options.itemCount));
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement | undefined>(undefined);
  const [flipEntries, setFlipEntries] = createSignal<ReadonlyArray<FlipAnimateEntry<string | GapKey>>>([]);

  const dnd = createDnd({
    items,
    getKey: (item) => item.id,
    getContainerElement: containerRef,
    containerKey: 'container',
    layout: () => options.layout,
    duration: () => options.animDuration,
    easing: () => options.easing,
    animEnabled: () => options.animEnabled,
    onDragStart: (keys, pos) => {
      logger.addLog(`▶ DRAG  [${keys.join(', ')}] at (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`);
    },
    onCancel: () => logger.addLog('✕ CANCEL'),
    onSelectionChange: (keys) => {
      if (keys.length > 0) {
        logger.addLog(`☑ SELECT  [${keys.join(', ')}]`);
      }
    },
    onFlipAnimate: setFlipEntries,
    onDrop: (keys, place) => {
      setItems((previous) => reorderItems(previous, keys, place, (item) => item.id));

      logger.addLog(`■ DROP  [${keys.join(', ')}] → ${Place.label(place)}`);
    }
  });

  createBodyCursor(() => (dnd.isDragging() ? 'grabbing' : null));

  function animateLayoutChange(fn: () => void): void {
    const container = containerRef();
    if (!options.animEnabled || !container) {
      fn();
      return;
    }

    dnd.drag.flip.animate(fn, { container });
  }

  return (
    <div class="flex flex-col gap-6" data-testid="sortable-overlay-demo">
      {/* Header */}
      <div>
        <h2 class="mb-1 text-sm font-semibold text-neutral-300">Sortable</h2>
        <p class="mb-4 text-xs text-neutral-500">
          Toggle between vertical list, horizontal list, and grid in the control bar. Items pop out as a floating
          overlay when dragged, a gap opens at the drop position, and layout is{' '}
          <strong class="text-neutral-300">auto-detected</strong> from the container's CSS. Uses{' '}
          <code class="rounded bg-white/10 px-1">createDnd</code> directly to compose{' '}
          <code class="rounded bg-white/10 px-1">createSortable</code> +{' '}
          <code class="rounded bg-white/10 px-1">createDisplayList</code> +{' '}
          <code class="rounded bg-white/10 px-1">createSelection</code> +{' '}
          <code class="rounded bg-white/10 px-1">createDragSensor</code> +{' '}
          <code class="rounded bg-white/10 px-1">createDragOverlay</code> +{' '}
          <code class="rounded bg-white/10 px-1">createFlip</code>.
        </p>
      </div>

      {/* Layout & animation controls */}
      <ControlBar
        options={options}
        setOptions={setOptions}
        isAnimating={dnd.isAnimating()}
        onLayoutChange={(layout) => {
          if (options.layout === layout) {
            return;
          }
          animateLayoutChange(() => setOptions('layout', layout));
        }}
        onColumnsChange={(columns) => {
          if (options.columns === columns) {
            return;
          }
          animateLayoutChange(() => setOptions('columns', columns));
        }}
        onItemCountChange={(count) => {
          if (options.itemCount === count) {
            return;
          }
          animateLayoutChange(() => {
            setOptions('itemCount', count);
            setItems(createDemoItems(count));
            dnd.selection.clear();
          });
        }}
      />

      <SelectionInfo
        selected={dnd.selectedItems()}
        onClear={dnd.selectedItems.clear}
        hint={
          isGrid()
            ? 'Click to select · Ctrl+click toggle · Shift+click rectangular range'
            : 'Click to select · Ctrl+click toggle · Shift+click range'
        }
      />

      {/* Sortable container — CSS drives auto-detection */}
      <div
        ref={setContainerRef}
        data-testid="sortable-overlay-list"
        role="listbox"
        aria-label={`Sortable ${options.layout}`}
        class={`relative rounded-xl border border-white/10 bg-white/2 p-3 ${
          isHorizontal() ? 'overflow-x-auto overflow-y-hidden' : 'overflow-hidden'
        }`}
        style={
          isGrid()
            ? { display: 'grid', 'grid-template-columns': `repeat(${options.columns}, 1fr)`, gap: '8px' }
            : isHorizontal()
              ? { display: 'flex', 'flex-direction': 'row', gap: '8px', 'align-items': 'stretch' }
              : { display: 'flex', 'flex-direction': 'column', gap: '8px' }
        }
      >
        <For each={dnd.displayItems()}>
          {(props) =>
            props.gap ? (
              <div
                ref={props.ref}
                data-testid="sortable-overlay-gap"
                class="rounded-lg border border-dashed border-blue-500/30 bg-blue-500/5"
                style={
                  isHorizontal()
                    ? { width: `${props.width}px`, 'min-width': `${props.width}px` }
                    : { height: `${props.height}px` }
                }
              />
            ) : (
              <SortableItem
                {...props}
                class={isHorizontal() ? 'w-40 min-w-40 shrink-0' : undefined}
                itemId={props.key}
                testId="sortable-overlay-item"
              />
            )
          }
        </For>
      </div>

      {/* Drag overlay */}
      <Show when={dnd.drag.overlay()}>
        {(overlay) => (
          <div
            data-testid="sortable-overlay-drag-overlay"
            class="pointer-events-none fixed z-10000"
            style={{
              left: `${overlay().x}px`,
              top: `${overlay().y}px`,
              width: `${overlay().width}px`,
              height: `${overlay().height}px`
            }}
          >
            <SortableOverlayItem draggedItems={dnd.drag.draggedItems()} />
          </div>
        )}
      </Show>

      <FlipDebugOverlay
        entries={flipEntries()}
        getElement={dnd.getElement}
        isAnimating={dnd.isAnimating()}
        enabled={options.debugEnabled}
        isDragging={dnd.isDragging()}
        debugContext={(() =>
          dnd.isDragging()
            ? {
                dragging: dnd.drag.draggedItems(),
                place: Place.label(dnd.drag.dropPlace()),
                pointer: dnd.drag.sensor.position(),
                layout: dnd.detectedLayout().mode,
                columns: dnd.detectedColumns(),
                items: items(),
                displayKeys: dnd.display.displayKeys()
              }
            : undefined)()}
      />

      <OrderDisplay items={items()} columns={dnd.detectedColumns()} />

      {/* State readout */}
      <div class="grid grid-cols-4 gap-3">
        <StateCard
          label="isDragging"
          value={dnd.isDragging() ? 'true' : 'false'}
          active={dnd.isDragging()}
          testId="sortable-overlay-is-dragging"
        />
        <StateCard
          label="dragging"
          value={
            dnd.isDragging()
              ? dnd.drag
                  .draggedItems()
                  .map((item) => item.label)
                  .join(', ')
              : 'none'
          }
          active={dnd.isDragging()}
          testId="sortable-overlay-dragging"
        />
        <StateCard
          label="dropPlace"
          value={Place.label(dnd.drag.dropPlace())}
          active={dnd.drag.dropPlace() !== undefined}
          testId="sortable-overlay-drop-place"
        />
        <StateCard
          label="selected"
          value={dnd.selection.selected().length > 0 ? `${dnd.selection.selected().length} items` : 'none'}
          active={dnd.selection.selected().length > 0}
          testId="sortable-overlay-selected"
        />
      </div>

      <EventLog logger={logger} />
    </div>
  );
}

function ControlBar(props: {
  options: {
    layout: Layout;
    animEnabled: boolean;
    animDuration: number;
    easing: string;
    debugEnabled: boolean;
    columns: number;
    itemCount: number;
  };
  setOptions: (...args: readonly unknown[]) => void;
  isAnimating: boolean;
  onLayoutChange: (layout: Layout) => void;
  onColumnsChange: (columns: number) => void;
  onItemCountChange: (count: number) => void;
}): JSX.Element {
  const set = props.setOptions as (key: string, value: unknown) => void;

  return (
    <div class="flex flex-col items-start gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <div class="flex flex-wrap items-center gap-4">
        {/* Layout toggle */}
        <div class="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 p-0.5">
          <ToggleButton active={props.options.layout === 'vertical'} onClick={() => props.onLayoutChange('vertical')}>
            Vertical
          </ToggleButton>
          <ToggleButton
            active={props.options.layout === 'horizontal'}
            onClick={() => props.onLayoutChange('horizontal')}
          >
            Horizontal
          </ToggleButton>
          <ToggleButton active={props.options.layout === 'grid'} onClick={() => props.onLayoutChange('grid')}>
            Grid
          </ToggleButton>
        </div>

        {/* Columns (grid only) */}
        <Show when={props.options.layout === 'grid'}>
          <label class="flex items-center gap-2 text-xs text-neutral-400">
            Columns
            <input
              type="range"
              min="2"
              max="6"
              step="1"
              value={props.options.columns}
              onInput={(e) => props.onColumnsChange(Number(e.currentTarget.value))}
              class="h-1 w-20 cursor-pointer accent-blue-500"
            />
            <span class="w-4 font-mono text-neutral-300">{props.options.columns}</span>
          </label>
        </Show>

        {/* Item count */}
        <label class="flex items-center gap-2 text-xs text-neutral-400">
          Items
          <input
            type="range"
            min="2"
            max="24"
            step="1"
            value={props.options.itemCount}
            onInput={(e) => props.onItemCountChange(Number(e.currentTarget.value))}
            class="h-1 w-20 cursor-pointer accent-blue-500"
          />
          <span class="w-4 font-mono text-neutral-300">{props.options.itemCount}</span>
        </label>
      </div>

      <div class="flex items-center gap-6">
        {/* Animation toggle */}
        <label class="flex cursor-pointer items-center gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={props.options.animEnabled}
            onChange={(e) => set('animEnabled', e.currentTarget.checked)}
            class="accent-blue-500"
          />
          FLIP animation
        </label>

        {/* Animating indicator */}
        <Show when={props.isAnimating}>
          <span class="animate-pulse text-xs text-blue-400">● animating</span>
        </Show>
      </div>

      <div class="flex items-center gap-6">
        {/* Duration */}
        <label class="flex items-center gap-2 text-xs text-neutral-400">
          Duration
          <input
            type="range"
            min="50"
            max="800"
            step="10"
            value={props.options.animDuration}
            onInput={(e) => set('animDuration', Number(e.currentTarget.value))}
            class="h-1 w-24 cursor-pointer accent-blue-500"
            disabled={!props.options.animEnabled}
          />
          <span class="w-12 font-mono text-neutral-300">{props.options.animDuration}ms</span>
        </label>

        {/* Easing */}
        <label class="flex items-center gap-2 text-xs text-neutral-400">
          Easing
          <select
            value={props.options.easing}
            onChange={(e) => set('easing', e.currentTarget.value)}
            class="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-neutral-300 outline-none"
          >
            <For
              each={[
                'linear',
                'ease',
                'ease-in',
                'ease-out',
                'ease-in-out',
                'cubic-bezier(0.34, 1.56, 0.64, 1)',
                'cubic-bezier(0.22, 1, 0.36, 1)',
                'cubic-bezier(0.65, 0, 0.35, 1)',
                'steps(4, end)',
                'steps(1, jump-both)'
              ]}
            >
              {(easing) => (
                <option class="bg-slate-800" value={easing}>
                  {easing}
                </option>
              )}
            </For>
          </select>
        </label>
      </div>

      {/* Debug toggle */}
      <label class="flex cursor-pointer items-center gap-2 text-xs text-neutral-400">
        <input
          type="checkbox"
          checked={props.options.debugEnabled}
          onChange={(e) => set('debugEnabled', e.currentTarget.checked)}
          class="accent-yellow-500"
        />
        FLIP debug
      </label>
    </div>
  );
}

function ToggleButton(props: { active: boolean; onClick: () => void; children: JSX.Element }): JSX.Element {
  return (
    <button
      class={`rounded px-3 py-1 text-xs font-medium transition-colors ${
        props.active ? 'bg-blue-500/20 text-blue-300' : 'text-neutral-500 hover:text-neutral-300'
      }`}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
