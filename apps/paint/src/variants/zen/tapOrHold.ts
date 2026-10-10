import { pressHandlers } from '../../shared/ui/pressHandlers';

/**
 * Press handlers for a button with a second meaning on a long press: `hold` runs once the press has stayed still for
 * `holdMs`, and the lift then does nothing; a shorter press runs `tap`. A press that moves away does neither. The
 * same for the pen, a finger and the mouse. Create once per element and spread on it.
 */
export function tapOrHold(options: { tap: () => void; hold?: () => void; holdMs?: number }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let held = false;
  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  return pressHandlers({
    start() {
      held = false;
      const hold = options.hold;
      if (hold) {
        timer = setTimeout(() => {
          held = true;
          hold();
        }, options.holdMs ?? 450);
      }
    },
    move(press) {
      if (press.moved) {
        stop();
      }
    },
    tap() {
      stop();
      if (!held) {
        options.tap();
      }
    },
    end: stop,
    cancel: stop
  });
}
