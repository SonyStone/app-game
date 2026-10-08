import { createEventListener } from '@solid-primitives/event-listener';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, createMemo, createSignal, Show, untrack } from 'solid-js';
import type { Point } from '../../kit/createSketchCanvas';
import type { VariantProps } from '../../kit/variant';
import { createDialModel, modes } from './createDialModel';
import { DetailCard } from './DetailCard';
import { Dial } from './Dial';
import styles from './Dial.module.css';
import { angleOf, turnBetween } from './geometry';
import { card, cardCorner, clampHandle, clusterCenter } from './layout';
import { MiniDial } from './MiniDial';
import { Orbit } from './Orbit';

/**
 * Dial: one big rotary control does almost everything, after the Surface Dial, the iPod click wheel and the Wacom
 * Touch Ring. Choose what to adjust on the dial's rim (size, opacity, a setting, color, brush, tool, layer, history,
 * zoom, rotation), then turn the track to adjust it by detents. An orbit of beads around it holds the tools, the view
 * buttons and the colors; a card beside it shows the details of the mode. When closed, a mini-dial stays on screen.
 *
 * Keys while open: `[` `]` or ← → turn one detent, ↑ ↓ or Tab change the mode, digits pick a mode, Enter closes.
 * A held opening press (right button, pen button, long press) that circles around the center turns the dial and
 * finishes on release.
 */
export function DialVariant(props: VariantProps) {
  const model = createDialModel(props.studio);
  const windowSize = createWindowSize();
  const [navigating, setNavigating] = createSignal<'pan' | 'view'>();
  /** Where the user parked the mini-dial; `undefined` until they move it. */
  const [parked, setParked] = createSignal<Point | undefined>(loadParked());
  const serial = createMemo(() => props.summon?.serial);
  const handle = createMemo(() =>
    clampHandle(
      parked() ?? defaultHandle(props.hand, windowSize.width, windowSize.height),
      windowSize.width,
      windowSize.height
    )
  );
  const center = createMemo(() =>
    clusterCenter(props.summon?.at ?? handle(), props.hand, windowSize.width, windowSize.height)
  );
  const hints = () => props.summon?.pointerType === 'mouse' || props.summon?.pointerType === 'keyboard';

  createEffect(serial, () => setNavigating(undefined));
  // Closing ends a color edit that a key or the wheel left pending.
  createEffect(serial, (opened) => {
    if (opened === undefined) {
      untrack(() => model.commit());
    }
  });
  setupKeys();
  setupHeldTurn();

  return (
    <Show
      when={props.summon}
      fallback={
        <MiniDial
          studio={props.studio}
          model={model}
          at={handle()}
          onMove={setParked}
          onPark={() => localStorage.setItem(parkedKey, JSON.stringify(handle()))}
          onOpen={(at, pointerType) => props.open(at, pointerType)}
        />
      }
    >
      <div class={[styles.root, { [styles.hidden!]: props.hidden }]}>
        <Show when={!navigating()}>
          <Orbit
            studio={props.studio}
            model={model}
            center={center()}
            hand={props.hand}
            hints={hints()}
            onDone={props.done}
          />
          <DetailCard
            studio={props.studio}
            model={model}
            center={center()}
            corner={cardCorner(center(), props.hand, windowSize.height)}
            width={card.width}
            onDone={props.done}
          />
        </Show>
        <Dial
          studio={props.studio}
          model={model}
          center={center()}
          finishable={props.summon?.mode === 'toggle'}
          hints={hints()}
          navigating={navigating()}
          onNavigate={setNavigating}
          onDone={props.done}
        />
      </div>
    </Show>
  );

  /** Keys while open; consumed keys are prevented, so the gallery leaves them alone. */
  function setupKeys() {
    createEventListener(
      window,
      'keydown',
      (event) => {
        if (!props.summon || props.hidden || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
          return;
        }

        const key = event.key;
        if (key === '[' || key === 'ArrowLeft') {
          model.step(-1, center());
        } else if (key === ']' || key === 'ArrowRight') {
          model.step(1, center());
        } else if (key === 'ArrowUp') {
          model.stepMode(-1);
        } else if (key === 'ArrowDown') {
          model.stepMode(1);
        } else if (key === 'Tab') {
          model.stepMode(event.shiftKey ? -1 : 1);
        } else if (key === 'Enter') {
          props.close();
        } else if (/^[0-9]$/.test(key)) {
          const chosen = modes.find((entry) => entry.key === key);
          if (chosen && model.available(chosen.id)) {
            model.setMode(chosen.id);
          }
        } else {
          return;
        }

        event.preventDefault();
      },
      { capture: true }
    );
  }

  /**
   * The opening press, still held (right button, pen button, long press), turns the dial when it circles around the
   * center, as a Surface Dial turns while pressed; lifting after a turn finishes. Near the center (where it opened)
   * it does nothing. Followed only until its first lift: later presses reuse the pointer's id.
   */
  function setupHeldTurn() {
    let liftedFor: number | undefined;
    let turn: { serial: number; last: number | undefined; started: boolean } | undefined;
    const holding = (event: PointerEvent) =>
      props.summon?.heldPointer === event.pointerId && liftedFor !== props.summon.serial;

    createEventListener(window, 'pointermove', (event) => {
      if (!holding(event)) {
        return;
      }

      const at = { x: event.clientX, y: event.clientY };
      const pivot = center();
      if (turn?.serial !== props.summon!.serial) {
        turn = { serial: props.summon!.serial, last: undefined, started: false };
      }

      if (Math.hypot(at.x - pivot.x, at.y - pivot.y) < 44) {
        turn.last = undefined;
        return;
      }

      const angle = angleOf(at, pivot);
      if (!turn.started) {
        turn.started = true;
        model.turnStart(pivot);
        if (model.continuous()) {
          setNavigating('view');
        }
      }

      if (turn.last !== undefined) {
        model.turnBy(turnBetween(turn.last, angle));
      }

      turn.last = angle;
    });
    const lift = (event: PointerEvent, finished: boolean) => {
      if (!holding(event)) {
        return;
      }

      liftedFor = props.summon!.serial;
      const started = turn?.serial === liftedFor && turn.started;
      turn = undefined;
      if (!started) {
        return;
      }

      const turned = model.turnEnd();
      setNavigating(undefined);
      if (turned && finished) {
        props.done();
      }
    };
    createEventListener(window, 'pointerup', (event) => lift(event, true));
    createEventListener(window, 'pointercancel', (event) => lift(event, false));
  }
}

const parkedKey = 'puck-gallery:dial-handle';

function loadParked(): Point | undefined {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(parkedKey) ?? 'null');
    if (stored && typeof stored === 'object' && 'x' in stored && 'y' in stored) {
      const { x, y } = stored as { x: unknown; y: unknown };
      return typeof x === 'number' && typeof y === 'number' ? { x, y } : undefined;
    }
  } catch {
    // A broken entry falls back to the default place.
  }

  return undefined;
}

/** The mini-dial's first place: on the free hand's side, below the middle, where a finger finds it. */
function defaultHandle(hand: 'left' | 'right', width: number, height: number): Point {
  return { x: hand === 'left' ? width - 72 : 72, y: height * 0.62 };
}
