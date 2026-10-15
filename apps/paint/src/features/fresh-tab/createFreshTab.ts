import { createEventListener } from '@solid-primitives/event-listener';
import type { Accessor } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';

/**
 * Moves the drawing into a fresh tab once Chrome stops reporting pen hover in this one. Chrome on Android loses pen
 * hover in a tab after a window covered it around a pen contact (the file chooser, rotation, the notification shade),
 * and only a new tab gets it back; reloading or navigating does not.
 *
 * The loss counts as found after `lostContacts` reaches two, so a single quick touch from out of range does not count.
 * Then `offered` shows the move until the user moves or dismisses it in this tab. With `auto`, the move also happens
 * by itself at a pen lift while `idle`, as a lift lets the page open a tab: usually the lift of the touch that found
 * the loss. Chrome may still refuse, and `blocked` then asks for a tap. Listens on the window without stopping
 * anything. Must be created within a Solid owner.
 */
export function createFreshTab(options: {
  /** Pen touches in a row without hover after it hovered here; see `createPenHover`. */
  lostContacts: Accessor<number>;
  /** Whether the drawing can move now: the engine is ready, and no stroke or edit is in progress. */
  idle: () => boolean;
  /**
   * Hands the drawing to the next tab and resolves with whether this tab's engine saved and stopped; see the engine's
   * `moveOut`.
   */
  moveOut: () => Promise<boolean>;
}) {
  const [, setAuto, auto] = createImmediateSignal(readAuto());
  const [, setDismissed, dismissed] = createImmediateSignal(false);
  const [, setBlocked, blocked] = createImmediateSignal(false);
  const [, setMoving, moving] = createImmediateSignal(false);
  const lost = () => options.lostContacts() >= lostContactsToMove;

  // In the bubbling phase, after the canvas ended the stroke of this lift.
  createEventListener(window, 'pointerup', (event) => {
    if (event.pointerType === 'pen' && auto() && lost() && !moving() && options.idle()) {
      move();
    }
  });

  return {
    /** Whether to offer the move: hover is lost, and the move neither started nor was dismissed. */
    offered: () => lost() && !moving() && !dismissed(),
    /** Whether Chrome refused to open the tab, so that the move needs a tap. */
    blocked,
    /** Whether the move happens by itself at the pen's lift; remembered in `localStorage`. */
    auto,
    /** Changes and remembers `auto`. */
    setAuto(next: boolean) {
      setAuto(next);
      try {
        localStorage.setItem(autoKey, String(next));
      } catch {
        // Keep the choice for this session.
      }
    },
    move,
    /** Stops offering the move in this tab. */
    dismiss: () => setDismissed(true)
  };

  /**
   * Opens this page in a new tab and hands the drawing to it, then closes this tab once its engine has stopped. Call
   * it from a tap or a pen lift: Chrome opens tabs only on user input. Chrome closes only tabs that a page opened, so
   * a tab the user opened stays, showing that the drawing moved. Does nothing while a move is in progress.
   */
  function move() {
    if (moving()) {
      return;
    }

    const url = new URL(location.href);
    url.searchParams.set(arrivalParam, '');
    // With an opener, Chrome copies this tab's sessionStorage to the new one.
    const opened = window.open(url.href, '_blank');
    if (!opened) {
      setBlocked(true);
      return;
    }

    setBlocked(false);
    setMoving(true);
    void options.moveOut().then((stopped) => {
      if (stopped) {
        window.close();
      }
    });
  }
}

/**
 * How long the engine of this tab waits for the drawing's storage, if this tab was opened by a move: the old tab
 * writes its last changes meanwhile. `undefined` otherwise, for the engine's default. Removes the move's mark from
 * the address, so that a reload waits as usual. Read once, before creating the engine.
 */
export function arrivalStorageWaitMs(): number | undefined {
  const url = new URL(location.href);
  if (!url.searchParams.has(arrivalParam)) {
    return undefined;
  }

  url.searchParams.delete(arrivalParam);
  history.replaceState(history.state, '', url.href);
  return arrivalStorageWait;
}

function readAuto() {
  try {
    return localStorage.getItem(autoKey) === 'true';
  } catch {
    return false;
  }
}

/** Touches in a row without hover that count as hover lost, rather than as a quick touch from out of range. */
const lostContactsToMove = 2;

/** Marks the address of a tab opened by a move; see `arrivalStorageWaitMs`. */
const arrivalParam = 'paintMoved';

/** A moving tab may take this long to write the last changes of a large drawing. */
const arrivalStorageWait = 30_000;

const autoKey = 'paint.freshTab.auto';
