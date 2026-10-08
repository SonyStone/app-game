import { createEventListener } from '@solid-primitives/event-listener';
import { createMemo, createSignal, For, Show, untrack } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../../../shared/ui/SketchIcon';
import { presets, type Preset } from '../../kit/catalog';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { navigationDrag, type NavigationKind } from '../../kit/navigationDrag';
import { pressHandlers } from '../../kit/pressHandlers';
import { formatValue } from '../../kit/values';
import { galleryUi, type VariantProps } from '../../kit/variant';
import { ColorStripView, createColorStrip } from './ColorStrip';
import { createFingerTaps } from './fingerTaps';
import {
  clamp,
  clampToWindow,
  directions,
  directionToward,
  functionAt,
  radii,
  unitOf,
  zoneAt,
  type Direction,
  type FunctionId,
  type Zone
} from './geometry';
import styles from './Hud.module.css';
import { createLayerStrip, LayerStripView } from './LayerStrip';
import { createPresetStrip, PresetStripView } from './PresetStrip';
import type { StripContext, StripVia } from './strip';
import { createToolStrip, ToolStripView } from './ToolStrip';
import { createValueStrip, createWheelSteps, NoteStripView, ValueStripView } from './ValueStrip';

/**
 * HUD, after Photoshop's HUD brush and color pickers and Procreate's gestures: almost no UI, the pen's motion is the
 * interface. Summoning draws a small ring on the drawing at the pen, with the brush outline at its real size and
 * eight short spokes. Pressing a spoke (or flicking the held opening press) toward a function and sliding on opens
 * that function's strip right at the pen, so one stroke picks the function and sets it: → Size, ↑ Opacity,
 * ↗ Color, ↖ Tools, ↙ Layers, ↘ Presets, ← History, ↓ Zoom (diagonals mirror for the right hand). Dragging the hub
 * pans, dragging the ring around it rotates. A tap leaves it open as larger labeled targets (two-step mode) for
 * fingers and for people who prefer taps. Two- and three-finger quick taps on the drawing undo and redo, open or not.
 */
export function HudVariant(props: VariantProps) {
  const serial = createMemo(() => props.summon?.serial);
  let holdRelease: (() => boolean) | undefined;

  untrack(() => props.onHoldRelease(() => holdRelease?.() ?? false));
  createFingerTaps((fingers) => {
    const studio = props.studio;
    if (fingers === 2) {
      studio.notify(studio.canUndo() ? 'Undo' : 'Nothing to undo');
      studio.undo();
    } else if (fingers === 3) {
      studio.notify(studio.canRedo() ? 'Redo' : 'Nothing to redo');
      studio.redo();
    }
  });

  return (
    <Show when={serial()} keyed>
      {(_opening) => (
        <Hud
          {...props}
          holdRelease={(handler) => {
            holdRelease = handler;
          }}
        />
      )}
    </Show>
  );
}

/**
 * One opening of the HUD: everything it shows and how it reacts, created afresh for every summon `serial` so that
 * no state leaks from one opening into the next.
 */
