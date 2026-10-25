import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { createPickerPixels } from '../../shared/ui/createPickerPixels';
import styles from './ColorWheel.module.css';
import type { ColorWheelSettings } from './createColorWheelSettings';
import { hexToWheel, wheelToHex, type WheelColor } from './oklch';
import { paintDisk } from './paintDisk';
import {
  clampToPolygon,
  editableMask,
  fromDisk,
  gamutMasks,
  harmonies,
  harmonyColors,
  insertMaskCorner,
  maskPolygon,
  maxMaskCorners,
  moveMaskCorner,
  removeMaskCorner,
  toDisk,
  type DiskPoint,
  type GamutMask,
  type Harmony
} from './wheelGeometry';

/**
 * A perceptual color wheel, after Coolorus: hue around the disk and saturation from the center, at the lightness of
 * the slider below, all in OKLCH, so turning the hue keeps the perceived lightness. A harmony marks the scheme's other
 * colors, which a press picks; a gamut mask dims the colors outside it and keeps picks inside, and its handle on the
 * rim turns it. Dragging a mask's corner makes it a custom mask of that shape; dragging the dot in the middle of an edge
 * adds a corner there, and a double tap on a corner removes it. Edits apply live through `onChange`; `onSettle` runs when a drag or keyboard change ends.
 *
 * Its pieces stand on their own too (`WheelDisk`, `WheelLightness`, `HarmonyField`, `MaskField`), for hosts that lay
 * them out apart; they then share one `WheelColor`.
 */
export function ColorWheel(props: {
  /** `#rrggbb` color being edited. */
  color: string;
  onChange: (color: string) => void;
  onSettle: () => void;
  settings: Omit<ColorWheelSettings, 'picker'>;
  onSettings: (patch: Partial<ColorWheelSettings>) => void;
}) {
  // Keeps the written color while it still produces `color`, so the hue survives grays.
  const [wheel, setWheel] = createSignal<WheelColor>((previous) =>
    previous && wheelToHex(previous) === props.color ? previous : hexToWheel(props.color, previous)
  );
  const edit = (next: WheelColor) => {
    setWheel(next);
    props.onChange(wheelToHex(next));
  };

  return (
    <div class={styles.wheel} role="group" aria-label="Color wheel">
      <WheelDisk
        wheel={wheel()}
        color={props.color}
        onEdit={edit}
        onSettle={props.onSettle}
        settings={props.settings}
        onSettings={props.onSettings}
      />
      <WheelLightness wheel={wheel()} color={props.color} onEdit={edit} onSettle={props.onSettle} />
      <div class={styles.guides}>
        <HarmonyField settings={props.settings} onSettings={props.onSettings} />
        <MaskField settings={props.settings} onSettings={props.onSettings} />
      </div>
    </div>
  );
}

/**
 * The wheel's disk alone, at most 248 CSS px across and square: hue and saturation of `wheel` at its lightness, with
 * the harmony's colors and the gamut mask and its handles; see `ColorWheel`. Presses report the edited color through
 * `onEdit`.
 */
