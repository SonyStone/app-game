import { createSignal } from 'solid-js';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { navigationDrag, type NavigationKind } from '../../kit/navigationDrag';

/**
 * Continuous view navigation for the QuickMenu's buttons, the opening flick and the held digit keys, with the kind in
 * progress as a signal so that the cluster can fade. Zoom and Rotate pivot on `pivot` (the QuickMenu's center), so
 * that the view turns and scales around the place the pen opened the menu. Must be created within a Solid owner.
 */
export function createGlassNavigation(studio: Studio, pivot: () => Point) {
  const drag = navigationDrag(studio);
  const [kind, setKind] = createSignal<NavigationKind>();

  return {
    /** The navigation in progress. */
    kind,
    start(next: NavigationKind, at: Point) {
      drag.start(next, at, next === 'pan' ? undefined : pivot());
      setKind(next);
    },
    move(at: Point, shift = false) {
      drag.move(at, shift);
    },
    end() {
      drag.end();
      setKind(undefined);
    }
  };
}

/** The navigation that the cluster's parts share. */
export type GlassNavigation = ReturnType<typeof createGlassNavigation>;