function Hud(
  props: VariantProps & {
    /** Registers what lifting Space does, for the variant-wide `onHoldRelease`. */
    holdRelease: (handler: () => boolean) => void;
  }
) {
  const opened = untrack(() => props.summon!);
  const studio = untrack(() => props.studio);
  const openedAt = performance.now();
  /** The ring's center: the summon point, moved in so that the two-step labels fit in the window. */
  const center = clampToWindow(opened.at, { x: 168, y: 128 });
  const navigation = navigationDrag(studio);
  /** Whether the opening press is still down and followed; see `followHeldPointer`. */
  let holding = opened.heldPointer !== undefined;

  const [twoStep, setTwoStep] = createSignal(opened.pointerType === 'touch' && opened.heldPointer === undefined);
  const [hover, setHover] = createSignal<Zone>();
  const [pressed, setPressed] = createSignal<Zone>();
  const [focus, setFocus] = createSignal<Direction>();
  const [strip, setStripSignal] = createSignal<OpenStrip>();
  const [nav, setNavSignal] = createSignal<NavigationKind>();
  // Handlers read these mirrors: a signal read right after its write in the same event is still the old value.
  let open: OpenStrip | undefined;
  let navigating: NavigationKind | undefined;
  const setStrip = (next: OpenStrip | undefined) => {
    open = next;
    setStripSignal(next);
  };
  const setNav = (next: NavigationKind | undefined) => {
    navigating = next;
    setNavSignal(next);
  };

  const busy = () => strip()?.via === 'drag' || nav() !== undefined;
  const fnOf = (direction: Direction) => functionAt(direction, props.hand);
  /** The direction to highlight: pressed, hovered or flicked toward, focused by keys, or showing its strip. */
  const active = () => {
    for (const zone of [pressed(), hover()]) {
      if (typeof zone === 'number') {
        return zone;
      }
    }

    const shown = strip();
    return focus() ?? (shown ? directions.find((direction) => fnOf(direction) === shown.model.fn) : undefined);
  };
  const surfaceRadius = () => (twoStep() ? 128 : 100);

  props.holdRelease(
    // A quick Space tap, work in progress or a keyboard choice leave the HUD open as a toggle.
    () =>
      performance.now() - openedAt < 300 ||
      open !== undefined ||
      navigating !== undefined ||
      focus() !== undefined ||
      twoStep()
  );
  followHeldPointer();
  listenToKeys();

  let pressZone: Zone | undefined;
  const surface = pressHandlers({
    start(press) {
      if (open?.via === 'drag' || navigating) {
        return false;
      }

      pressZone = zoneAt(press.start, center);
      setPressed(pressZone);
    },
    move(press) {
      if (!press.moved || pressZone === undefined) {
        return;
      }

      if (navigating) {
        navigation.move(press.point, press.shift);
      } else if (open?.via === 'drag') {
        open.model.move(press.point);
      } else if (pressZone === 'hub' || pressZone === 'rim') {
        startNavigation(pressZone === 'hub' ? 'pan' : 'rotate', press.start);
        navigation.move(press.point, press.shift);
      } else {
        openStrip(fnOf(pressZone), press.start, 'drag').move(press.point);
      }
    },
    end() {
      pressZone = undefined;
      setPressed(undefined);
      if (navigating) {
        endNavigation();
      } else if (open?.via === 'drag') {
        finishDrag();
      }
    },
    tap(press) {
      const zone = pressZone;
      pressZone = undefined;
      setPressed(undefined);
      if (zone === undefined) {
        return;
      }

      if (zone === 'hub' || zone === 'rim') {
        if (open) {
          cancelStrip();
        } else {
          setTwoStep((on) => !on);
        }

        return;
      }

      if (open?.model.fn === fnOf(zone)) {
        cancelStrip();
      } else {
        openStrip(fnOf(zone), press.start, 'tap');
      }
    },
    cancel() {
      pressZone = undefined;
      setPressed(undefined);
      if (navigating) {
        navigation.end();
        setNav(undefined);
      } else if (open?.via === 'drag') {
        cancelStrip();
      }
    }
  });
  let wheelDirection: Direction = 0;
  const wheelStep = createWheelSteps((by) => {
    const fn = fnOf(wheelDirection);
    const model = createStrip(fn, stripContext(center, 'key'));
    // The wheel turns the hue over Color; elsewhere it steps the value or the item.
    model.step(fn === 'color' ? by : 0, fn === 'color' ? 0 : by, false);
    model.commit();
  });
  const committed = (changed: boolean) => {
    if (changed && open?.model.finishes) {
      props.done();
    }
  };

  return (
    <div class={styles.hud}>
      <Show when={nav() !== 'pan' && nav() !== 'rotate'}>
        <BrushPreview
          studio={studio}
          at={center}
          preset={presetPreview(strip())}
          filled={['size', 'opacity', 'presets'].includes(strip()?.model.fn ?? '')}
        />
      </Show>

      <div
        {...galleryUi}
        {...surface}
        class={[styles.surface, { [styles.faded!]: busy(), [styles.receded!]: !busy() && strip() !== undefined }]}
        style={{
          left: `${center.x - surfaceRadius()}px`,
          top: `${center.y - surfaceRadius()}px`,
          width: `${surfaceRadius() * 2}px`,
          height: `${surfaceRadius() * 2}px`
        }}
        onPointerMove={(event) => {
          surface.onPointerMove(event);
          if (event.pointerType !== 'touch' && pressZone === undefined && !holding) {
            setHover(zoneAt({ x: event.clientX, y: event.clientY }, center));
          }
        }}
        onPointerLeave={() => !holding && setHover(undefined)}
        onWheel={(event) => {
          const zone = zoneAt({ x: event.clientX, y: event.clientY }, center);
          if (zone === 'hub' || zone === 'rim') {
            event.preventDefault();
            studio.zoomBy(2 ** (-event.deltaY / 500), center);
          } else {
            wheelDirection = zone;
            wheelStep(event);
          }
        }}
      >
        <Ring
          radius={surfaceRadius()}
          active={active()}
          hub={hover() === 'hub' || pressed() === 'hub' || twoStep()}
          rim={hover() === 'rim' || pressed() === 'rim' || twoStep()}
          color={studio.color()}
        />
        <For each={directions}>
          {(direction) => (
            <Label
              studio={studio}
              fn={fnOf(direction)}
              direction={direction}
              radius={surfaceRadius()}
              chip={twoStep()}
              active={active() === direction}
            />
          )}
        </For>
      </div>

      <Show when={!busy() && !strip() && (twoStep() || opened.pointerType === 'keyboard')}>
        <div class={styles.hint} style={{ left: `${center.x}px`, top: `${center.y + surfaceRadius() - 12}px` }}>
          Drag the hub to pan, the ring to rotate · <kbd>←↑→↓</kbd> <kbd>Enter</kbd> <kbd>Esc</kbd>
        </div>
      </Show>

      <Show when={nav() === 'rotate'}>
        <RotateReadout studio={studio} at={center} />
      </Show>

      <Show when={valueStrip(strip())} keyed>
        {(model) => (
          <ValueStripView strip={model} studio={studio} interactive={isSticky(strip())} committed={committed} />
        )}
      </Show>
      <Show when={noteStrip(strip())} keyed>
        {(model) => <NoteStripView strip={model} />}
      </Show>
      <Show when={colorStrip(strip())} keyed>
        {(model) => <ColorStripView strip={model} interactive={isSticky(strip())} committed={committed} />}
      </Show>
      <Show when={toolStrip(strip())} keyed>
        {(model) => (
          <ToolStripView strip={model} studio={studio} interactive={isSticky(strip())} committed={committed} />
        )}
      </Show>
      <Show when={presetStrip(strip())} keyed>
        {(model) => (
          <PresetStripView strip={model} studio={studio} interactive={isSticky(strip())} committed={committed} />
        )}
      </Show>
      <Show when={layerStrip(strip())} keyed>
        {(model) => (
          <LayerStripView strip={model} studio={studio} interactive={isSticky(strip())} committed={committed} />
        )}
      </Show>
    </div>
  );

  /** The context a strip opens with. */
  function stripContext(home: Point, via: StripVia): StripContext {
    return { studio, hand: props.hand, center, home, via };
  }

  /** Opens `fn`'s strip at `home`, replacing a strip that is open; a replaced strip's previews are restored. */
  function openStrip(fn: FunctionId, home: Point, via: StripVia) {
    open?.model.cancel();
    const model = createStrip(fn, stripContext(home, via));
    setStrip({ via, model });
    setHover(undefined);
    return model;
  }

  /** Ends a drag strip: keeps its change (a finished action) or, when it ended at home, just goes back to the ring. */
  function finishDrag() {
    const changed = open?.model.commit() ?? false;
    setStrip(undefined);
    if (changed) {
      props.done();
    }
  }

  /** Closes the open strip and restores what it previewed. */
  function cancelStrip() {
    open?.model.cancel();
    setStrip(undefined);
  }

  /** Starts panning or rotating from a press on the hub or the rim; the ring hides until it ends. */
  function startNavigation(kind: NavigationKind, at: Point) {
    navigation.start(kind, at, kind === 'rotate' ? center : undefined);
    setNav(kind);
  }

  /** Ends the navigation, a finished action. */
  function endNavigation() {
    navigation.end();
    setNav(undefined);
    props.done();
  }

  /**
   * Follows the press that opened the HUD while it is still down (the right button, the pen's side button pressed
   * while touching, a finger's long press): moving it `radii.flick` px toward a direction opens that strip under it,
   * and the lift commits. Its first lift ends the following for good, as the mouse and the pen reuse the pointer id.
   */
  function followHeldPointer() {
    const isHeld = (event: PointerEvent) => holding && event.pointerId === opened.heldPointer;

    createEventListener(window, 'pointermove', (event) => {
      if (!isHeld(event)) {
        return;
      }

      const point = { x: event.clientX, y: event.clientY };
      if (open?.via === 'drag') {
        open.model.move(point);
        return;
      }

      const offset = { x: point.x - opened.at.x, y: point.y - opened.at.y };
      const reach = Math.hypot(offset.x, offset.y);
      const direction = directionToward(offset);
      setHover(reach < 10 ? undefined : direction);
      if (reach >= radii.flick) {
        openStrip(fnOf(direction), point, 'drag');
      }
    });
    createEventListener(window, 'pointerup', (event) => {
      if (!isHeld(event)) {
        return;
      }

      holding = false;
      if (open?.via === 'drag') {
        finishDrag();
        return;
      }

      setHover(undefined);
      if (opened.pointerType === 'touch') {
        setTwoStep(true);
      }
    });
    createEventListener(window, 'pointercancel', (event) => {
      if (!isHeld(event)) {
        return;
      }

      holding = false;
      if (open?.via === 'drag') {
        cancelStrip();
      }
    });
  }

  /**
   * Keys while open, consumed in the capture phase before the gallery's: arrows choose a direction (two together a
   * diagonal), Tab cycles, Enter opens the strip; inside it arrows adjust (Shift: saturation in the color picker),
   * Enter keeps the change and Escape restores it. Escape without a strip is left to the gallery, which closes.
   */
  function listenToKeys() {
    const held = new Set<string>();
    createEventListener(
      window,
      'keydown',
      (event) => {
        if (props.hidden || event.defaultPrevented) {
          return;
        }

        const current = open;
        if (event.key === 'Escape') {
          if (current) {
            event.preventDefault();
            cancelStrip();
            // The press that opened a drag strip goes on, but it no longer opens anything.
            pressZone = undefined;
            holding = false;
          }

          return;
        }

        const arrow = arrowKeys[event.key];
        if (arrow) {
          event.preventDefault();
          if (current && current.via !== 'drag') {
            current.model.step(arrow.x, -arrow.y, event.shiftKey);
          } else if (!current) {
            held.add(event.key);
            const sum = [...held].reduce(
              (total, key) => ({ x: total.x + arrowKeys[key]!.x, y: total.y + arrowKeys[key]!.y }),
              { x: 0, y: 0 }
            );
            if (sum.x !== 0 || sum.y !== 0) {
              setFocus(directionToward(sum));
            }
          }

          return;
        }

        if (event.key === 'Enter') {
          if (current && current.via !== 'drag') {
            event.preventDefault();
            const changed = current.model.commit();
            setStrip(undefined);
            if (changed && current.model.finishes) {
              props.done();
            }
          } else if (!current && focus() !== undefined) {
            event.preventDefault();
            const direction = focus()!;
            const unit = unitOf(direction);
            const anchor = { x: center.x + unit.x * radii.chip, y: center.y + unit.y * radii.chip };
            openStrip(fnOf(direction), anchor, 'key');
          }

          return;
        }

        if (event.key === 'Tab' && !current) {
          event.preventDefault();
          const from = focus() ?? (event.shiftKey ? 0 : 7);
          setFocus(((from + (event.shiftKey ? 7 : 1)) % 8) as Direction);
        }
      },
      { capture: true }
    );
    createEventListener(window, 'keyup', (event) => held.delete(event.key));
    createEventListener(window, 'blur', () => held.clear());
  }
}

