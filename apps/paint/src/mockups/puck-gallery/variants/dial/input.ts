import { pressHandlers, type Press } from '../../kit/pressHandlers';

/**
 * Press handlers for a button that acts on a tap only: a press that slides away and lifts does nothing, so a finger
 * that lands on the wrong bead can slide off. Spread on the element: `<button {...tapHandlers(run)}>`.
 */
export function tapHandlers(action: (press: Press) => void) {
  return pressHandlers({ tap: action, end: () => {} });
}

/**
 * Turns wheel events into whole detents, positive for scrolling up or right. A mouse notch is one detent; a
 * trackpad's small deltas add up to one detent per 40 px. One stepper per element, as it keeps the remainder.
 */
export function makeWheelSteps() {
  let rest = 0;

  return (event: WheelEvent) => {
    const scale = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
    const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : -event.deltaY) * scale;
    if (Math.abs(delta) >= 50) {
      rest = 0;
      return Math.sign(delta);
    }

    rest += delta;
    const steps = Math.trunc(rest / 40);
    rest -= steps * 40;
    return steps;
  };
}
