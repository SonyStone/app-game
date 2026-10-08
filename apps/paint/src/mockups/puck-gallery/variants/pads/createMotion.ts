import { createSignal } from 'solid-js';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { navigationDrag, type NavigationKind } from '../../kit/navigationDrag';

/** What a held pad does while the pointer moves: navigate the view, or scrub the history. */
export type MotionKind = NavigationKind | 'history';

/**
 * The continuous presses of the pad grid: Pan, Zoom and Rotate navigate the view while their pad (or key) is held
 * and the pointer moves; Undo and Redo scrub the history sideways, one stroke per 22 px (left goes back). Zoom and
 * Rotate turn around `pivot`, the point the gear was opened at, where the pen was working; Rotate waits until the
 * pointer is 32 px away from it, where the angle is steady.
 *
 * The signals are for display only (which pad is held, whether to hide the rest of the gear, the scrub count); the
 * logic keeps plain state, so a `move` right after `begin` in the same event sees the new motion.
 */
export function createMotion(studio: Studio, pivot: () => Point) {
  const navigation = navigationDrag(studio);
  const [kind, setKind] = createSignal<MotionKind>();
  const [moved, setMoved] = createSignal(false);
  const [scrubbed, setScrubbed] = createSignal(0);
  let current: MotionKind | undefined;
  let rotateFrom: Point | undefined;
  let scrub: { x: number; min: number; max: number; applied: number } | undefined;

  return {
    /** The motion in progress, for lighting its pad. */
    kind,
    /** Whether the rest of the gear should hide: a motion has moved past a tap. */
    hiding: () => kind() !== undefined && moved(),
    /** Strokes the history scrub has moved, negative for undone ones. */
    scrubbed,
    /** The point Zoom and Rotate turn around. */
    pivot,
    /** Starts a motion at the pointer's position. */
    begin(next: MotionKind, at: Point) {
      navigation.end();
      current = next;
      rotateFrom = undefined;
      setKind(next);
      setMoved(false);
      if (next === 'history') {
        const { done, undone } = studio.history();
        scrub = { x: at.x, min: -done, max: undone, applied: 0 };
        setScrubbed(0);
        return;
      }

      startNavigation(next, at);
    },
    /**
     * Follows the pointer. `far` reports that the press has moved past a tap, which hides the rest of the gear;
     * `shift` snaps rotation to 15° steps.
     */
    move(at: Point, shift: boolean, far: boolean) {
      if (!current) {
        return;
      }

      if (far) {
        setMoved(true);
      }

      if (current === 'history') {
        scrubTo(at);
        return;
      }

      if (rotateFrom) {
        startNavigation('rotate', at);
        return;
      }

      navigation.move(at, shift);
    },
    end() {
      navigation.end();
      current = undefined;
      rotateFrom = undefined;
      scrub = undefined;
      setKind(undefined);
      setMoved(false);
      setScrubbed(0);
    }
  };

  function startNavigation(next: NavigationKind, at: Point) {
    const center = pivot();
    if (next === 'rotate' && Math.hypot(at.x - center.x, at.y - center.y) < rotateRadius) {
      rotateFrom = at;
      return;
    }

    rotateFrom = undefined;
    navigation.start(next, at, next === 'pan' ? undefined : center);
  }

  function scrubTo(at: Point) {
    if (!scrub) {
      return;
    }

    const target = Math.min(scrub.max, Math.max(scrub.min, Math.round((at.x - scrub.x) / scrubPixels)));
    while (scrub.applied > target) {
      studio.undo();
      scrub.applied -= 1;
    }

    while (scrub.applied < target) {
      studio.redo();
      scrub.applied += 1;
    }

    setScrubbed(target);
  }
}

/** The motions of a pad grid, as `createMotion` returns them. */
export type Motion = ReturnType<typeof createMotion>;

/** Distance from the pivot at which rotating starts. */
const rotateRadius = 32;
/** Sideways pixels per stroke when scrubbing the history. */
const scrubPixels = 22;
