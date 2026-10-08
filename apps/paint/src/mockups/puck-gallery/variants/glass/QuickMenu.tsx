import { createSignal, For, onCleanup, Show } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../../../shared/ui/SketchIcon';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import type { NavigationKind } from '../../kit/navigationDrag';
import { pressHandlers } from '../../kit/pressHandlers';
import { galleryUi } from '../../kit/variant';
import { TapButton, tapProps, wheelSteps } from './controls';
import type { Box } from './layout';
import type { GlassNavigation } from './navigation';
import css from './QuickMenu.module.css';

/**
 * Procreate's QuickMenu as the Puck: six round buttons on a glass disc around an empty center. Pan, Zoom and Rotate
 * navigate while pressed and dragged (the rest of the cluster fades meanwhile); Undo and Redo act on the press and
 * repeat while held; Eyedropper switches to the color picker. A tap on the center closes the cluster. The center
 * names the button under the pointer, or shows `readout` while something is being adjusted.
 */
export function QuickMenu(props: {
  studio: Studio;
  box: Box;
  /** The QuickMenu's center in client pixels, the pivot of wheel zooms and turns. */
  center: Point;
  navigation: GlassNavigation;
  /** Runs an instant slot: undo, redo or the eyedropper. */
  onAction: (slot: SlotId) => void;
  /** The slot that the opening press points at, during a flick. */
  highlighted: SlotId | undefined;
  /** What the center says while a value or the view is being adjusted. */
  readout: string | undefined;
  showKeys: boolean;
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
  const disabled = (slot: Slot) =>
    (slot.id === 'undo' && !props.studio.canUndo()) || (slot.id === 'redo' && !props.studio.canRedo());
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
      {...galleryUi}
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
                  [css.live!]: slot.nav !== undefined && props.navigation.kind() === slot.nav,
                  [css.off!]: disabled(slot)
                }
              ]}
              style={{
                left: `calc(50% + ${Math.cos((slot.angle * Math.PI) / 180) * slotRadius}px)`,
                top: `calc(50% + ${Math.sin((slot.angle * Math.PI) / 180) * slotRadius}px)`
              }}
              title={`${slot.label} (${slot.key})`}
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

  /** A button's press: navigation drags for Pan, Zoom and Rotate, repeating presses for Undo and Redo, a tap otherwise. */
  function slotPress(slot: Slot) {
    if (slot.nav) {
      const kind = slot.nav;
      return pressHandlers({
        start: (press) => props.navigation.start(kind, press.point),
        move: (press) => props.navigation.move(press.point, press.shift),
        end: () => props.navigation.end(),
        tap: () => {
          props.navigation.end();
          flashHint(`Drag to ${slot.label.toLowerCase()}`);
        },
        cancel: () => props.navigation.end()
      });
    }

    if (slot.id === 'picker') {
      return tapProps(() => props.onAction(slot.id));
    }

    return pressHandlers({
      start: () => repeat(slot.id, 420),
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
        props.studio.zoomBy(Math.exp(-event.deltaY * 0.0022), props.center);
      };
    }

    if (slot.id === 'pan') {
      return (event: WheelEvent) => {
        event.preventDefault();
        props.studio.pan(-event.deltaX, -event.deltaY);
      };
    }

    if (slot.id === 'rotate') {
      return wheelSteps((direction) => props.studio.rotateBy(direction * -5, props.center));
    }

    return wheelSteps((direction) => props.onAction(direction > 0 ? 'undo' : 'redo'));
  }
}

/** A QuickMenu button. */
export type Slot = {
  id: SlotId;
  label: string;
  icon: SketchIconName;
  /** The digit that runs it while the cluster is open. */
  key: string;
  /** Degrees clockwise from the right. */
  angle: number;
  /** The navigation it drags, for Pan, Zoom and Rotate. */
  nav?: NavigationKind;
};

export type SlotId = 'zoom' | 'rotate' | 'redo' | 'picker' | 'undo' | 'pan';

/** The six QuickMenu slots, clockwise from the top: navigation above, history below, the eyedropper at the bottom. */
export const slots: readonly Slot[] = [
  { id: 'zoom', label: 'Zoom', icon: 'zoom', key: '2', angle: -90, nav: 'zoom' },
  { id: 'rotate', label: 'Rotate', icon: 'rotate', key: '3', angle: -30, nav: 'rotate' },
  { id: 'redo', label: 'Redo', icon: 'redo', key: '5', angle: 30 },
  { id: 'picker', label: 'Eyedropper', icon: 'picker', key: '6', angle: 90 },
  { id: 'undo', label: 'Undo', icon: 'undo', key: '4', angle: 150 },
  { id: 'pan', label: 'Pan', icon: 'pan', key: '1', angle: 210, nav: 'pan' }
];

/** The slot in the direction of a move from the QuickMenu's center, by angle. */
export function slotToward(dx: number, dy: number): Slot {
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const distance = (slot: Slot) => Math.abs(((angle - slot.angle + 540) % 360) - 180);
  return slots.reduce((best, slot) => (distance(slot) < distance(best) ? slot : best));
}

/** The distance of the buttons' centers from the QuickMenu's center. */
const slotRadius = 60;
