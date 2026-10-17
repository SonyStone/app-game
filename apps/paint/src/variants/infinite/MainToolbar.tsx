import type { JSX } from '@solidjs/web';
import { Show } from 'solid-js';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import { InfiniteIcon, type InfiniteIconName } from './icons';
import styles from './MainToolbar.module.css';
import theme from './theme.module.css';

/**
 * Infinite Painter's main toolbar (manual p. 34): a narrow floating column with the brush modes Paint, Blend and
 * Erase, then the Size, Color and Opacity buttons, with the Recent Colors strip docked beside it (`strip`).
 *
 * - A tap on a mode chooses it; a tap on the active mode opens the brush selector (`onBrushes`).
 * - Size and Opacity are virtual sliders: a tap opens their pop-up, a drag up or down changes the value, which
 *   `onReadout` reports for the on-screen readout while the drag lasts.
 * - Color: a tap opens the color panel, a drag up or down changes the brightness and keeps the hue, and a drag out
 *   sideways, off the toolbar, becomes the eyedropper (`onEyedropper`), which follows the pointer to the canvas.
 * - Two fingers drag the whole toolbar (`onMove`); it snaps to the screen's left and right edges.
 *
 * Paint has no Blend mode (a smudge brush): its button is shown, as Infinite Painter has it, but disabled.
 */
export function MainToolbar(props: {
  mode: ToolbarMode | undefined;
  onMode: (mode: ToolbarMode, anchor: HTMLElement) => void;
  /** The active mode was tapped again. */
  onBrushes: (mode: ToolbarMode, anchor: HTMLElement) => void;
  /** Brush size as a fraction 0–1 of the size button's geometric range; see `onSize`. */
  sizeFraction: number;
  onSize: (fraction: number, done: boolean) => void;
  onSizeTap: (anchor: HTMLElement) => void;
  /** The parameter the Opacity button controls, 0–1: opacity, flow or softness, as the opacity pop-up chose. */
  opacityValue: number;
  opacityLabel: string;
  onOpacity: (value: number, done: boolean) => void;
  onOpacityTap: (anchor: HTMLElement) => void;
  color: string;
  /** Brightness, 0–1, of `color`; a drag changes it with `onBrightness` and keeps the hue. */
  brightness: number;
  onBrightness: (value: number, done: boolean) => void;
  onColorTap: (anchor: HTMLElement) => void;
  /** A drag out of the Color button: `start` when it leaves the toolbar, then the pointer's moves and its lift. */
  onEyedropper: (phase: 'start' | 'move' | 'end' | 'cancel', point: { x: number; y: number }) => void;
  /** The Size, Opacity or Color drag in progress, for the readout; `undefined` when it ends. */
  onReadout: (readout: ToolbarReadout | undefined) => void;
  disabled?: boolean;
  /** Where the toolbar's top-left corner is, in CSS pixels of the window. */
  position: { x: number; y: number };
  /** Two fingers moved the toolbar to `position`; `done` when they lift. */
  onMove: (position: { x: number; y: number }, done: boolean) => void;
  /** The Recent Colors strip, docked to the toolbar's right edge. */
  strip?: JSX.Element;
}) {
  let element!: HTMLDivElement;
  const twoFingers = twoFingerMove({
    origin: () => props.position,
    move: (position, done) => props.onMove(position, done)
  });

  return (
    <div
      ref={element}
      class={[theme.panel, styles.toolbar]}
      style={{ left: `${props.position.x}px`, top: `${props.position.y}px` }}
      role="toolbar"
      aria-orientation="vertical"
      aria-label="Main toolbar"
      onPointerDown={(event) => twoFingers.down(event, element)}
      onPointerMove={twoFingers.move}
      onPointerUp={twoFingers.up}
      onPointerCancel={twoFingers.up}
    >
      <div class={styles.column}>
        <ModeButton
          slot="brush"
          current={props.mode}
          icon="brush"
          label="Paint"
          onMode={props.onMode}
          onBrushes={props.onBrushes}
        />
        <ModeButton
          slot="blend"
          current={props.mode}
          icon="blend"
          label="Blend · Paint has no smudge brush"
          disabled
          onMode={props.onMode}
          onBrushes={props.onBrushes}
        />
        <ModeButton
          slot="eraser"
          current={props.mode}
          icon="eraser"
          label="Erase"
          onMode={props.onMode}
          onBrushes={props.onBrushes}
        />
        <span class={styles.divider} />
        <SliderButton
          label="Brush size"
          hint="Tap for the size pop-up · drag up or down"
          fraction={props.sizeFraction}
          disabled={props.disabled}
          onDrag={(fraction, done) => {
            props.onSize(fraction, done);
            props.onReadout(done ? undefined : { kind: 'size' });
          }}
          onTap={props.onSizeTap}
        >
          <span class={styles.sizeRing} style={{ '--size': props.sizeFraction }} />
        </SliderButton>
        <SliderButton
          label="Color"
          hint="Tap for the color panel · drag up or down for brightness · drag out for the eyedropper"
          fraction={props.brightness}
          onDrag={(value, done) => {
            props.onBrightness(value, done);
            props.onReadout(done ? undefined : { kind: 'brightness' });
          }}
          onTap={props.onColorTap}
          onDragOut={props.onEyedropper}
        >
          <span class={styles.colorDot} style={{ background: props.color }} />
        </SliderButton>
        <SliderButton
          label={props.opacityLabel}
          hint="Tap for the opacity pop-up · drag up or down"
          fraction={props.opacityValue}
          disabled={props.disabled}
          onDrag={(value, done) => {
            props.onOpacity(value, done);
            props.onReadout(done ? undefined : { kind: 'opacity' });
          }}
          onTap={props.onOpacityTap}
        >
          <span class={styles.opacityDot} style={{ '--opacity': props.opacityValue }} />
        </SliderButton>
      </div>
      <Show when={props.strip}>{props.strip}</Show>
    </div>
  );
}