/** A strip that is open, and how it was opened. */
type OpenStrip = { via: StripVia; model: AnyStrip };

/** Any open strip model. */
type AnyStrip = ReturnType<typeof createStrip>;

/** Creates the strip model of `fn`. */
function createStrip(fn: FunctionId, context: StripContext) {
  switch (fn) {
    case 'size':
    case 'opacity':
    case 'zoom':
    case 'history':
      return createValueStrip(context, fn);
    case 'color':
      return createColorStrip(context);
    case 'tools':
      return createToolStrip(context);
    case 'presets':
      return createPresetStrip(context);
    case 'layers':
      return createLayerStrip(context);
  }
}

/** Whether a strip takes presses itself (tap and key mode) rather than following the press that opened it. */
function isSticky(open: OpenStrip | undefined) {
  return open?.via !== 'drag';
}

/** The open strip's model when it is of `kind`. */
function stripOfKind<K extends AnyStrip['kind']>(kind: K) {
  return (open: OpenStrip | undefined) =>
    open?.model.kind === kind ? (open.model as Extract<AnyStrip, { kind: K }>) : undefined;
}

const valueStrip = stripOfKind('value');
const noteStrip = stripOfKind('note');
const colorStrip = stripOfKind('color');
const toolStrip = stripOfKind('tools');
const presetStrip = stripOfKind('presets');
const layerStrip = stripOfKind('layers');

