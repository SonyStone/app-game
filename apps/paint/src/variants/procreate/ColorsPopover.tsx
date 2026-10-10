import { createEffect, createSignal, For, Match, Switch } from 'solid-js';
import { hexToHsv, hsvToHex, luminance, type Hsv } from '../../features/color/hsv';
import styles from './ColorsPopover.module.css';
import { discColor, discPoint, paintDisc } from '../../shared/ui/colorDisc';
import { PopoverHeader } from './Popover';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import { Slider } from './Slider';

/**
 * Procreate's Colors popover. The current color and the secondary color sit at the top right; tapping the secondary
 * one swaps them. The Disc mode edits the color on a hue ring around a saturation and brightness disc, the Classic
 * mode on a saturation and brightness square with hue, saturation and brightness sliders. Under both, the recently
 * used colors and a default palette. Drags change the color live through `onInput`; `onCommit` receives the color
 * a drag ended on or a swatch chose, for the color history.
 */
export function ColorsPopover(props: {
  color: string;
  secondary: string;
  recent: readonly string[];
  mode: ColorMode;
  onMode: (mode: ColorMode) => void;
  onInput: (color: string) => void;
  onCommit: (color: string) => void;
  onSwap: () => void;
}) {
  // Keeps its own HSV while the color matches it, so that greys and black keep the hue they were dragged from.
  const [hsv, setHsv] = createSignal<Hsv>((previous) =>
    previous && hsvToHex(previous) === props.color ? previous : hexToHsv(props.color, previous)
  );
  /** Applies a color edited in this popover; `next` is passed on since a signal read in the same event is stale. */
  const edit = (next: Hsv) => {
    setHsv(next);
    props.onInput(hsvToHex(next));
  };
  const choose = (hex: string) => {
    props.onInput(hex);
    props.onCommit(hex);
  };

  return (
    <>
      <PopoverHeader title="Colors">
        <button
          class={[styles.swatch, styles.secondary]}
          style={{ background: props.secondary }}
          aria-label="Secondary color: swap with the current color"
          title="Secondary color · tap to swap"
          onClick={() => props.onSwap()}
        />
        <span class={styles.swatch} style={{ background: props.color }} role="img" aria-label="Current color" />
      </PopoverHeader>
      <div class={styles.content}>
        <Switch>
          <Match when={props.mode === 'disc'}>
            <ColorDisc hsv={hsv()} onEdit={edit} onCommit={props.onCommit} />
          </Match>
          <Match when={props.mode === 'classic'}>
            <ClassicPicker hsv={hsv()} onEdit={edit} onCommit={props.onCommit} />
          </Match>
        </Switch>
        <section class={styles.group} aria-label="History">
          <h3>History</h3>
          <div class={styles.swatchRow}>
            <For each={props.recent.slice(0, swatchColumns)} fallback={<p class={styles.empty}>No colors yet</p>}>
              {(hex) => (
                <button
                  class={styles.chip}
                  data-current={hex === props.color ? '' : undefined}
                  style={{ background: hex }}
                  aria-label={hex}
                  title={hex}
                  onClick={() => choose(hex)}
                />
              )}
            </For>
          </div>
        </section>
        <section class={styles.group} aria-label="Default palette">
          <h3>Default</h3>
          <div class={styles.palette}>
            <For each={palette}>
              {(hex) => (
                <button
                  class={styles.chip}
                  data-current={hex === props.color ? '' : undefined}
                  style={{ background: hex }}
                  aria-label={hex}
                  title={hex}
                  onClick={() => choose(hex)}
                />
              )}
            </For>
          </div>
        </section>
      </div>
      <nav class={styles.tabs} aria-label="Color mode">
        <For each={modes}>
          {(mode) => (
            <button aria-pressed={props.mode === mode.id ? 'true' : 'false'} onClick={() => props.onMode(mode.id)}>
              {mode.label}
            </button>
          )}
        </For>
      </nav>
    </>
  );
}

