/**
 * Where a popover opens under the button that opened it, as Procreate places them: centered under the button, moved
 * sideways to stay `margin` inside the view, with its arrow kept over the button's center (and clear of the card's
 * rounded corners). The card may grow down to `margin` above the view's bottom. All values in CSS pixels of the view.
 */
export function placePopover(
  anchor: { left: number; top: number; width: number; height: number },
  width: number,
  view: { width: number; height: number },
  margin = 8
) {
  const fitted = Math.min(width, view.width - margin * 2);
  const center = anchor.left + anchor.width / 2;
  const left = Math.min(view.width - margin - fitted, Math.max(margin, center - fitted / 2));
  const top = anchor.top + anchor.height + arrowSize;
  return {
    left,
    top,
    width: fitted,
    maxHeight: Math.max(0, view.height - top - margin),
    arrow: Math.min(fitted - arrowInset, Math.max(arrowInset, center - left))
  };
}

/** The height of the arrow between the button and the card. */
export const arrowSize = 9;

/** The closest the arrow's center may come to the card's sides, clear of the rounded corners. */
const arrowInset = 22;
