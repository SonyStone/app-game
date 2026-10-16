import type { PuckPicker } from '@app-game/navigation-puck';
import { worldToScreen } from '@app-game/paint-core/camera';
import { makeEventListener } from '@solid-primitives/event-listener';
import { createSignal, onCleanup } from 'solid-js';
import type { PaintSession } from '../../features/session';
import { createFlick } from './createFlick';
import type { ViewDrag } from './createViewDrag';
import type { Hand, Point } from './layout';
import type { SlotId } from './slots';

/**
 * Opens and closes the cluster. The cluster is open while the session's navigation puck is (`camera.navigation`), at
 * its center, so it opens exactly as the real puck does: holding Space (held), V, the right button or a pen's barrel
 * button pressed in contact (toggles that start a flick, see `picker`), and a hovering pen's side button (a toggle).
 * A finger's long press on the drawing opens it too (`touchGestures`), with the same flick.
 *
 * Closing, after the Tile Cluster spec:
 * - a toggled cluster closes after an action (`done`), on Escape, and on a press outside it: a pen or mouse press
 *   draws nothing, a finger closes it and pans at once, the right button or a side button closes it as a toggle;
 * - a held cluster stays through actions; a press outside draws through it (it hides while the pen is down and opens
 *   again under the pen when it lifts, if Space is still held) and lifting Space closes it.
 *
 * These listeners are on the window in the capture phase and must be registered before the canvas input attaches the
 * navigation puck's own, which consumes presses on the canvas while the puck is open: create this in the variant's
 * setup, before the canvas mounts. Must be created within a Solid owner.
 */