/** The preset under the pen in an open preset strip. */
function presetPreview(open: OpenStrip | undefined): Preset | undefined {
  return presetStrip(open)?.preview();
}

/**
 * The brush at its real on-screen size around the center, in the brush color; `filled` shows the dab itself (with
 * opacity and hardness) while a strip that changes it is open. `preset` previews a preset instead of the brush.
 * Tools without a size show nothing.
 */
function BrushPreview(props: { studio: Studio; at: Point; preset: Preset | undefined; filled: boolean }) {
  const hasSize = () => !!props.preset || props.studio.settings().some((setting) => setting.key === 'size');
  const read = (key: string, fallback: number) => {
    const fromPreset = props.preset?.values[key];
    if (typeof fromPreset === 'number') {
      return fromPreset;
    }

    return props.studio.settings().some((setting) => setting.key === key) ? props.studio.number(key) : fallback;
  };
  const diameter = () => clamp(read('size', 0) * props.studio.view().scale, 2, 4000);

  return (
    <Show when={hasSize()}>
      <div
        class={[styles.brush, { [styles.filled!]: props.filled }]}
        style={{
          left: `${props.at.x}px`,
          top: `${props.at.y}px`,
          width: `${diameter()}px`,
          height: `${diameter()}px`,
          '--hud-color': props.studio.color(),
          '--opacity': `${read('opacity', 100)}%`,
          '--hardness': `${Math.min(99, read('hardness', 100))}%`
        }}
      />
    </Show>
  );
}

