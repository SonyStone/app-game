import { pressHandlers } from '../../kit/pressHandlers';

/**
 * Press handlers for a button: `run` fires when the press lifts without having moved more than 12 px, so sliding
 * off a key cancels it, as on hardware. Works alike for the pen, a finger and the mouse, and never moves focus.
 */
export function tapHandlers(run: (event: PointerEvent) => void) {
  return pressHandlers({ tap: (_press, event) => run(event), end: () => {}, tapDistance: 12 });
}