/** How the Colors popover edits the color. */
export type ColorMode = 'disc' | 'classic';

const modes: { id: ColorMode; label: string }[] = [
  { id: 'disc', label: 'Disc' },
  { id: 'classic', label: 'Classic' }
];

/**
 * The Disc: press on the ring to turn the hue, inside it to pick saturation and brightness. The color follows the
 * press and is committed when it lifts.
 */
function ColorDisc(props: { hsv: Hsv; onEdit: (hsv: Hsv) => void; onCommit: (color: string) => void }) {
  let canvas!: HTMLCanvasElement;
  /** What the press in progress edits, chosen where it started. */
  let part: 'hue' | 'disc' = 'disc';

  createEffect(
    () => props.hsv.h,
    (hue) => {
      const frame = requestAnimationFrame(() =>
        paintDisc(canvas, hue, Math.round(innerRadius * 2 * Math.min(2, devicePixelRatio || 1)))
      );
      return () => cancelAnimationFrame(frame);
    }
  );

  /** The press's offset from the disc's center, in the disc's unscaled pixels. */
  const offset = (press: Press) => {
    const rect = press.target.getBoundingClientRect();
    const unit = discSize / rect.width;
    return {
      dx: (press.point.x - (rect.left + rect.width / 2)) * unit,
      dy: (press.point.y - (rect.top + rect.height / 2)) * unit
    };
  };
  const apply = (press: Press) => {
    const { dx, dy } = offset(press);
    if (part === 'hue') {
      props.onEdit({ ...props.hsv, h: ((((Math.atan2(dx, -dy) * 180) / Math.PI) % 360) + 360) % 360 });
      return;
    }

    const { saturation, value } = discColor(dx / innerRadius, dy / innerRadius);
    props.onEdit({ ...props.hsv, s: saturation, v: value });
  };
  // Created once: a spread of a call would be re-evaluated, and lose the press, when another attribute changes.
  const press = pressHandlers({
    start: (started) => {
      const { dx, dy } = offset(started);
      part = Math.hypot(dx, dy) >= innerRadius + ringGap / 2 ? 'hue' : 'disc';
      apply(started);
    },
    move: apply,
    // The press's last edit came in an earlier event, so the color read here is current.
    end: () => props.onCommit(hsvToHex(props.hsv))
  });
  const hueThumb = () => {
    const angle = (props.hsv.h * Math.PI) / 180;
    return { x: Math.sin(angle) * ringMiddle, y: -Math.cos(angle) * ringMiddle };
  };
  const discThumb = () => {
    const { u, v } = discPoint(props.hsv.s, props.hsv.v);
    return { x: u * innerRadius, y: v * innerRadius };
  };

  return (
    <div class={styles.disc} role="group" aria-label="Color disc" {...press}>
      <span class={styles.ring} />
      <span class={styles.inner}>
        <canvas ref={canvas} />
      </span>
      <span
        class={styles.thumb}
        style={{
          left: `calc(50% + ${hueThumb().x}px)`,
          top: `calc(50% + ${hueThumb().y}px)`,
          background: hsvToHex({ h: props.hsv.h, s: 1, v: 1 })
        }}
      />
      <span
        class={[styles.thumb, styles.discThumb]}
        style={{
          left: `calc(50% + ${discThumb().x}px)`,
          top: `calc(50% + ${discThumb().y}px)`,
          background: hsvToHex(props.hsv)
        }}
      />
    </div>
  );
}

/** The Disc's diameter, the ring's width and the gap between the ring and the inner disc, in CSS pixels. */
const discSize = 248;
const ringWidth = 26;
const ringGap = 8;
const innerRadius = discSize / 2 - ringWidth - ringGap;
const ringMiddle = discSize / 2 - ringWidth / 2;

