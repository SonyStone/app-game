import { createResizeObserver } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createMemo, createSignal, For, Show, useContext } from 'solid-js';
import { HarmonyField, MaskField, WheelDisk } from '../../features/color-wheel';
import wheelStyles from '../../features/color-wheel/ColorWheel.module.css';
import { hexToHsv, hsvToHex, luminance, type Hsv } from '../../features/color/hsv';
import { CoolorusWheel } from '../../features/coolorus-wheel';
import { HueTriangle } from '../../features/hue-triangle';
import { PickerScale } from '../../shared/ui/createPickerPixels';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import { ColorDisc } from '../zen/ColorDisc';
import { cellGap, pitch, type Span } from './board';
import type { LegoServices } from './LegoServices';
import styles from './LegoStudio.module.css';
import type { LookSpec } from './looks';

/** Controlled color editing callbacks: input is live, commit records only a settled color. */
export type ColorInputProps = {
  color: string;
  onInput: (color: string) => void;
  onCommit: (color: string) => void;
};

/** Controlled color picker inputs. Commands are supplied by the binding, never by a session read. */
export type PickerProps = ColorInputProps & {
  oklch: Pick<LegoServices['color']['oklch'], 'wheel' | 'edit' | 'settle' | 'settings' | 'update'>;
  coolorus: LegoServices['color']['coolorus'];
};

/**
 * The color parts, Procreate's Colors and the Desktop color panel taken apart: a swatch that opens a panel of its
 * own, a picker ("wheel") in one of the library's looks, the foreground and background pair, the hex field, the color
 * history and a palette. Each fills its cells and works on the session's brush color; the hue, saturation and
 * brightness are value parts (see `parts.tsx`). Pickers and swatches remember the colors they set in the history.
 */

/**
 * The picker's looks: Zen's disc, the saturation and brightness square and the OKLCH disk at any size, the hue
 * triangle and Coolorus once there is room for their controls. The OKLCH disk's lightness, harmony and gamut mask
 * are parts of their own (`value:lightness`, `color:harmony`, `color:mask`).
 */
export const wheelLooks: readonly WheelLook[] = [
  { id: 'disc', label: 'Disc', min: { columns: 1, rows: 1 }, width: 232, Picker: Disc },
  { id: 'square', label: 'Square', min: { columns: 1, rows: 1 }, Picker: Square },
  { id: 'triangle', label: 'Triangle', min: { columns: 3, rows: 3 }, width: 236, Picker: Triangle },
  { id: 'wheel', label: 'OKLCH disk', min: { columns: 1, rows: 1 }, width: 248, Picker: OklchDisk },
  { id: 'coolorus', label: 'Coolorus', min: { columns: 4, rows: 4 }, width: 240, Picker: Coolorus }
];

/**
 * A picker look: `width` is its natural width in CSS pixels, at which it lays itself out before being scaled into
 * its cells; a look without one fills its cells as they are.
 */
type WheelLook = LookSpec & { width?: number; Picker: (props: PickerProps) => JSX.Element };

/** The picker's look until the user chooses one. */
export const autoWheelLook = () => 'disc';

/** The picker in `look` (see `wheelLooks`), filling a part of `span`. */
export function WheelPart(props: PickerProps & { look: string; span: Span }) {
  // Keyed: another look is another picker, with state of its own.
  const look = () => wheelLooks.find((candidate) => candidate.id === props.look) ?? wheelLooks[0]!;

  return (
    <Show when={look()} keyed>
      {(found) => {
        const Picker = found.Picker;
        return found.width === undefined ? (
          <Picker {...props} />
        ) : (
          <Fitted width={found.width} box={{ width: length(props.span.columns), height: length(props.span.rows) }}>
            <Picker {...props} />
          </Fitted>
        );
      }}
    </Show>
  );
}

/**
 * The brush color as a swatch, with its hex once two cells wide. A tap opens the swatch's own panel (`onOpen`), which
 * the user fills with parts like any other.
 */
export function SwatchPart(props: { span: Span; color: string; onOpen: (anchor: Element) => void }) {
  const color = () => props.color;

  return (
    <button
      type="button"
      class={styles.color}
      style={{ background: color(), color: luminance(color()) > 0.4 ? '#1c1c1e' : '#ffffff' }}
      aria-label={`Color ${color()}`}
      onClick={(event) => props.onOpen(event.currentTarget)}
    >
      <Show when={props.span.columns >= 2}>
        <span class={styles.name}>{color()}</span>
      </Show>
    </button>
  );
}

/**
 * The foreground color before the background one, as Photoshop and Procreate show them: overlapping at one cell,
 * side by side when wider, named once four cells wide. Tapping the background color swaps the two.
 */