/**
 * The ring: the hub, the eight spokes (the active one longer and lit) and, when they apply, the pan arrows in the
 * hub and the rotate arrows on the rim. Thin white lines over a dark outline read over any part of the drawing.
 */
function Ring(props: { radius: number; active: Direction | undefined; hub: boolean; rim: boolean; color: string }) {
  const size = 2 * (radii.spokeTo + 10);
  const middle = size / 2;
  const spoke = (direction: Direction, to: number) => {
    const unit = unitOf(direction);
    return {
      x1: middle + unit.x * radii.spokeFrom,
      y1: middle + unit.y * radii.spokeFrom,
      x2: middle + unit.x * to,
      y2: middle + unit.y * to
    };
  };
  const arc = (from: number, to: number) => {
    const r = (radii.hub + radii.rim) / 2;
    const point = (angle: number) => ({
      x: middle + r * Math.cos((angle * Math.PI) / 180),
      y: middle + r * Math.sin((angle * Math.PI) / 180)
    });
    const a = point(from);
    const b = point(to);
    const tip = point(to + 4);
    const back = point(to - 14);
    const normal = { x: (b.x - middle) / r, y: (b.y - middle) / r };
    return `M${a.x} ${a.y}A${r} ${r} 0 0 1 ${b.x} ${b.y}M${back.x + normal.x * 3.5} ${back.y + normal.y * 3.5}L${tip.x} ${tip.y}L${back.x - normal.x * 3.5} ${back.y - normal.y * 3.5}`;
  };
  const pan =
    'M0 -8V8M-8 0H8M-2.5 -5.5 0 -8 2.5 -5.5M-2.5 5.5 0 8 2.5 5.5M-5.5 -2.5 -8 0 -5.5 2.5M5.5 -2.5 8 0 5.5 2.5';

  return (
    <svg
      class={styles.ring}
      width={size}
      height={size}
      style={{ left: `${props.radius - middle}px`, top: `${props.radius - middle}px` }}
      aria-hidden="true"
    >
      <For each={directions}>
        {(direction) => {
          const lit = () => props.active === direction;
          const line = () => spoke(direction, lit() ? radii.spokeTo + 6 : radii.spokeTo);
          return (
            <g class={[styles.spoke, { [styles.lit!]: lit() }]}>
              <line class={styles.under} {...line()} />
              <line class={styles.over} {...line()} />
            </g>
          );
        }}
      </For>
      <circle class={styles.under} cx={middle} cy={middle} r={radii.hub - 2} />
      <circle class={styles.over} cx={middle} cy={middle} r={radii.hub - 2} />
      <circle class={styles.core} cx={middle} cy={middle} r={3.2} style={{ fill: props.color }} />
      <Show when={props.hub}>
        <path class={styles.glyph} d={pan} transform={`translate(${middle} ${middle}) scale(0.95)`} />
      </Show>
      <Show when={props.rim}>
        <path class={styles.under} d={`${arc(-70, -20)}${arc(110, 160)}`} />
        <path class={styles.glyph} d={`${arc(-70, -20)}${arc(110, 160)}`} />
      </Show>
    </svg>
  );
}

