import { createSignal, For, onCleanup, Show } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { TapButton, tapProps, wheelSteps } from './controls';
import type { ViewDrag } from './createViewDrag';
import type { Box, Point } from './layout';
import { pressHandlers } from '../../shared/ui/pressHandlers';
import css from './QuickMenu.module.css';
import { slots, type Slot, type SlotId } from './slots';

/**
 * Procreate's QuickMenu as the Puck: six round buttons on a glass disc around an empty center. Pan, Zoom and Rotate
 * drag the view while pressed (the rest of the cluster hides meanwhile) and finish the cluster when they lift; Undo
 * and Redo act on the press and repeat while held, keeping the cluster open; the Eyedropper arms the color picker.
 * A tap on the center closes the cluster. The center names the button under the pointer, or shows `readout` while
 * the view or a value is being adjusted.
 */
export function QuickMenu(props: {
  box: Box;
  /** The QuickMenu's center in client pixels, the pivot of zooms and turns. */
  center: Point;
  view: ViewDrag;
  /** Runs an instant button: undo, redo or the eyedropper. */
  onAction: (slot: SlotId) => void;
  /** Whether Undo and Redo have anything to do. */
  canUndo: boolean;
  canRedo: boolean;
  /** The button that the opening press points at, during a flick. */
  highlighted: SlotId | undefined;
  /** What the center says while a value or the view is being adjusted. */
  readout: string | undefined;
  showKeys: boolean;
  /** A view drag ended. */
  onNavigated: () => void;
  close: () => void;
}) {
  const [hovered, setHovered] = createSignal<SlotId>();
  const [hint, setHint] = createSignal<string>();
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let repeatTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    clearTimeout(hintTimer);
    clearTimeout(repeatTimer);
  });

  const label = () => {
    const named = props.highlighted ?? hovered();
    return props.readout ?? hint() ?? (named ? slots.find((slot) => slot.id === named)!.label : undefined);
  };
  const disabled = (slot: Slot) => (slot.id === 'undo' && !props.canUndo) || (slot.id === 'redo' && !props.canRedo);
  const stopRepeat = () => clearTimeout(repeatTimer);
  /** Undo and Redo repeat while held, as Procreate's two-finger hold does. */
  const repeat = (slot: SlotId, delay: number) => {
    props.onAction(slot);
    repeatTimer = setTimeout(() => repeat(slot, 90), delay);
  };
  const flashHint = (text: string) => {
    setHint(text);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => setHint(undefined), 900);
  };

  return (
    <div
      class={css.menu}
      style={{
        left: `${props.box.x}px`,
        top: `${props.box.y}px`,
        width: `${props.box.width}px`,
        height: `${props.box.height}px`
      }}
    >
      <span class={css.disc} />
      <For each={slots}>
        {(slot) => {
          // Created once per button: a spread that calls a function would re-create them, and lose the press, whenever
          // the button's class changes.
          const press = slotPress(slot);
          const onWheel = slotWheel(slot);
          return (
            <button
              type="button"
              class={[
                css.slot,
                {
                  [css.hot!]: props.highlighted === slot.id,
                  [css.live!]: slot.nav !== undefined && props.view.kind() === slot.nav,
                  [css.off!]: disabled(slot)
                }
              ]}
              style={{
                left: `calc(50% + ${round(Math.cos((slot.angle * Math.PI) / 180) * slotRadius)}px)`,
                top: `calc(50% + ${round(Math.sin((slot.angle * Math.PI) / 180) * slotRadius)}px)`
              }}
              title={`${slot.label} (${slot.key})`}
              aria-label={slot.label}
              onPointerEnter={(event) => event.pointerType !== 'touch' && setHovered(slot.id)}
              onPointerLeave={() => setHovered(undefined)}
              onWheel={onWheel}
              {...press}
            >
              <SketchIcon name={slot.icon} size={22} />
              <Show when={props.showKeys}>
                <kbd class={css.key}>{slot.key}</kbd>
              </Show>
            </button>
          );
        }}
      </For>
      <TapButton class={css.center} title="Close (Esc)" onTap={() => props.close()}>
        <Show when={label()}>{(text) => <span class={css.label}>{text()}</span>}</Show>
      </TapButton>
    </div>
  );

  /** A button's press: view drags for Pan, Zoom and Rotate, repeating presses for Undo and Redo, a tap otherwise. */
  function slotPress(slot: Slot) {
    if (slot.nav) {
      const kind = slot.nav;
      return pressHandlers({
        start: (press) => props.view.start(kind, press.point, props.center),
        move: (press) => props.view.move(press.point, press.shift),
        end: () => {
          props.view.end();
          props.onNavigated();
        },
        tap: () => {
          props.view.end();
          flashHint(`Drag to ${slot.label.toLowerCase()}`);
        },
        cancel: () => props.view.end()
      });
    }

    if (slot.id === 'picker') {
      return tapProps(() => props.onAction(slot.id));
    }

    return pressHandlers({
      start: () => {
        if (disabled(slot)) {
          return false;
        }

        repeat(slot.id, 420);
      },
      end: stopRepeat,
      tap: stopRepeat,
      cancel: stopRepeat
    });
  }

  /** The wheel over a button: zooms or turns the view around the QuickMenu, pans, or steps through history. */
  function slotWheel(slot: Slot) {
    if (slot.id === 'zoom') {
      return (event: WheelEvent) => {
        event.preventDefault();
        props.view.zoomBy(Math.exp(-event.deltaY * 0.0022), props.center);
      };
    }

    if (slot.id === 'pan') {
      return (event: WheelEvent) => {
        event.preventDefault();
        props.view.pan(-event.deltaX, -event.deltaY);
      };
    }

    if (slot.id === 'rotate') {
      return wheelSteps((direction) => props.view.rotateBy(direction * -5, props.center));
    }

    return wheelSteps((direction) => props.onAction(direction > 0 ? 'undo' : 'redo'));
  }
}

/** The distance of the buttons' centers from the QuickMenu's center. */
const slotRadius = 60;

/** Rounds to device-independent half pixels, so that the buttons sit crisply on the ring. */
function round(value: number) {
  return Math.round(value * 2) / 2;
}