export function createSummon(options: {
  session: PaintSession;
  view: ViewDrag;
  /** The QuickMenu's center in client pixels while open, the pivot of the flick's zoom and rotate. */
  pivot: () => Point | undefined;
  /** Runs an instant QuickMenu button: undo, redo or the eyedropper. */
  run: (slot: SlotId) => void;
}) {
  const { session } = options;
  const { navigation } = session.camera;
  const flick = createFlick({ view: options.view, pivot: options.pivot, run: options.run });
  const [hand, setHandSignal] = createSignal<Hand>(storedHand());
  /** A finger held still on the drawing, shown as a filling ring until the long press opens the cluster. */
  const [pressRing, setPressRing] = createSignal<Point>();
  /** The cluster's Escape: closes a sheet inside it first and says whether it did. */
  let escapeInside: (() => boolean) | undefined;

  setupClosing();
  setupPressRing();

  return {
    /** Where the cluster opens, in client pixels, while it is open. */
    at: navigation.center,
    /** The pen hand; the tools and the brush cards go on its side. Stored on this device. */
    hand,
    setHand(next: Hand) {
      setHandSignal(next);
      try {
        localStorage.setItem(handKey, next);
      } catch {
        // The choice still applies until the page closes.
      }
    },
    /** The QuickMenu button the opening press points at. */
    highlighted: flick.highlighted,
    close,
    /**
     * Reports a finished action, such as a chosen tool, color, preset or layer, or the end of a drag: a toggled
     * cluster closes, so that the pen draws next; a held one stays.
     */
    done() {
      if (!navigation.held()) {
        close();
      }
    },
    /** Registers the cluster's own Escape handler, which returns whether it closed something inside. */
    onEscape(handler: (() => boolean) | undefined) {
      escapeInside = handler;
    },
    pressRing,
    /** Right-drags from the opening press flick toward a QuickMenu button; see `createFlick`. */
    picker: {
      move(point, origin) {
        if (!flick.active()) {
          flick.start(origin);
        }

        flick.move(point);
      },
      release(point) {
        flick.move(point);
        return finishes(flick.end(false));
      },
      cancel() {
        flick.end(true);
      }
    } satisfies PuckPicker,
    /**
     * Touch shortcuts: two- and three-finger taps undo and redo; a long press opens the cluster under the finger,
     * which may then slide toward a QuickMenu button and lift to choose it.
     */
    touchGestures: {
      tap(fingers: number) {
        if (fingers === 2 && session.engine.state().canUndo) {
          session.undo();
        }

        if (fingers === 3 && session.engine.state().canRedo) {
          session.redo();
        }
      },
      hold(point: Point) {
        setPressRing(undefined);
        if (navigation.center() || !session.ready()) {
          return;
        }

        const at = toClient(point);
        navigation.open(at);
        flick.start(at);
        return {
          move: (next: Point) => flick.move(toClient(next)),
          end(cancelled: boolean) {
            if (finishes(flick.end(cancelled))) {
              close();
            }
          }
        };
      }
    }
  };

  /** Closes the cluster and gives the keyboard back to the canvas. */
  function close() {
    navigation.close();
    session.canvas()?.focus({ preventScroll: true });
  }

  /** Whether a flick's result finishes the cluster: a view drag or the eyedropper; Undo and Redo keep it open. */
  function finishes(result: ReturnType<typeof flick.end>) {
    return result !== undefined && ('navigated' in result || result.ran === 'picker');
  }

  /** A document point of a touch hold in client pixels. */
  function toClient(point: Point) {
    const screen = worldToScreen(point, session.camera.current(), session.size());
    const origin = session.stage()?.getBoundingClientRect();
    return { x: screen.x + (origin?.left ?? 0), y: screen.y + (origin?.top ?? 0) };
  }

  /** Window listeners that close the cluster, and let presses through to the canvas where the spec says so. */
  function setupClosing() {
    const capture = { capture: true };
    const consume = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const inside = (event: Event) => event.target instanceof Element && !!event.target.closest('[data-puck-ui]');
    const onStage = (event: Event) => event.target instanceof Node && !!session.stage()?.contains(event.target);
    let spaceDown = false;
    /** The press drawing through a held cluster, which opens again where it lifts while Space is held. */
    let through: number | undefined;
    /** Pens touching the screen, whose `buttons` are their contact rather than a side button. */
    const contacts = new Set<number>();
    /** Hovering pens holding a side button, and those whose press closed the cluster and is swallowed. */
    const sideButtons = new Set<number>();
    const swallowed = new Set<number>();

    makeEventListener(
      window,
      'keydown',
      (event) => {
        if (event.code === 'Space') {
          spaceDown = true;
        }

        if (event.key === 'Escape' && navigation.center()) {
          consume(event);
          if (!escapeInside?.()) {
            close();
          }
        }
      },
      capture
    );
    makeEventListener(
      window,
      'keyup',
      (event) => {
        if (event.code === 'Space') {
          spaceDown = false;
        }
      },
      capture
    );
    makeEventListener(window, 'blur', () => {
      spaceDown = false;
    });
    makeEventListener(
      window,
      'pointerdown',
      (event) => {
        if (event.pointerType === 'pen' && event.button !== 2) {
          contacts.add(event.pointerId);
        }

        if (!navigation.center() || inside(event)) {
          return;
        }

        if (!onStage(event)) {
          close();
          return;
        }

        if (event.button === 2) {
          consume(event);
          close();
          return;
        }

        if (navigation.held()) {
          through = event.pointerId;
          close();
          return;
        }

        close();
        // A finger and the middle button pan at once; the pen and the mouse only close.
        if (event.pointerType !== 'touch' && event.button !== 1) {
          consume(event);
        }
      },
      capture
    );
    const lift = (event: PointerEvent) => {
      contacts.delete(event.pointerId);
      if (through !== event.pointerId) {
        return;
      }

      through = undefined;
      if (spaceDown && event.type === 'pointerup') {
        navigation.open({ x: event.clientX, y: event.clientY }, 'held');
      }
    };
    makeEventListener(window, 'pointerup', lift, capture);
    makeEventListener(window, 'pointercancel', lift, capture);
    // Android Chrome reports a hovering pen's side button only as a move with nonzero `buttons`; one press toggles.
    makeEventListener(
      window,
      'pointermove',
      (event) => {
        if (event.pointerType !== 'pen' || contacts.has(event.pointerId) || event.pressure > 0) {
          return;
        }

        if (event.buttons === 0) {
          sideButtons.delete(event.pointerId);
          swallowed.delete(event.pointerId);
          return;
        }

        if (sideButtons.has(event.pointerId)) {
          // The navigation puck must not see the rest of a press that closed the cluster, or it would open again.
          if (swallowed.has(event.pointerId)) {
            consume(event);
          }

          return;
        }

        sideButtons.add(event.pointerId);
        if (navigation.center()) {
          swallowed.add(event.pointerId);
          consume(event);
          close();
        }
      },
      capture
    );
  }

  /** Shows a ring under a finger resting alone on the drawing, until it moves, lifts or the long press opens. */
  function setupPressRing() {
    let finger: { id: number; at: Point } | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      clearTimeout(timer);
      finger = undefined;
      setPressRing(undefined);
    };
    onCleanup(stop);

    makeEventListener(window, 'pointerdown', (event) => {
      // Only the first finger down long-presses: the third of three fingers, after the second stopped the first's ring,
      // must not start one.
      if (
        finger ||
        !event.isPrimary ||
        event.pointerType !== 'touch' ||
        event.target !== session.canvas() ||
        navigation.center()
      ) {
        stop();
        return;
      }

      const at = { x: event.clientX, y: event.clientY };
      finger = { id: event.pointerId, at };
      timer = setTimeout(() => setPressRing(at), ringDelay);
    });
    makeEventListener(window, 'pointermove', (event) => {
      if (finger?.id === event.pointerId && Math.hypot(event.clientX - finger.at.x, event.clientY - finger.at.y) > 10) {
        stop();
      }
    });
    makeEventListener(window, 'pointerup', (event) => finger?.id === event.pointerId && stop());
    makeEventListener(window, 'pointercancel', (event) => finger?.id === event.pointerId && stop());
  }
}

/** The cluster's summoning; see `createSummon`. */
export type Summon = ReturnType<typeof createSummon>;

/** How long a finger rests before the long-press ring shows; the canvas input opens the cluster at 500 ms. */
export const ringDelay = 120;

const handKey = 'paint.puck.hand';

/** The stored pen hand, left unless right was chosen: the tools then sit on the left. */
function storedHand(): Hand {
  try {
    return localStorage.getItem(handKey) === 'right' ? 'right' : 'left';
  } catch {
    return 'left';
  }
}
