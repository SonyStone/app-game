import { editable } from '@app-game/paint-core/input';
import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, untrack } from 'solid-js';
import type { PaintSession } from '../../features/session';
import type { Growth } from './createGrowth';
import { shortcutFeatures } from './growth';

/**
 * Counts what the user does with the session into `growth`, without taking part in it: strokes and erasing from
 * contacts on the canvas, zooms and pans from the camera, color changes from the brush color, selections from the
 * selection, and shortcuts pressed, which unlock their controls at once. Layer commands and taps on the active brush
 * are counted where the variant's controls run them. Must be created within a Solid owner, which removes the
 * listeners on disposal.
 *
 * Returns `skipTouches`, which keeps the fingers now on the canvas from counting as strokes, for a hold that picks a
 * color instead.
 */
export function createUsageWatch(session: PaintSession, growth: Growth) {
  const { camera, engine, tools, selection } = session;
  /** Contacts on the canvas that may become strokes, by pointer id. */
  const presses = new Map<number, { touch: boolean; camera: unknown; erase: boolean; gesture: boolean }>();

  createEventListener(
    session.stage,
    'pointerdown',
    (event) => {
      if (!(event.target instanceof HTMLCanvasElement) || event.altKey) {
        return;
      }

      const erase = event.button === 5 || (event.buttons & 32) !== 0;
      if (event.pointerType !== 'touch' && event.button !== 0 && !erase) {
        return;
      }

      // A second finger turns every finger on the canvas into a gesture: a pinch, a pan or a tap to undo.
      const touch = event.pointerType === 'touch';
      const fingers = [...presses.values()].filter((press) => press.touch);
      const gesture = touch && fingers.length > 0;
      if (gesture) {
        fingers.forEach((press) => (press.gesture = true));
      }

      presses.set(event.pointerId, { touch, camera: camera.current(), erase, gesture });
    },
    { capture: true }
  );
  createEventListener(window, 'pointerup', (event) => {
    const press = presses.get(event.pointerId);
    presses.delete(event.pointerId);
    // A contact that moved the view was navigation, and other tools than the brush and the eraser draw no strokes.
    if (!press || press.gesture || camera.current() !== press.camera) {
      return;
    }

    if (press.erase || tools.tool() === 'eraser') {
      growth.count('erases');
    } else if (tools.tool() === 'brush') {
      growth.count('strokes');
    }
  });
  createEventListener(window, 'pointercancel', (event) => presses.delete(event.pointerId));

  // Each burst of camera changes is one zoom, pan or turn; loading a drawing restores its camera, which is none.
  let lastNavigation = -Infinity;
  createEffect(
    () => ({ view: camera.camera(), ready: engine.ready(), restored: engine.restored()?.camera }),
    ({ view, ready, restored }, previous) => {
      if (!ready || view === restored || view === previous?.view) {
        return;
      }

      const now = performance.now();
      if (now - lastNavigation > burstGap) {
        growth.count('navigations');
      }

      lastNavigation = now;
    }
  );

  // A drag on the color disc changes the color many times; a burst of changes is one pick. The brush settings
  // restored at the start are not a pick.
  let colorsRestored = false;
  let lastPick = -Infinity;
  // The restored settings reach the brush at the flush after `loaded` resolves.
  void tools.loaded.then(() => setTimeout(() => (colorsRestored = true), 300));
  createEffect(
    () => tools.brush().color,
    (color, previous) => {
      // Other brush changes, such as another tool, run this with the same color.
      if (!colorsRestored || color === previous) {
        return;
      }

      const now = performance.now();
      if (now - lastPick > burstGap) {
        growth.count('colorPicks');
      }

      lastPick = now;
    }
  );

  let wasSelected = untrack(selection.selected);
  createEffect(selection.selected, (selected) => {
    if (selected && !wasSelected) {
      growth.count('selections');
    }

    wasSelected = selected;
  });

  createEventListener(window, 'keydown', (event) => {
    if ((event.target instanceof Element && event.target.closest('dialog[open]')) || editable(event.target)) {
      return;
    }

    const wanted = shortcutFeatures(event);
    if (wanted.length > 0) {
      growth.request(wanted);
    }
  });

  return {
    /** Keeps the fingers now on the canvas from counting as strokes. */
    skipTouches() {
      presses.forEach((press) => (press.gesture = true));
    }
  };
}

/** Milliseconds without a change after which the next change starts a new gesture or pick. */
const burstGap = 700;