/** The brush modes of the main toolbar; Paint's tools for Paint and Erase, and Blend, which Paint lacks. */
export type ToolbarMode = 'brush' | 'blend' | 'eraser';

/** Which virtual slider of the toolbar is being dragged; the caller reads its value for the readout. */
export type ToolbarReadout = { kind: 'size' | 'opacity' | 'brightness' };

/** The toolbar's width in CSS pixels without the strip, for placing it against the screen's edges. */
export const toolbarWidth = 44;

/** How far, in CSS pixels, a drag travels over the whole range of a virtual slider. */
export const dragTravel = 260;

/** A brush mode button, bright while active; a tap on the active one opens the brush selector instead. */
function ModeButton(props: {
  slot: ToolbarMode;
  current: ToolbarMode | undefined;
  icon: InfiniteIconName;
  label: string;
  disabled?: boolean;
  onMode: (mode: ToolbarMode, anchor: HTMLElement) => void;
  onBrushes: (mode: ToolbarMode, anchor: HTMLElement) => void;
}) {
  return (
    <button
      class={styles.mode}
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.current === props.slot ? 'true' : 'false'}
      disabled={props.disabled}
      onClick={(event) => {
        if (props.current === props.slot) {
          props.onBrushes(props.slot, event.currentTarget);
          return;
        }

        props.onMode(props.slot, event.currentTarget);
      }}
    >
      <InfiniteIcon name={props.icon} size={22} />
    </button>
  );
}

/**
 * A virtual slider button: a tap calls `onTap`, a drag up or down moves `fraction` by the drag's height over
 * {@link dragTravel} and reports it with `onDrag`, ending with `done`; a cancelled press restores the starting value.
 * With `onDragOut`, a drag that leaves the button sideways by more than {@link dragOutDistance} becomes a drag out.
 */
