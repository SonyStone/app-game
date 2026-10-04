import type { Brush } from '@app-game/paint-core/brush';
import type { JSX } from '@solidjs/web';
import { createSignal, For, Show, untrack } from 'solid-js';
import styles from './ColorPanel.module.css';
import { createRecentColors } from './createRecentColors';
import { hexToHsv, type Hsv, hsvToHex, luminance, parseHex } from './hsv';

/**
 * Foreground and background color picker sized for mouse, finger and stylus: a saturation/brightness plane and a hue
 * strip that keep tracking a captured pointer outside their bounds, a magnified color bubble above a finger, arrow-key
 * control, hex entry, recent colors and a palette. Edits apply live through `onChange`; a color joins the recents when
 * a drag ends, a slider loses focus, or a swatch or hex value is applied.
 */
export function ColorPanel(props: {
  /** Settings captured by the next stroke; `color` and `backgroundColor` are edited. */
  brush: Brush;
  /** Receives `color` or `backgroundColor` patches; the caller merges them into the brush. */
  onChange: (patch: Partial<Brush>) => void;
  /**
   * Another way to choose the color, such as a color wheel, offered with a switch in place of the saturation plane
   * and hue strip. `render` receives the edited color, `onChange` for live edits and `onSettle` for when an edit ends.
   */
  alternative?: {
    label: string;
    shown: boolean;
    onShownChange: (shown: boolean) => void;
    render: (control: { color: string; onChange: (color: string) => void; onSettle: () => void }) => JSX.Element;
  };
}) {
  const [target, setTarget] = createSignal<ColorTarget>('color');
  const hexOf = (which: ColorTarget) =>
    which === 'color' ? props.brush.color : (props.brush.backgroundColor ?? DEFAULT_BACKGROUND);
  const hex = () => hexOf(target());
  // Keeps the written HSV while it still produces the brush color, so hue and saturation survive grays and black.
  const [hsv, setHsv] = createSignal<Hsv>((previous) =>
    previous && hsvToHex(previous) === hex() ? previous : hexToHsv(hex(), previous)
  );
  const opened = untrack(() => ({ color: hexOf('color'), backgroundColor: hexOf('backgroundColor') }));
  const recent = createRecentColors();
  const [drag, setDrag] = createSignal<{ part: 'plane' | 'hue'; touch: boolean }>();
  /** The color written by the edit in progress; `hex()` shows it only after the next flush. */
  let edited: string | undefined;

  const edit = (next: Hsv) => {
    edited = hsvToHex(next);
    setHsv(next);
    props.onChange({ [target()]: edited });
  };
  const apply = (color: string) => {
    props.onChange({ [target()]: color });
    recent.remember(color);
  };
  const settle = () => {
    if (edited) {
      recent.remember(edited);
      edited = undefined;
    }
  };
  const dragHandlers = (part: 'plane' | 'hue', move: (x: number, y: number) => void) =>
    pointerDrag({
      start: (touch) => setDrag({ part, touch }),
      move,
      end: () => {
        setDrag(undefined);
        settle();
      }
    });
  // Created once: the handlers hold the captured pointer, and a spread expression re-runs when the element's
  // reactive props change, which would forget it mid-drag.
  const planeDrag = dragHandlers('plane', (x, y) => edit({ ...hsv(), s: x, v: 1 - y }));
  const hueDrag = dragHandlers('hue', (x) => edit({ ...hsv(), h: Math.min(x * 360, 359.9) }));

  return (
    <section class={styles.picker}>
      <div class={styles.targets} role="radiogroup" aria-label="Edited color">
        <For each={TARGETS}>
          {(item) => (
            <button
              role="radio"
              aria-checked={target() === item.id ? 'true' : 'false'}
              class={styles.target}
              onClick={() => setTarget(item.id)}
            >
              <span class={styles.chip} style={{ background: hexOf(item.id) }} />
              <span>
                {item.label}
                <code>{hexOf(item.id).toUpperCase()}</code>
              </span>
            </button>
          )}
        </For>
        <button
          class={styles.iconButton}
          aria-label="Swap colors"
          title="Swap colors (X)"
          onClick={() => props.onChange({ color: hexOf('backgroundColor'), backgroundColor: hexOf('color') })}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
          </svg>
        </button>
      </div>

      <Show when={props.alternative}>
        {(alternative) => (
          <div class={styles.pickers} role="radiogroup" aria-label="Color picker">
            <button
              role="radio"
              aria-checked={alternative().shown ? 'false' : 'true'}
              onClick={() => alternative().onShownChange(false)}
            >
              Square
            </button>
            <button
              role="radio"
              aria-checked={alternative().shown ? 'true' : 'false'}
              onClick={() => alternative().onShownChange(true)}
            >
              {alternative().label}
            </button>
          </div>
        )}
      </Show>

      <Show
        when={props.alternative?.shown && props.alternative}
        fallback={
          <>
            <div
              class={[styles.plane, { [styles.dragging!]: drag()?.part === 'plane' }]}
              style={{ '--hue': `${hsv().h}` }}
              role="slider"
              tabindex="0"
              aria-label="Saturation and brightness"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.round(hsv().v * 100)}
              aria-valuetext={`Saturation ${Math.round(hsv().s * 100)}%, brightness ${Math.round(hsv().v * 100)}%`}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 0.1 : 0.01;
                const delta = ARROWS[event.key];
                if (delta) {
                  event.preventDefault();
                  edit({ ...hsv(), s: clamp(hsv().s + delta[0] * step), v: clamp(hsv().v + delta[1] * step) });
                }
              }}
              onBlur={settle}
              {...planeDrag}
            >
              <Thumb x={hsv().s} y={1 - hsv().v} color={hex()} loupe={drag()?.part === 'plane' && drag()!.touch} />
            </div>

            <div
              class={[styles.hue, { [styles.dragging!]: drag()?.part === 'hue' }]}
              role="slider"
              tabindex="0"
              aria-label="Hue"
              aria-valuemin="0"
              aria-valuemax="359"
              aria-valuenow={Math.min(359, Math.round(hsv().h))}
              onKeyDown={(event) => {
                const delta = ARROWS[event.key];
                const h =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? 359
                      : delta && hsv().h + (delta[0] || delta[1]) * (event.shiftKey ? 10 : 1);
                if (h !== undefined) {
                  event.preventDefault();
                  edit({ ...hsv(), h: ((h % 360) + 360) % 360 });
                }
              }}
              onBlur={settle}
              {...hueDrag}
            >
              <Thumb
                x={hsv().h / 360}
                y={0.5}
                color={hsvToHex({ h: hsv().h, s: 1, v: 1 })}
                loupe={drag()?.part === 'hue' && drag()!.touch}
              />
            </div>
          </>
        }
      >
        {(alternative) =>
          alternative().render({
            get color() {
              return hex();
            },
            onChange(color) {
              edited = color;
              props.onChange({ [target()]: color });
            },
            onSettle: settle
          })
        }
      </Show>

      <div class={styles.valueRow}>
        <button
          class={styles.compare}
          aria-label={`Restore ${opened[target()].toUpperCase()}`}
          title="Tap the left half to restore the color from when the panel opened"
          onClick={() => apply(opened[target()])}
        >
          <span style={{ background: opened[target()] }} />
          <span style={{ background: hex() }} />
        </button>
        <label class={styles.hex}>
          <span>#</span>
          <input
            aria-label="Hex color"
            value={hex().slice(1).toUpperCase()}
            maxlength={7}
            spellcheck={false}
            autocomplete="off"
            enterkeyhint="done"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
            onChange={(event) => {
              const color = parseHex(event.currentTarget.value);
              if (color) {
                apply(color);
              }

              event.currentTarget.value = (color ?? hex()).slice(1).toUpperCase();
            }}
          />
        </label>
        <Show when={eyeDropper() !== undefined}>
          <button
            class={styles.iconButton}
            aria-label="Pick color from screen"
            title="Pick color from screen"
            onClick={() => {
              void new (eyeDropper()!)()
                .open()
                .then((result) => apply(result.sRGBHex.toLowerCase()))
                .catch(() => {});
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 4h18v12H3ZM8 20h8M12 16v4" />
            </svg>
          </button>
        </Show>
      </div>

      <Show when={recent.colors().length}>
        <h3 class={styles.heading}>Recent</h3>
        <Swatches colors={recent.colors()} selected={hex()} onPick={apply} />
      </Show>
      <h3 class={styles.heading}>Palette</h3>
      <Swatches colors={PALETTE} selected={hex()} onPick={apply} />

      <button
        class={styles.reset}
        title="Reset colors (D)"
        onClick={() => props.onChange({ color: '#000000', backgroundColor: DEFAULT_BACKGROUND })}
      >
        Reset to black and white
      </button>
      <p class={styles.note}>
        Background is used by Color Dynamics and Pencil Auto Erase. It does not fill the canvas.
      </p>
    </section>
  );
}