export function PairPart(props: { span: Span; colors: { foreground: string; background: string }; swap: () => void }) {
  const background = () => props.colors.background;
  const named = () => props.span.columns >= 4;

  return (
    <div class={[styles.pair, props.span.columns >= 2 && styles.pairWide]}>
      <span
        class={styles.pairForeground}
        style={{ background: props.colors.foreground }}
        role="img"
        aria-label="Foreground color"
      >
        <Show when={named()}>
          <span style={{ color: luminance(props.colors.foreground) > 0.4 ? '#1c1c1e' : '#ffffff' }}>Foreground</span>
        </Show>
      </span>
      <button
        type="button"
        class={styles.pairBackground}
        style={{ background: background() }}
        aria-label="Background color: swap with the foreground"
        title="Background color · tap to swap"
        onClick={props.swap}
      >
        <Show when={named()}>
          <span style={{ color: luminance(background()) > 0.4 ? '#1c1c1e' : '#ffffff' }}>Background</span>
        </Show>
      </button>
    </div>
  );
}

/** The brush color as `#rrggbb` to read or type; Enter or leaving the field applies it, a wrong entry is undone. */
export function HexPart(props: ColorInputProps) {
  return (
    <label class={styles.hex}>
      <input
        aria-label="Hex color"
        spellcheck={false}
        value={props.color}
        onChange={(event) => {
          const parsed = parseHex(event.currentTarget.value);
          event.currentTarget.value = parsed ?? props.color;
          if (parsed) {
            props.onInput(parsed);
            props.onCommit(parsed);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

/**
 * The recently used colors, newest first, as round chips filling the part two to a cell each way, the places no color
 * has taken yet outlined; a tap paints in one.
 */
export function HistoryPart(props: ColorInputProps & { span: Span; colors: readonly string[] }) {
  const count = () => props.span.columns * props.span.rows * 4;
  const colors = () => props.colors.slice(0, count());

  return (
    <Chips span={props.span} label="Color history" round>
      <For each={colors()}>
        {(color) => (
          <Chip
            color={color}
            current={props.color}
            onChoose={() => {
              props.onInput(color);
              props.onCommit(color);
            }}
          />
        )}
      </For>
      <For each={Array.from({ length: count() - colors().length })}>
        {() => <span class={[styles.chip, styles.slot]} aria-hidden="true" />}
      </For>
    </Chips>
  );
}

/**
 * Procreate's default palette, two chips to a cell across, as many as fit at two rows to a cell; when they run out
 * first, the rows grow to fill the part.
 */
export function PalettePart(props: ColorInputProps & { span: Span }) {
  const colors = () => defaultPalette.slice(0, props.span.columns * props.span.rows * 4);

  return (
    <Chips span={props.span} label="Palette" rows={Math.ceil(colors().length / (props.span.columns * 2))}>
      <For each={colors()}>
        {(color) => (
          <Chip
            color={color}
            current={props.color}
            onChoose={() => {
              props.onInput(color);
              props.onCommit(color);
            }}
          />
        )}
      </For>
    </Chips>
  );
}

/** The OKLCH disk's harmony list, filling the part; its caption shows once the part is two cells tall. */
export function HarmonyPart(props: {
  span: Span;
  settings: ReturnType<LegoServices['color']['oklch']['settings']>;
  onSettings: LegoServices['color']['oklch']['update'];
}) {
  return (
    <div class={[wheelStyles.guides, styles.wheelField]} data-captioned={props.span.rows >= 2 ? '' : undefined}>
      <HarmonyField settings={props.settings} onSettings={props.onSettings} />
    </div>
  );
}

/** The OKLCH disk's gamut mask list, filling the part; its caption shows once the part is two cells tall. */
export function MaskPart(props: Parameters<typeof HarmonyPart>[0]) {
  return (
    <div class={[wheelStyles.guides, styles.wheelField]} data-captioned={props.span.rows >= 2 ? '' : undefined}>
      <MaskField settings={props.settings} onSettings={props.onSettings} />
    </div>
  );
}

/** Pixels a part of `cells` cells covers along one side. */
const length = (cells: number) => cells * pitch - cellGap;

/**
 * `children` laid out `width` pixels wide and scaled, keeping proportions, to fit `box`; never more than half again
 * as large, where canvases would blur. The pickers read presses through their scaled bounding boxes, so they work
 * at any scale.
 */
function Fitted(props: { width: number; box: { width: number; height: number }; children: JSX.Element }) {
  const parentScale = useContext(PickerScale);
  const [inner, setInner] = createSignal<HTMLElement>();
  const [height, setHeight] = createSignal(props.width);
  createResizeObserver(inner, (_rect, element) => setHeight(Math.max(1, (element as HTMLElement).offsetHeight)));
  const scale = createMemo(() => Math.min(props.box.width / props.width, props.box.height / height(), 1.5));
  const displayedScale = createMemo(() => parentScale() * scale());

  return (
    <div class={styles.fitted}>
      <div ref={setInner} style={{ width: `${props.width}px`, scale: `${scale()}` }}>
        <PickerScale value={displayedScale}>{props.children}</PickerScale>
      </div>
    </div>
  );
}

function Disc(props: PickerProps) {
  return (
    <div class={styles.pickerSurface}>
      <ColorDisc color={props.color} onInput={props.onInput} onCommit={props.onCommit} />
    </div>
  );
}

/**
 * Saturation left to right and brightness bottom to top for the brush color's hue, filling the part, as in
 * Procreate's Classic picker. Greys and black keep the hue they were reached from.
 */
function Square(props: PickerProps) {
  const hsv = createMemo<Hsv>((previous) =>
    previous && hsvToHex(previous) === props.color ? previous : hexToHsv(props.color, previous)
  );
  /** The hue when the press began, which a drag through black must not lose. */
  let hue = 0;
  let latest = '';
  const apply = (press: Press) => {
    const rect = press.target.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (press.point.x - rect.left) / rect.width));
    const v = Math.min(1, Math.max(0, 1 - (press.point.y - rect.top) / rect.height));
    latest = hsvToHex({ h: hue, s, v });
    props.onInput(latest);
  };
  const press = pressHandlers({
    start: (started) => {
      hue = hsv().h;
      apply(started);
    },
    move: apply,
    end: () => props.onCommit(latest),
    tapDistance: 0
  });

  return (
    <div
      class={styles.square}
      role="group"
      aria-label="Saturation and brightness"
      style={{ '--hue': hsvToHex({ h: hsv().h, s: 1, v: 1 }) }}
      {...press}
    >
      <span
        class={styles.squareThumb}
        style={{ left: `${hsv().s * 100}%`, top: `${(1 - hsv().v) * 100}%`, background: props.color }}
      />
    </div>
  );
}

function Triangle(props: PickerProps) {
  return (
    <div class={styles.pickerSurface}>
      <HueTriangle color={props.color} onChange={props.onInput} onSettle={() => props.onCommit(props.color)} />
    </div>
  );
}

/** The OKLCH disk alone, on the session's shared OKLCH color and guides; see the session-owned OKLCH binding. */
function OklchDisk(props: PickerProps) {
  const oklch = props.oklch;

  return (
    <div class={styles.pickerSurface}>
      <WheelDisk
        wheel={oklch.wheel()}
        color={props.color}
        onEdit={oklch.edit}
        onSettle={oklch.settle}
        settings={oklch.settings()}
        onSettings={oklch.update}
      />
    </div>
  );
}

function Coolorus(props: PickerProps) {
  const { settings, update } = props.coolorus;

  return (
    <div class={styles.pickerSurface}>
      <CoolorusWheel
        color={props.color}
        onChange={props.onInput}
        onSettle={() => props.onCommit(props.color)}
        settings={settings()}
        onSettings={update}
      />
    </div>
  );
}

/** Chips two to a cell each way, or in `rows` rows, filling the part. */
function Chips(props: { span: Span; label: string; round?: boolean; rows?: number; children: JSX.Element }) {
  return (
    <div
      class={[styles.chips, props.round && styles.round]}
      role="group"
      aria-label={props.label}
      style={{
        'grid-template-columns': `repeat(${props.span.columns * 2}, minmax(0, 1fr))`,
        'grid-template-rows': `repeat(${props.rows ?? props.span.rows * 2}, minmax(0, 1fr))`
      }}
    >
      {props.children}
    </div>
  );
}

function Chip(props: { color: string; current: string; onChoose: () => void }) {
  return (
    <button
      type="button"
      class={styles.chip}
      data-current={props.color.toLowerCase() === props.current.toLowerCase() ? '' : undefined}
      style={{ background: props.color }}
      aria-label={props.color}
      title={props.color}
      onClick={props.onChoose}
    />
  );
}

/** `#rgb` or `#rrggbb`, with or without `#`, as lowercase `#rrggbb`; `undefined` for anything else. */
function parseHex(text: string) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!match) {
    return undefined;
  }

  const digits = match[1]!.length === 3 ? [...match[1]!].map((digit) => digit + digit).join('') : match[1]!;
  return `#${digits.toLowerCase()}`;
}

/** Procreate-like default palette: neutrals, earth tones, then muted and saturated hues, ten to a row. */
const defaultPalette = [
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
];
