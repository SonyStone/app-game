import { pressHandlers, type Press } from '../../kit/pressHandlers';

/**
 * Press handlers for a button, the same for the pen, a finger and the mouse: `action` runs when the press lifts still
 * over the element (with 12 px to spare for a trembling pen), so a press that slides off cancels, as buttons do.
 * `onStart` and `onFinish` bracket the press, for captions shown while a finger holds a button.
 */
export function tapPress(
  action: (press: Press) => void,
  options: { onStart?: (press: Press) => void; onFinish?: () => void } = {}
) {
  return pressHandlers({
    start: (press) => {
      options.onStart?.(press);
    },
    end: (press) => {
      options.onFinish?.();
      if (isOver(press, 12)) {
        action(press);
      }
    },
    cancel: () => options.onFinish?.()
  });
}

/** Whether the press's point lies within its target's box grown by `slack`, both on the target's screen. */
function isOver({ point, target, screen }: Press, slack: number) {
  const box = screen.rect(target);
  return (
    point.x >= box.left - slack &&
    point.x <= box.right + slack &&
    point.y >= box.top - slack &&
    point.y <= box.bottom + slack
  );
}

/**
 * Marks a custom control (a div or an SVG shape) as a tap target for the browser's touch adjustment. Chrome moves a
 * finger's press to a nearby element that "responds to clicks"; Solid delegates handlers to the root, so only real
 * buttons count, and a press on the hue ring next to a color dot would land on the dot. Use as `ref={tappable}`.
 */
export function tappable(element: Element) {
  element.addEventListener('click', ignore);
}

function ignore() {}