type ColorTarget = 'color' | 'backgroundColor';

const DEFAULT_BACKGROUND = '#ffffff';

const TARGETS: { id: ColorTarget; label: string }[] = [
  { id: 'color', label: 'Foreground' },
  { id: 'backgroundColor', label: 'Background' }
];

/** Arrow key directions as `[x, y]` with up increasing the value. */
const ARROWS: Record<string, [number, number] | undefined> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1]
};

/**
 * Pointer handlers for a 2D control. The first pointer is captured so dragging continues outside the element; its
 * position is reported normalized to the element's box and clamped to `[0, 1]`. Further pointers are ignored, so a
 * resting palm or second finger does not make the thumb jump.
 */
function pointerDrag(handlers: {
  /** Receives whether the pointer is a finger, which hides the thumb under the fingertip. */
  start: (touch: boolean) => void;
  move: (x: number, y: number) => void;
  end: () => void;
}) {
  let pointer: number | undefined;
  let box: DOMRect | undefined;
  const report = (event: PointerEvent) => {
    if (box) {
      handlers.move(clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height));
    }
  };
  const finish = (event: PointerEvent) => {
    if (event.pointerId === pointer) {
      pointer = undefined;
      handlers.end();
    }
  };

  return {
    onPointerDown(event: PointerEvent & { currentTarget: HTMLElement }) {
      if (pointer !== undefined || (event.pointerType === 'mouse' && event.button !== 0)) {
        return;
      }

      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      pointer = event.pointerId;
      box = event.currentTarget.getBoundingClientRect();
      handlers.start(event.pointerType === 'touch');
      report(event);
    },
    onPointerMove(event: PointerEvent) {
      if (event.pointerId === pointer) {
        report(event);
      }
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish
  };
}

