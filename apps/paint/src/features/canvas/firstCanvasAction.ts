import type { CanvasInput } from './PaintCanvas';

type CanvasAction = NonNullable<CanvasInput['canvasAction']>;

/**
 * Combines canvas contact actions: a contact runs the first action enabled for it, in priority order. `attachInput`
 * asks `enabled` at contact and then runs the action at once, so the choice is kept between the two calls; the
 * contact's drag and release go to the same action.
 */
export function firstCanvasAction(...actions: CanvasAction[]): CanvasAction {
  let chosen: CanvasAction | undefined;
  /** The action of the contact in progress. */
  let active: CanvasAction | undefined;
  return {
    enabled(event) {
      chosen = actions.find((action) => action.enabled(event));
      return chosen !== undefined;
    },
    run(point) {
      active = chosen;
      chosen = undefined;
      active?.run(point);
    },
    move(point) {
      active?.move?.(point);
    },
    end(cancelled) {
      const ended = active;
      active = undefined;
      ended?.end?.(cancelled);
    }
  };
}