export function WheelDisk(props: {
  wheel: WheelColor;
  /** `#rrggbb` of `wheel`, for the thumb. */
  color: string;
  onEdit: (wheel: WheelColor) => void;
  onSettle: () => void;
  settings: Omit<ColorWheelSettings, 'picker'>;
  onSettings: (patch: Partial<ColorWheelSettings>) => void;
}) {
  const lightness = createMemo(() => props.wheel.l);
  const mask = () => maskPolygon(props.settings.mask, props.settings.maskAngle, props.settings.customMask);
  let canvas!: HTMLCanvasElement;
  let disk!: SVGSVGElement;
  const pixels = createPickerPixels(() => canvas, 600);
  /** The lightness waiting to be painted at the next animation frame. */
  let pending: number | undefined;
  let frame: number | undefined;

  // Repaints the disk at most once per animation frame while the lightness changes.
  createEffect(
    () => ({ lightness: lightness(), pixels: pixels() }),
    (next) => {
      pending = next.lightness;
      frame ??= requestAnimationFrame(() => {
        frame = undefined;
        if (pixels() > 0) {
          paintDisk(canvas, pending!, pixels());
        }
      });
    }
  );
  onCleanup(() => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }
  });

  const edit = (next: WheelColor) => props.onEdit(next);
  const diskPoint = (event: PointerEvent): DiskPoint => {
    const box = disk.getBoundingClientRect();
    const scale = (box.width / 2) * diskScale;
    return {
      x: (event.clientX - box.left - box.width / 2) / scale,
      y: (event.clientY - box.top - box.height / 2) / scale
    };
  };
  const pickDisk = drag((event) => edit({ ...props.wheel, ...fromDisk(clampToPolygon(diskPoint(event), mask())) }), props);
  const turnMask = drag((event) => {
    const { h } = fromDisk(diskPoint(event));
    props.onSettings({ maskAngle: Math.round(h) });
  }, props);

  return (
    <div class={styles.disk}>
      <canvas ref={canvas} aria-hidden="true" />
      <svg
        ref={disk}
        viewBox={`${-1 / diskScale} ${-1 / diskScale} ${2 / diskScale} ${2 / diskScale}`}
        role="slider"
        tabindex="0"
        aria-label="Hue and saturation"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(props.wheel.s * 100)}
        aria-valuetext={`Hue ${Math.round(props.wheel.h)}°, saturation ${Math.round(props.wheel.s * 100)}%`}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1;
          const turn = { ArrowLeft: -step, ArrowRight: step }[event.key];
          const grow = { ArrowUp: step / 100, ArrowDown: -step / 100 }[event.key];
          if (turn === undefined && grow === undefined) {
            return;
          }

          event.preventDefault();
          const next = { ...props.wheel, h: (props.wheel.h + (turn ?? 0) + 360) % 360, s: props.wheel.s + (grow ?? 0) };
          edit({ ...next, ...fromDisk(clampToPolygon(toDisk({ ...next, s: Math.max(0, next.s) }), mask())) });
        }}
        onBlur={() => props.onSettle()}
        {...pickDisk}
      >
        <Show when={mask().length >= 3}>
          <path
            class={styles.outside}
            fill-rule="evenodd"
            d={`M -1 0 A 1 1 0 1 0 1 0 A 1 1 0 1 0 -1 0 Z ${path(mask())}`}
          />
          <path class={styles.mask} d={path(mask())} />
          <Show when={editableMask(props.settings.mask, props.settings.customMask)}>
            {/* Rows by position keep each corner's element, and its captured pointer, while the mask changes. */}
            <For each={mask()} keyed={false}>
              {(corner, index) => {
                /** When this corner was last pressed, to recognize a double tap. */
                let pressed = -Infinity;
                // Created once: a spread re-runs as the corner moves, which would forget the captured pointer.
                const handlers = drag(
                  (event) =>
                    props.onSettings({
                      mask: 'custom',
                      maskAngle: 0,
                      customMask: moveMaskCorner(mask(), index, diskPoint(event))
                    }),
                  props,
                  (event) => {
                    const previous = pressed;
                    pressed = event.timeStamp;
                    if (event.timeStamp - previous > doubleTapMs || mask().length <= 3) {
                      return true;
                    }

                    // A double tap removes the corner instead of dragging it; the rows after it shift by one.
                    pressed = -Infinity;
                    props.onSettings({ mask: 'custom', maskAngle: 0, customMask: removeMaskCorner(mask(), index) });
                    props.onSettle();
                    return false;
                  }
                );
                return (
                  <rect
                    class={styles.maskCorner}
                    x={corner().x - 0.035}
                    y={corner().y - 0.035}
                    width={0.07}
                    height={0.07}
                    role="slider"
                    aria-label="Mask corner"
                    {...handlers}
                  />
                );
              }}
            </For>
            <Show when={mask().length < maxMaskCorners}>
              <For each={mask()} keyed={false}>
                {(corner, index) => {
                  const next = () => mask()[(index + 1) % mask().length]!;
                  /** Whether this drag has added its corner, which the rest of the drag moves. */
                  let added = false;
                  const handlers = drag(
                    (event) => {
                      const point = diskPoint(event);
                      const customMask = added
                        ? moveMaskCorner(mask(), index + 1, point)
                        : insertMaskCorner(mask(), index, point);
                      added = true;
                      props.onSettings({ mask: 'custom', maskAngle: 0, customMask });
                    },
                    props,
                    () => {
                      added = false;
                      return true;
                    }
                  );
                  return (
                    <circle
                      class={styles.maskInsert}
                      cx={(corner().x + next().x) / 2}
                      cy={(corner().y + next().y) / 2}
                      r={0.022}
                      role="button"
                      aria-label="Add mask corner"
                      {...handlers}
                    />
                  );
                }}
              </For>
            </Show>
          </Show>
          <circle
            class={styles.maskHandle}
            cx={toDisk({ s: 1.07, h: props.settings.maskAngle }).x}
            cy={toDisk({ s: 1.07, h: props.settings.maskAngle }).y}
            r={0.055}
            role="slider"
            aria-label="Mask rotation"
            aria-valuemin="0"
            aria-valuemax="359"
            aria-valuenow={Math.round(props.settings.maskAngle)}
            {...turnMask}
          />
        </Show>
        <For each={harmonyColors(props.wheel, props.settings.harmony)}>
          {(color) => (
            <circle
              class={styles.harmony}
              cx={toDisk(color).x}
              cy={toDisk(color).y}
              r={0.065}
              fill={wheelToHex(color)}
              role="button"
              aria-label={`Use ${wheelToHex(color)}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                edit(color);
                props.onSettle();
              }}
            />
          )}
        </For>
        <circle class={styles.thumb} cx={toDisk(props.wheel).x} cy={toDisk(props.wheel).y} r={0.075} fill={props.color} />
      </svg>
    </div>
  );
}

/** The wheel's lightness slider alone, its track running through the lightness range at `wheel`'s hue. */
export function WheelLightness(props: {
  wheel: WheelColor;
  /** `#rrggbb` of `wheel`, for the thumb. */
  color: string;
  onEdit: (wheel: WheelColor) => void;
  onSettle: () => void;
}) {
  let track!: HTMLDivElement;
  const edit = (next: WheelColor) => props.onEdit(next);
  const pickLightness = drag((event) => {
    const box = track.getBoundingClientRect();
    edit({ ...props.wheel, l: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) });
  }, props);

  return (
    <div
      ref={track}
      class={styles.lightness}
      style={{ background: lightnessGradient(props.wheel) }}
      role="slider"
      tabindex="0"
      aria-label="Lightness"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={Math.round(props.wheel.l * 100)}
      onKeyDown={(event) => {
        const delta = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
        if (delta !== undefined) {
          event.preventDefault();
          edit({ ...props.wheel, l: Math.min(1, Math.max(0, props.wheel.l + (delta * (event.shiftKey ? 10 : 1)) / 100)) });
        }
      }}
      onBlur={() => props.onSettle()}
      {...pickLightness}
    >
      <span class={styles.lightnessThumb} style={{ left: `${props.wheel.l * 100}%`, background: props.color }} />
    </div>
  );
}