/**
 * Draggable marker at normalized `x`, `y`. With `loupe`, a magnified bubble of `color` floats above it so the color
 * stays visible under a finger.
 */
function Thumb(props: { x: number; y: number; color: string; loupe: boolean }) {
  return (
    <span
      class={[styles.thumb, { [styles.light!]: luminance(props.color) > 0.5 }]}
      style={{ left: `${props.x * 100}%`, top: `${props.y * 100}%`, background: props.color }}
    >
      <Show when={props.loupe}>
        <span class={styles.loupe} style={{ background: props.color }} />
      </Show>
    </span>
  );
}

/** Round color buttons; the one equal to `selected` is outlined. */
function Swatches(props: { colors: readonly string[]; selected: string; onPick: (color: string) => void }) {
  return (
    <div class={styles.swatches}>
      <For each={props.colors}>
        {(color) => (
          <button
            aria-label={`Set color ${color}`}
            title={color.toUpperCase()}
            style={{ background: color }}
            class={{ [styles.selected!]: props.selected === color }}
            onClick={() => props.onPick(color)}
          />
        )}
      </For>
    </div>
  );
}

const PALETTE = [
  '#1e252b',
  '#ffffff',
  '#ff0000',
  '#00e85d',
  '#167bd7',
  '#ffce32',
  '#a9624a',
  '#9183a1',
  '#344b66',
  '#77856d',
  '#e78db0',
  '#ece6da'
] as const;

/** The browser's screen color picker constructor, where supported (Chromium desktop). */
function eyeDropper() {
  return (globalThis as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}