/**
 * Classic mode: a square of saturation (left to right) and brightness (bottom to top) for the current hue, then
 * hue, saturation and brightness sliders.
 */
function ClassicPicker(props: { hsv: Hsv; onEdit: (hsv: Hsv) => void; onCommit: (color: string) => void }) {
  const apply = (press: Press) => {
    const rect = press.target.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (press.point.x - rect.left) / rect.width));
    const v = Math.min(1, Math.max(0, 1 - (press.point.y - rect.top) / rect.height));
    props.onEdit({ ...props.hsv, s, v });
  };
  const press = pressHandlers({ start: apply, move: apply, end: () => props.onCommit(hsvToHex(props.hsv)) });
  /** Applies a slider's final value and commits it, passing the new color on rather than reading it back. */
  const settle = (next: Hsv) => {
    props.onEdit(next);
    props.onCommit(hsvToHex(next));
  };
  const pure = () => hsvToHex({ h: props.hsv.h, s: 1, v: 1 });
  const color = () => hsvToHex(props.hsv);

  return (
    <div class={styles.classic}>
      <div
        class={styles.square}
        role="group"
        aria-label="Saturation and brightness"
        style={{ '--hue': pure() }}
        {...press}
      >
        <span
          class={[styles.thumb, styles.squareThumb]}
          data-light={luminance(color()) > 0.5 ? '' : undefined}
          style={{ left: `${props.hsv.s * 100}%`, top: `${(1 - props.hsv.v) * 100}%`, background: color() }}
        />
      </div>
      <div class={styles.sliderRow}>
        <span>Hue</span>
        <Slider
          label="Hue"
          min={0}
          max={359}
          value={props.hsv.h}
          valueText={`${Math.round(props.hsv.h)}°`}
          background="linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
          onInput={(h) => props.onEdit({ ...props.hsv, h })}
          onChange={(h) => settle({ ...props.hsv, h })}
        />
      </div>
      <div class={styles.sliderRow}>
        <span>Saturation</span>
        <Slider
          label="Saturation"
          min={0}
          max={1}
          value={props.hsv.s}
          valueText={`${Math.round(props.hsv.s * 100)} %`}
          background={`linear-gradient(to right, ${hsvToHex({ ...props.hsv, s: 0 })}, ${hsvToHex({ ...props.hsv, s: 1 })})`}
          onInput={(s) => props.onEdit({ ...props.hsv, s })}
          onChange={(s) => settle({ ...props.hsv, s })}
        />
      </div>
      <div class={styles.sliderRow}>
        <span>Brightness</span>
        <Slider
          label="Brightness"
          min={0}
          max={1}
          value={props.hsv.v}
          valueText={`${Math.round(props.hsv.v * 100)} %`}
          background={`linear-gradient(to right, #000, ${hsvToHex({ ...props.hsv, v: 1 })})`}
          onInput={(v) => props.onEdit({ ...props.hsv, v })}
          onChange={(v) => settle({ ...props.hsv, v })}
        />
      </div>
    </div>
  );
}

/** Swatches per row of the history and the palette. */
const swatchColumns = 10;

/** Procreate-like default palette: neutrals, earth tones, then muted and saturated hues, ten per row. */
const palette = [
  '#000000',
  '#262626',
  '#4d4d4d',
  '#737373',
  '#999999',
  '#bfbfbf',
  '#e0e0e0',
  '#ffffff',
  '#5a3a22',
  '#a7795a',
  '#d9c4a5',
  '#efeae1',
  '#c4463a',
  '#e0703a',
  '#e6b93d',
  '#f2d06b',
  '#7aa05a',
  '#3d8a7a',
  '#9fd3c7',
  '#3d6a8c',
  '#8fb3e0',
  '#5a4e9a',
  '#9a4e8a',
  '#e88aa0',
  '#d7263d',
  '#f46036',
  '#2e86ab',
  '#1b998b',
  '#344b66',
  '#262329'
] as const;