/**
 * A direction's label beyond its spoke: a tiny tag with the function and its value, or in two-step mode a larger
 * chip with an icon. Anchored on the side facing the center, so labels fan out without overlapping.
 */
function Label(props: {
  studio: Studio;
  fn: FunctionId;
  direction: Direction;
  radius: number;
  chip: boolean;
  active: boolean;
}) {
  const unit = () => unitOf(props.direction);
  const diagonal = () => props.direction % 2 === 1;
  // Labels above and below stack against the diagonal ones, so they sit further out.
  const reach = () =>
    (props.chip ? radii.chip : radii.label) + (diagonal() ? -4 : props.direction % 4 === 2 ? (props.chip ? 16 : 2) : 0);
  /** The label's corner (diagonals) or edge middle (cardinals) nearest the center sits on the ray. */
  const anchor = (part: number) => (part > 0.1 ? 0 : part < -0.1 ? -100 : -50);
  const content = () => labelContent(props.fn, props.studio);

  return (
    <div
      class={[
        styles.label,
        { [styles.chip!]: props.chip, [styles.lit!]: props.active, [styles.off!]: content().off === true }
      ]}
      style={{
        left: `${props.radius + unit().x * reach()}px`,
        top: `${props.radius + unit().y * reach()}px`,
        translate: `${anchor(unit().x)}% ${anchor(unit().y)}%`
      }}
    >
      <Show when={content().swatch}>
        {(swatch) => <i class={styles.labelSwatch} style={{ background: swatch() }} />}
      </Show>
      <Show when={props.chip && content().icon}>{(icon) => <SketchIcon name={icon()} size={14} />}</Show>
      <span class={styles.labelName}>{content().name}</span>
      <Show when={content().value}>
        <b>{content().value}</b>
      </Show>
    </div>
  );
}

/** What a direction's label shows: the function, its current value, and an icon or a swatch. */
function labelContent(
  fn: FunctionId,
  studio: Studio
): { name: string; value?: string; icon?: SketchIconName; swatch?: string; off?: boolean } {
  const has = (key: string) => studio.settings().some((setting) => setting.key === key);
  switch (fn) {
    case 'size':
      return has('size')
        ? { name: 'Size', value: formatValue(studio.number('size')), icon: 'brush' }
        : { name: 'Size', value: '—', icon: 'brush', off: true };
    case 'opacity':
      return has('opacity')
        ? { name: 'Opacity', value: `${studio.number('opacity')}%`, icon: 'gradient' }
        : { name: 'Opacity', value: '—', icon: 'gradient', off: true };
    case 'color':
      return { name: 'Color', swatch: studio.color() };
    case 'tools':
      return { name: 'Tool', value: studio.toolInfo().label, icon: studio.toolInfo().icon };
    case 'presets':
      return { name: 'Preset', value: presetName(studio.preset()), icon: 'book' };
    case 'layers':
      return {
        name: 'Layer',
        value: studio.layers().find((layer) => layer.id === studio.activeLayer())?.name ?? '—',
        icon: 'layers'
      };
    case 'history':
      return {
        name: 'History',
        value:
          studio.history().undone > 0
            ? `${studio.history().done} · ↷${studio.history().undone}`
            : `${studio.history().done}`,
        icon: 'undo'
      };
    case 'zoom':
      return { name: 'Zoom', value: `${Math.round(studio.view().scale * 100)}%`, icon: 'zoom' };
  }
}

/** A preset's name by id, or a dash. */
function presetName(id: string | undefined) {
  return presets.find((preset) => preset.id === id)?.name ?? '—';
}

/** The view's angle on a thin dial around the pivot while the rim rotates the drawing. */
function RotateReadout(props: { studio: Studio; at: Point }) {
  const angle = () => props.studio.view().angle;
  return (
    <div class={styles.rotate} style={{ left: `${props.at.x}px`, top: `${props.at.y}px` }}>
      <svg width="80" height="80" viewBox="-40 -40 80 80" aria-hidden="true">
        <circle class={styles.under} r="30" />
        <circle class={styles.over} r="30" />
        <g transform={`rotate(${angle()})`}>
          <line class={styles.under} x1="0" y1="-22" x2="0" y2="-38" />
          <line class={styles.needle} x1="0" y1="-22" x2="0" y2="-38" />
        </g>
      </svg>
      <b>{`${Math.round(angle())}°`}</b>
    </div>
  );
}

const arrowKeys: Record<string, Point> = {
  ArrowRight: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }
};