function SliderButton(props: {
  label: string;
  hint: string;
  fraction: number;
  disabled?: boolean;
  onDrag: (fraction: number, done: boolean) => void;
  onTap: (anchor: HTMLElement) => void;
  onDragOut?: (phase: 'start' | 'move' | 'end' | 'cancel', point: { x: number; y: number }) => void;
  children: JSX.Element;
}) {
  /** What the press turned into once it moved. */
  let kind: 'undecided' | 'slide' | 'out' = 'undecided';
  let startFraction = 0;
  const press = pressHandlers({
    start: (started, event) => {
      // A second finger belongs to the toolbar's two-finger move.
      if (props.disabled || !event.isPrimary) {
        return false;
      }

      kind = 'undecided';
      startFraction = props.fraction;
    },
    move: (moved) => {
      const dx = moved.point.x - moved.start.x;
      const dy = moved.point.y - moved.start.y;
      if (kind === 'undecided') {
        if (props.onDragOut && Math.abs(dx) > dragOutDistance && Math.abs(dx) > Math.abs(dy)) {
          kind = 'out';
          props.onDragOut('start', moved.point);
        } else if (Math.abs(dy) > slideThreshold) {
          kind = 'slide';
        }
      }

      if (kind === 'slide') {
        props.onDrag(slidFraction(startFraction, dy), false);
      }

      if (kind === 'out') {
        props.onDragOut?.('move', moved.point);
      }
    },
    tap: (tapped) => props.onTap(tapped.target as HTMLElement),
    end: (ended) => finish(ended),
    cancel: () => {
      if (kind === 'slide') {
        props.onDrag(startFraction, true);
      }

      if (kind === 'out') {
        props.onDragOut?.('cancel', { x: 0, y: 0 });
      }

      kind = 'undecided';
    }
  });

  function finish(ended: Press) {
    if (kind === 'slide') {
      props.onDrag(slidFraction(startFraction, ended.point.y - ended.start.y), true);
    }

    if (kind === 'out') {
      props.onDragOut?.('end', ended.point);
    }

    if (kind === 'undecided') {
      props.onTap(ended.target as HTMLElement);
    }

    kind = 'undecided';
  }

  return (
    <button
      class={styles.slider}
      aria-label={props.label}
      title={`${props.label} · ${props.hint}`}
      disabled={props.disabled}
      {...press}
    >
      {props.children}
    </button>
  );
}

/** The fraction a vertical drag of `dy` CSS pixels (down is positive) makes of `start`. */
export function slidFraction(start: number, dy: number) {
  return Math.min(1, Math.max(0, start - dy / dragTravel));
}

/** CSS pixels a press must move vertically before it slides. */
const slideThreshold = 6;

/** CSS pixels a press on the Color button must move sideways before it becomes the eyedropper. */
const dragOutDistance = 36;

/**
 * Moves the toolbar with two fingers: the second touch on the toolbar takes the first one's press away from its button
 * (releasing its capture cancels that press), and the toolbar then follows the fingers' average movement until both
 * lift.
 */
function twoFingerMove(options: {
  origin: () => { x: number; y: number };
  move: (position: { x: number; y: number }, done: boolean) => void;
}) {
  const touches = new Map<number, { x: number; y: number }>();
  /** The element each touch first landed on, which may have captured it for a button press. */
  const targets = new Map<number, EventTarget | null>();
  let start: { x: number; y: number; origin: { x: number; y: number } } | undefined;
  const center = () => {
    const points = [...touches.values()];
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length
    };
  };
  const at = () => {
    const now = center();
    return { x: start!.origin.x + now.x - start!.x, y: start!.origin.y + now.y - start!.y };
  };

  return {
    down(event: PointerEvent, element: HTMLElement) {
      if (event.pointerType !== 'touch') {
        return;
      }

      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      targets.set(event.pointerId, event.target);
      if (touches.size !== 2) {
        return;
      }

      // Releasing a button's capture cancels its press, so the first finger stops sliding or tapping it.
      for (const [id, target] of targets) {
        if (target instanceof Element && target.hasPointerCapture(id)) {
          target.releasePointerCapture(id);
        }

        element.setPointerCapture(id);
      }

      start = { ...center(), origin: options.origin() };
    },
    move(event: PointerEvent) {
      if (!touches.has(event.pointerId)) {
        return;
      }

      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (start) {
        options.move(at(), false);
      }
    },
    up(event: PointerEvent) {
      targets.delete(event.pointerId);
      if (!touches.delete(event.pointerId)) {
        return;
      }

      if (start) {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        options.move(at(), true);
        touches.delete(event.pointerId);
        start = undefined;
      }
    }
  };
}
