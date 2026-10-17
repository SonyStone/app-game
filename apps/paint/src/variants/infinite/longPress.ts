/**
 * Long-press handlers for one element: a press held still for {@link longPressMs} calls `onLongPress` with the pointer
 * in client CSS pixels and the press's event, and the click that the lift would make is then swallowed:
 * `consumeClick` in the element's click handler returns `true` once for it. Moving further than {@link slop} first, or
 * lifting, cancels the long press. Spread `handlers` on the element. Holds no reactive state.
 */
export function longPress(onLongPress: (point: { x: number; y: number }, event: PointerEvent) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | undefined;
  let fired = false;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    start = undefined;
  };

  return {
    handlers: {
      onPointerDown(event: PointerEvent) {
        if (event.pointerType === 'mouse' && event.button !== 0) {
          return;
        }

        cancel();
        fired = false;
        start = { x: event.clientX, y: event.clientY };
        timer = setTimeout(() => {
          timer = undefined;
          fired = true;
          onLongPress(start!, event);
        }, longPressMs);
      },
      onPointerMove(event: PointerEvent) {
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > slop) {
          cancel();
        }
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onContextMenu(event: Event) {
        // Android opens the context menu on a long press; the press is ours.
        event.preventDefault();
      }
    },
    /** The click after a long press is not a tap: returns `true` once for it. */
    consumeClick() {
      const consumed = fired;
      fired = false;
      return consumed;
    }
  };
}

/** How long, in milliseconds, a press must stay still to be a long press. */
export const longPressMs = 450;

/** CSS pixels a long press may wander before it counts as a move. */
const slop = 8;
