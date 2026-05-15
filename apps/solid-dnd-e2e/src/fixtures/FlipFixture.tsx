import { createFlip, reorderItems } from 'solid-dnd';
import { createSignal, For, type JSX } from 'solid-js';

// ============================================================================
// MARK: FlipFixture — tests FLIP animation in a real browser
// ============================================================================

type Item = { id: string; label: string; color: string };

const INITIAL_ITEMS: Item[] = [
  { id: 'a', label: 'Item A', color: '#e74c3c' },
  { id: 'b', label: 'Item B', color: '#3498db' },
  { id: 'c', label: 'Item C', color: '#2ecc71' },
  { id: 'd', label: 'Item D', color: '#f39c12' },
  { id: 'e', label: 'Item E', color: '#9b59b6' }
];

export default function FlipFixture(): JSX.Element {
  const [items, setItems] = createSignal<Item[]>(INITIAL_ITEMS);
  const itemRefs = new Map<string, HTMLElement>();

  const flip = createFlip({
    elements: itemRefs,
    duration: 300,
    easing: 'ease-out'
  });

  // ── Button-triggered reorder: move first item to end ────────────────
  function moveFirstToEnd() {
    flip.animate(() => {
      setItems((prev) => {
        const [first, ...rest] = prev;
        return [...rest, first];
      });
    });
  }

  // ── Button-triggered reorder: reverse the list ──────────────────────
  function reverseItems() {
    flip.animate(() => {
      setItems((prev) => [...prev].reverse());
    });
  }

  // ── Button-triggered reorder: swap first two ────────────────────────
  function swapFirstTwo() {
    flip.animate(() => {
      setItems((prev) => {
        if (prev.length < 2) return prev;
        // Swap the first two using reorderItems: move item[0] before item[2] (or append if only 2)
        const place =
          prev.length > 2 ? { parent: 'list' as const, before: prev[2].id } : { parent: 'list' as const, before: null };
        return reorderItems(prev, [prev[0].id], place, (i) => i.id);
      });
    });
  }

  // ── Reset to initial order ──────────────────────────────────────────
  function reset() {
    setItems(INITIAL_ITEMS);
  }

  return (
    <div data-fixture="flip">
      <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '12px' }}>
        <button data-action="move-first-to-end" onClick={moveFirstToEnd}>
          Move first → end
        </button>
        <button data-action="reverse" onClick={reverseItems}>
          Reverse
        </button>
        <button data-action="swap-first-two" onClick={swapFirstTwo}>
          Swap first two
        </button>
        <button data-action="reset" onClick={reset}>
          Reset
        </button>
      </div>

      <div data-testid="is-animating">{flip.isAnimating() ? 'true' : 'false'}</div>

      <div data-testid="item-list" style={{ display: 'flex', 'flex-direction': 'column', gap: '4px', width: '300px' }}>
        <For each={items()}>
          {(item) => (
            <div
              data-item-id={item.id}
              ref={(el) => itemRefs.set(item.id, el)}
              style={{
                padding: '12px 16px',
                background: item.color,
                'border-radius': '6px',
                color: 'white',
                'font-weight': 'bold',
                'user-select': 'none'
              }}
            >
              {item.label}
            </div>
          )}
        </For>
      </div>

      <div data-testid="item-order" style={{ 'margin-top': '8px', 'font-size': '12px' }}>
        {items()
          .map((i) => i.id)
          .join(',')}
      </div>
    </div>
  );
}
