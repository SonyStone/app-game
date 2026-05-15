import { createDragSensor, createFlip, createSortable, Place, Rect, reorderItems } from 'solid-dnd';
import { batch, createMemo, createSignal, For, Show, type JSX } from 'solid-js';

// ============================================================================
// MARK: SortableFixture — full drag-to-reorder with FLIP in a real browser
// ============================================================================

type Item = { id: string; label: string; color: string };

const INITIAL_ITEMS: Item[] = [
  { id: 's1', label: 'Red', color: '#e74c3c' },
  { id: 's2', label: 'Blue', color: '#3498db' },
  { id: 's3', label: 'Green', color: '#2ecc71' },
  { id: 's4', label: 'Orange', color: '#f39c12' },
  { id: 's5', label: 'Purple', color: '#9b59b6' }
];

export default function SortableFixture(): JSX.Element {
  const [items, setItems] = createSignal<Item[]>(INITIAL_ITEMS);
  const itemKeys = createMemo(() => items().map((i) => i.id));

  const [draggedIds, setDraggedIds] = createSignal<string[]>([]);
  const [dropPlace, setDropPlace] = createSignal<Place.Place<string> | undefined>(undefined, {
    equals: Place.equals
  });
  let pendingDragId: string | null = null;

  const itemRefs = new Map<string, HTMLElement>();
  let containerRef: HTMLElement | undefined;

  // ── Sortable ─────────────────────────────────────────────────────────
  const sortable = createSortable<string>({
    containerKey: 'list',
    items: itemKeys,
    draggedKeys: () => draggedIds(),
    getRect: (key) => Rect.fromElement(itemRefs.get(key)),
    getContainerRect: () => Rect.fromElement(containerRef)
  });

  // ── FLIP ─────────────────────────────────────────────────────────────
  const flip = createFlip({
    elements: itemRefs,
    duration: 300,
    easing: 'ease-out'
  });

  // ── Drag sensor ──────────────────────────────────────────────────────
  const sensor = createDragSensor({
    threshold: 5,
    onClick: () => {
      pendingDragId = null;
    },
    onDragStart: (e) => {
      const id = pendingDragId;
      batch(() => {
        setDraggedIds(id ? [id] : []);
        setDropPlace(sortable.getInsertionPoint(e.position));
      });
    },
    onDragMove: (e) => {
      setDropPlace(sortable.getInsertionPoint(e.position));
    },
    onDragEnd: () => {
      const place = dropPlace();
      const ids = draggedIds();
      if (place && ids.length > 0) {
        flip.animate(() => {
          setItems((prev) => reorderItems(prev, ids, place, (i) => i.id));
        });
      }
      pendingDragId = null;
      setDraggedIds([]);
      setDropPlace(undefined);
    },
    onDragCancel: () => {
      pendingDragId = null;
      setDraggedIds([]);
      setDropPlace(undefined);
    }
  });

  function handlePointerDown(id: string, ev: PointerEvent) {
    pendingDragId = id;
    sensor.onPointerDown(ev);
  }

  function indicatorY(): number | undefined {
    if (!sensor.isDragging()) return undefined;
    return sortable.getIndicatorOffset(dropPlace());
  }

  return (
    <div data-fixture="sortable">
      {/* State readouts */}
      <div style={{ display: 'flex', gap: '16px', 'margin-bottom': '12px', 'font-size': '13px' }}>
        <div>
          isDragging: <span data-testid="is-dragging">{sensor.isDragging() ? 'true' : 'false'}</span>
        </div>
        <div>
          dropPlace: <span data-testid="drop-place">{Place.label(dropPlace())}</span>
        </div>
        <div>
          isAnimating: <span data-testid="is-animating">{flip.isAnimating() ? 'true' : 'false'}</span>
        </div>
      </div>

      {/* Sortable list */}
      <div
        ref={containerRef}
        data-testid="sortable-list"
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
        <For each={items()}>
          {(item) => (
            <div
              data-item-id={item.id}
              ref={(el) => itemRefs.set(item.id, el)}
              onPointerDown={(ev) => handlePointerDown(item.id, ev)}
              style={{
                padding: '12px 16px',
                background: draggedIds().includes(item.id) && sensor.isDragging() ? '#555' : item.color,
                opacity: draggedIds().includes(item.id) && sensor.isDragging() ? 0.4 : 1,
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
          )}
        </For>

        {/* Drop indicator */}
        <Show when={indicatorY() !== undefined}>
          <div
            data-testid="drop-indicator"
            style={{
              position: 'absolute',
              left: '0',
              right: '0',
              top: `${indicatorY()}px`,
              height: '2px',
              background: '#60a5fa',
              'pointer-events': 'none'
            }}
          />
        </Show>
      </div>

      <div data-testid="item-order" style={{ 'margin-top': '8px', 'font-size': '12px' }}>
        {items()
          .map((i) => i.id)
          .join(',')}
      </div>
    </div>
  );
}
