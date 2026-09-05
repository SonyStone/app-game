import { createNavigationPuck } from '@app-game/navigation-puck/controller';
import type { ViewportMode } from '../../shared/viewportMode';
import type { InteractionViewport } from '../interaction/viewportPort';

/** Grease stores camera roll opposite to clockwise screen rotation; gesture deltas already use screen direction. */
export function createGreaseNavigation(params: {
  viewport: () => Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
  renderer: () => Pick<InteractionViewport, 'transformTouch' | 'orbit'> | undefined;
  mode: () => ViewportMode;
  roll: () => number;
}) {
  return createNavigationPuck({
    viewport: params.viewport,
    mode: params.mode,
    rotation: () => -params.roll(),
    transform: (gesture) => params.renderer()?.transformTouch(gesture),
    orbit: (dx, dy) => params.renderer()?.orbit(dx, dy)
  });
}
