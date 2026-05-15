import {
  createDisplayList,
  createDragController,
  createSortable,
  GAP_KEY,
  Rect,
  reorderItems,
  type DragController,
  type GapKey
} from 'solid-dnd';
import { createEffect, createMemo, createSignal, For, on, Show, type JSX } from 'solid-js';

// ============================================================================
// MARK: OverlayFixture — tests createDragController in a real browser
// ============================================================================

type Item = { id: string; label: string; color: string };

const INITIAL_ITEMS: Item[] = [
  { id: 'o1', label: 'Red', color: '#e74c3c' },
  { id: 'o2', label: 'Blue', color: '#3498db' },
  { id: 'o3', label: 'Green', color: '#2ecc71' },
  { id: 'o4', label: 'Orange', color: '#f39c12' },
  { id: 'o5', label: 'Purple', color: '#9b59b6' }
];

export default function OverlayFixture(): JSX.Element {
  const [items, setItems] = createSignal<Item[]>(INITIAL_ITEMS);
  const itemKeys = createMemo(() => items().map((i) => i.id));

  const itemRefs = new Map<string | GapKey, HTMLElement>();
  let containerRef: HTMLDivElement | undefined;

  // ── Sortable ─────────────────────────────────────────────────────────
  // Created first. draggedKeys is lazy — only called inside
  // getInsertionPoint, never during construction for list layout.
  const sortable = createSortable<string | GapKey>({
    containerKey: 'list',
    items: itemKeys,
    draggedKeys: () => drag.draggedIds(),
    getRect: (key) => Rect.fromElement(itemRefs.get(key)),
    getContainerRect: () => Rect.fromElement(containerRef)
  });

  // ── Overlay drag (sensor + overlay + flip orchestration) ─────────────
  // Created second. getInsertionPoint is lazy (only called during drag
  // events). displayKeys is omitted here because display list doesn't exist
  // yet — we wire up the FLIP effect manually below.
  const drag: DragController<string | GapKey> = createDragController<string | GapKey>({
    elements: itemRefs,
    getInsertionPoint: (pos) => sortable.getInsertionPoint(pos),

    onBeforeDragStart: (id) => {
      const ids = [id];
      sortable.snapshotRects(ids);
      return ids;
    },

    onDrop: (keys, place) => {
      setItems((prev) => reorderItems(prev, keys, place, (i) => i.id));
    },

    onReset: () => {
      sortable.clearSnapshot();
      itemRefs.delete(GAP_KEY);
    },

    duration: 300,
    easing: 'ease-out'
  });

  // ── Display list (live gap — removes dragged items, inserts gap) ──────
  // Created third. drag.draggedIds() and drag.dropPlace() are now safe
  // to call — drag is fully initialized.
  const display = createDisplayList<string | GapKey>({
    keys: itemKeys,
    draggedKeys: () => drag.draggedIds(),
    place: () => drag.dropPlace(),
    containerKey: 'list'
  });

  // ── FLIP on displayKeys change during drag ───────────────────────────
  // Wired manually because displayKeys couldn't be passed to
  // createDragController (display list didn't exist at that point).
  createEffect(
    on(
      () => display.displayKeys(),
      () => {
        if (drag.sensor.isDragging()) {
          drag.flip.playFromFirst();
        }
      },
      { defer: true }
    )
  );

  // ── Item lookup ─────────────────────────────────────────────────────
  const itemMap = createMemo(() => {
    const map = new Map<string | GapKey, Item>();
    for (const item of items()) map.set(item.id, item);
    return map;
  });

  return (
    <div data-fixture="overlay">
      {/* State readouts */}
      <div style={{ display: 'flex', gap: '16px', 'margin-bottom': '12px', 'font-size': '13px' }}>
        <div>
          isDragging: <span data-testid="is-dragging">{drag.sensor.isDragging() ? 'true' : 'false'}</span>
        </div>
        <div>
          overlayActive: <span data-testid="overlay-active">{drag.overlay.active() ? 'true' : 'false'}</span>
        </div>
        <div>
          overlayPos:{' '}
          <span data-testid="overlay-position">
            {drag.overlay.active()
              ? `${drag.overlay.position().x.toFixed(0)},${drag.overlay.position().y.toFixed(0)}`
              : 'none'}
          </span>
        </div>
        <div>
          overlaySize:{' '}
          <span data-testid="overlay-size">
            {drag.overlay.active() ? `${drag.overlay.size().x.toFixed(0)},${drag.overlay.size().y.toFixed(0)}` : 'none'}
          </span>
        </div>
        <div>
          isAnimating: <span data-testid="is-animating">{drag.flip.isAnimating() ? 'true' : 'false'}</span>
        </div>
      </div>

      {/* Sortable list with display list (items removed during drag, gap inserted) */}
      <div
        ref={containerRef}
        data-testid="overlay-list"
        style={{
          position: 'relative',
          display: 'flex',
          'flex-direction': 'column',
          gap: '4px',
          width: '300px',
          padding: '8px',
          border: '1px solid #444',
          'border-radius': '8px'
        }}
      >
        <For each={display.displayKeys()}>
          {(key) => {
            if (key === GAP_KEY) {
              return (
                <div
                  data-testid="gap-placeholder"
                  ref={(el) => itemRefs.set(GAP_KEY, el)}
                  style={{
                    height: `${drag.gapHeight()}px`,
                    border: '1px dashed #60a5fa',
                    'border-radius': '6px',
                    background: 'rgba(96, 165, 250, 0.1)'
                  }}
                />
              );
            }
            const item = itemMap().get(key);
            if (!item) return null;
            return (
              <div
                data-item-id={item.id}
                ref={(el) => itemRefs.set(item.id, el)}
                onPointerDown={(ev) => drag.onPointerDown(item.id, ev)}
                style={{
                  padding: '12px 16px',
                  background: item.color,
                  'border-radius': '6px',
                  color: 'white',
                  'font-weight': 'bold',
                  cursor: 'grab',
                  'user-select': 'none',
                  'touch-action': 'none'
                }}
              >
                {item.label}
              </div>
            );
          }}
        </For>
      </div>

      {/* Drag overlay — the floating ghost that follows the pointer */}
      <Show when={drag.overlay.active()}>
        <div
          data-testid="drag-overlay"
          style={{
            position: 'fixed',
            left: `${drag.overlay.position().x}px`,
            top: `${drag.overlay.position().y}px`,
            width: `${drag.overlay.size().x}px`,
            'z-index': 10000,
            'pointer-events': 'none'
          }}
        >
          {(() => {
            const id = drag.draggedIds()[0];
            const item = id ? itemMap().get(id) : undefined;
            return item ? (
              <div
                data-testid="overlay-content"
                style={{
                  padding: '12px 16px',
                  background: item.color,
                  'border-radius': '6px',
                  color: 'white',
                  'font-weight': 'bold',
                  'box-shadow': '0 8px 32px rgba(0,0,0,0.4)',
                  'user-select': 'none'
                }}
              >
                {item.label}
              </div>
            ) : null;
          })()}
        </div>
      </Show>

      <div data-testid="item-order" style={{ 'margin-top': '8px', 'font-size': '12px' }}>
        {items()
          .map((i) => i.id)
          .join(',')}
      </div>
    </div>
  );
}