/** The wheel's harmony as a labelled list: the scheme whose other colors the disk marks. */
export function HarmonyField(props: {
  settings: Omit<ColorWheelSettings, 'picker'>;
  onSettings: (patch: Partial<ColorWheelSettings>) => void;
}) {
  return (
    <label>
      <span>Harmony</span>
      <select
        value={props.settings.harmony}
        onChange={(event) => props.onSettings({ harmony: event.currentTarget.value as Harmony })}
      >
        <For each={Object.entries(harmonies)}>{([id, { label }]) => <option value={id}>{label}</option>}</For>
      </select>
    </label>
  );
}

/** The wheel's gamut mask as a labelled list; Custom once a mask has been drawn. */
export function MaskField(props: {
  settings: Omit<ColorWheelSettings, 'picker'>;
  onSettings: (patch: Partial<ColorWheelSettings>) => void;
}) {
  return (
    <label>
      <span>Gamut mask</span>
      <select
        value={props.settings.mask}
        onChange={(event) => props.onSettings({ mask: event.currentTarget.value as GamutMask })}
      >
        <For each={Object.entries(gamutMasks)}>{([id, { label }]) => <option value={id}>{label}</option>}</For>
        <option value="custom" disabled={props.settings.customMask.length < 3}>
          Custom
        </option>
      </select>
    </label>
  );
}

/**
 * Pointer handlers that capture the first pointer and report its moves until release; further pointers, such as a
 * resting palm, are ignored. `onSettle` runs when the drag ends.
 */
function drag(
  move: (event: PointerEvent) => void,
  props: { onSettle: () => void },
  /** Runs first on each press; returning false leaves the press alone instead of starting a drag. */
  begin: (event: PointerEvent) => boolean = () => true
) {
  let pointer: number | undefined;
  const finish = (event: PointerEvent) => {
    if (event.pointerId === pointer) {
      pointer = undefined;
      props.onSettle();
    }
  };

  return {
    onPointerDown(event: PointerEvent & { currentTarget: Element }) {
      if (pointer !== undefined || (event.pointerType === 'mouse' && event.button !== 0)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (!begin(event)) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      pointer = event.pointerId;
      move(event);
    },
    onPointerMove(event: PointerEvent) {
      if (event.pointerId === pointer) {
        move(event);
      }
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish
  };
}

/** A gradient through the lightness range at the color's hue and saturation. */
function lightnessGradient(color: WheelColor) {
  const stops = Array.from({ length: 11 }, (_, index) => wheelToHex({ ...color, l: index / 10 }));
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/** An SVG path through disk points. */
function path(points: readonly DiskPoint[]) {
  return `M ${points.map(({ x, y }) => `${x.toFixed(4)} ${y.toFixed(4)}`).join(' L ')} Z`;
}

/** Longest pause between the two presses of a double tap on a mask corner. */
const doubleTapMs = 350;

/** The disk's radius as a share of the overlay's half-width; the rest holds the mask handle. */
const diskScale = 0.86;
