import type { JSX } from '@solidjs/web';
/**
 * MARK: SelectionBox
 *
 * Drag-select rectangle overlay for batch-selecting brushes.
 * Draws a translucent box on pointer drag and computes which
 * brush card elements intersect with it.
 */

import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, Show } from 'solid-js';

export type SelectionBoxProps = {
  containerRef: HTMLElement;
  allBrushIds: string[];
  onSelect: (ids: Set<string>) => void;
};

export function SelectionBox(props: SelectionBoxProps): JSX.Element {
  const [active, setActive] = createSignal(false);
  const [startX, setStartX] = createSignal(0);
  const [startY, setStartY] = createSignal(0);
  const [currentX, setCurrentX] = createSignal(0);
  const [currentY, setCurrentY] = createSignal(0);

  const rect = () => {
    const x1 = Math.min(startX(), currentX());
    const y1 = Math.min(startY(), currentY());
    const x2 = Math.max(startX(), currentX());
    const y2 = Math.max(startY(), currentY());
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  };

  createEventListener(
    () => props.containerRef,
    'pointerdown',
    (e: PointerEvent) => {
      // Only start selection box on primary button, no modifier, and on empty space
      if (e.button !== 0) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;

      // Don't start if clicking on a card, button, input, etc.
      const target = e.target as HTMLElement;
      if (target.closest('button, input, select, a, [draggable="true"]')) return;

      const containerRect = props.containerRef.getBoundingClientRect();
      const x = e.clientX - containerRect.left + props.containerRef.scrollLeft;
      const y = e.clientY - containerRect.top + props.containerRef.scrollTop;

      setStartX(x);
      setStartY(y);
      setCurrentX(x);
      setCurrentY(y);
      setActive(true);

      props.containerRef.setPointerCapture(e.pointerId);
    }
  );

  createEventListener(
    () => props.containerRef,
    'pointermove',
    (e: PointerEvent) => {
      if (!active()) return;

      const containerRect = props.containerRef.getBoundingClientRect();
      const x = e.clientX - containerRect.left + props.containerRef.scrollLeft;
      const y = e.clientY - containerRect.top + props.containerRef.scrollTop;
      setCurrentX(x);
      setCurrentY(y);

      // Compute intersecting brush cards
      const selectionRect = rect();
      const containerLeft = containerRect.left - props.containerRef.scrollLeft;
      const containerTop = containerRect.top - props.containerRef.scrollTop;

      const ids = new Set<string>();
      const cards = props.containerRef.querySelectorAll('[data-brush-id]');
      cards.forEach((card) => {
        const cardRect = (card as HTMLElement).getBoundingClientRect();
        const relCard = {
          left: cardRect.left - containerLeft,
          top: cardRect.top - containerTop,
          right: cardRect.right - containerLeft,
          bottom: cardRect.bottom - containerTop
        };

        // AABB intersection
        if (
          relCard.left < selectionRect.x + selectionRect.width &&
          relCard.right > selectionRect.x &&
          relCard.top < selectionRect.y + selectionRect.height &&
          relCard.bottom > selectionRect.y
        ) {
          const id = (card as HTMLElement).dataset.brushId;
          if (id) ids.add(id);
        }
      });

      props.onSelect(ids);
    }
  );

  createEventListener(
    () => props.containerRef,
    'pointerup',
    () => {
      setActive(false);
    }
  );

  createEventListener(
    () => props.containerRef,
    'pointercancel',
    () => {
      setActive(false);
    }
  );

  return (
    <Show when={active() && rect().width > 4 && rect().height > 4}>
      <div
        class="border-ps-accent bg-ps-accent/10 pointer-events-none absolute z-30 border"
        style={{
          left: `${rect().x}px`,
          top: `${rect().y}px`,
          width: `${rect().width}px`,
          height: `${rect().height}px`
        }}
      />
    </Show>
  );
}
