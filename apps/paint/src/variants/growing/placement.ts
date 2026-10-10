/** A rectangle in client CSS pixels. */
export type Rect = { left: number; top: number; width: number; height: number };

/**
 * Where a card goes beside the dock: on the canvas side of `anchor` (to its left when the dock is on the right, and
 * the reverse), its top level with the anchor's top so that it reads as coming out of that control, moved up as far
 * as needed to stay inside `view`, and never above `margin`. A card wider than the room on the canvas side still
 * starts at the margin rather than covering the dock.
 */
export function placeBesideDock(
  anchor: Rect,
  card: { width: number; height: number },
  dockSide: 'left' | 'right',
  view: { width: number; height: number },
  gap = 8,
  margin = 8
): { left: number; top: number } {
  const left =
    dockSide === 'right'
      ? Math.max(margin, anchor.left - gap - card.width)
      : Math.min(view.width - margin - card.width, anchor.left + anchor.width + gap);
  const top = Math.max(margin, Math.min(anchor.top, view.height - margin - card.height));
  return { left, top };
}

/** Whether `point` lies within `rect` grown by `margin` on every side. */
export function near(point: { x: number; y: number }, rect: Rect, margin: number) {
  return (
    point.x >= rect.left - margin &&
    point.x <= rect.left + rect.width + margin &&
    point.y >= rect.top - margin &&
    point.y <= rect.top + rect.height + margin
  );
}
