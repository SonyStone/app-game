import { createResizeObserver } from '@solid-primitives/resize-observer';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { wheelToHex } from '../../../features/color-wheel';
import { hsvToHex, luminance, type Hsv } from '../../../features/color/hsv';
import { pressHandlers, type Press } from '../../../shared/ui/pressHandlers';
import { ScrubNumber } from '../../../shared/ui/ScrubNumber';
import { geometricFraction, geometricValue } from '../../procreate/sliderScale';
import { useGrid, type createGrid } from '../grid';
import type { LegoServices } from '../LegoServices';
import styles from '../LegoStudio.module.css';
import { anyRoom, type LookSpec } from '../looks';
import { fitText, textWidth, widestText, type TextStyle } from '../textFit';
import { brushChannels } from './brushChannels';
import { definePart, type PartBinding, type PartGroup } from './definition';
import { LevelPicker, moveLevelFocus, NumberKeypad, unitSuffix, ValueEntryCard, type ValueLevel } from './ValueEntry';
import { createNameTag, NameTag, oneCellFace, peekHold } from './valueFaces';

/** Value kinds are derived from their static definitions; stored identifiers stay unchanged. */
export type ValueKind = (typeof channels)[number]['id'] | `brush:${string}`;

/**
 * Shared looks resolved by looks.ts, independently of the channel's app binding. A slider needs `sliderLength` along
 * either side, so that its thumb has somewhere to travel: two cells at every cell size the trial offers, one never.
 */
const looks: readonly LookSpec[] = [
  { id: 'knob', label: 'Knob', min: anyRoom },
  {
    id: 'slider',
    label: 'Slider',
    min: { width: sliderLength(), height: 0 },
    fits: lookFitsSlider
  },
  { id: 'number', label: 'Number', min: anyRoom }
];

/** The least length in CSS pixels along which a value shows as a slider. */
function sliderLength() {
  return 56;
}

/** A channel's complete read/write, range and presentation contract. Adding a value needs only one spec. */
export type ValueChannel = {
  id: string;
  label: string;
  short: string;
  unit: string;
  min: number;
  /** Live lower bound for schema channels; static channels keep min. */
  minimum?: (services: LegoServices) => number;
  /** Numeric input step, supplied by the brush schema. */
  step?: number;
  /**
   * The value's named levels in order, for a value with a few discrete steps such as Smoothing's 0 to 22: its slider
   * shows a tick per level and snaps to them, marks where one `zone` ends and the next begins, and its value chip opens
   * a picker of the levels instead of the keypad.
   */
  levels?: readonly ValueLevel[];
  /** Unavailable channels stay mounted but cannot receive edits. */
  active?: (services: LegoServices) => boolean;
  /** Left out of the box: enters the board from the brush studio, or shows only on a sheet, as the grid size does. */
  studioOnly?: boolean;
  max: (services: LegoServices) => number;
  read: (services: LegoServices) => number;
  write: (services: LegoServices, value: number, hsv: Hsv) => void;
  colored: boolean;
  /** The parts this channel's part fuses with; see `PartGroup`. */
  group: Extract<PartGroup, 'color-channels' | 'brush-values' | 'layer-props' | 'interface'>;
  /** Holds input locally and sends one undoable command at gesture completion. */
  deferred?: boolean;
  /** Captures the target identity at gesture start, so a selection change cannot redirect a pending edit. */
  capture?: (services: LegoServices) => (value: number, hsv: Hsv) => void;
  section?: 'Layers';
  scale?: 'log';
  wrap?: boolean;
  /** Defaults to linear interpolation between min and max. */
  toFraction?: (value: number, max: number, services: LegoServices) => number;
  /** Maps a normalized gesture to the channel value; defaults to linear min/max interpolation. */
  fromFraction?: (fraction: number, max: number, services: LegoServices) => number;
  track?: (services: LegoServices) => string;
  format?: (value: number) => string;
  /** Restores channel-specific intent before the original color is restored without tool policy. */
  cancel?: (services: LegoServices, value: number) => void;
};

const channels = [
  {
    id: 'layer-opacity',
    group: 'layer-props',
    label: 'Layer opacity',
    short: 'Layer',
    unit: '%',
    min: 0,
    max: () => 100,
    read: (s) => s.layers.state().layers.find((layer) => layer.id === s.layers.state().activeId)!.opacity * 100,
    write: (s, value) =>
      s.layers.action({ type: 'update', id: s.layers.state().activeId, patch: { opacity: value / 100 } }),
    capture: (s) => {
      const id = s.layers.state().activeId;
      return (value) => s.layers.action({ type: 'update', id, patch: { opacity: value / 100 } });
    },
    colored: false,
    deferred: true,
    section: 'Layers'
  },
  {
    id: 'size',
    group: 'brush-values',
    label: 'Size',
    short: 'Sz',
    unit: 'px',
    min: 1,
    max: (s) => s.brush.maxSize(),
    read: (s) => s.brush.size(),
    write: (s, value) => s.brush.update({ size: value }),
    colored: false,
    scale: 'log',
    format: (value) => `${Math.round(value)}`,
    toFraction: (value, max) => geometricFraction(value, 1, max),
    fromFraction: (fraction, max) => geometricValue(fraction, 1, max)
  },
  {
    id: 'opacity',
    group: 'brush-values',
    label: 'Opacity',
    short: 'Op',
    unit: '%',
    min: 1,
    max: () => 100,
    read: (s) => s.brush.opacity() * 100,
    write: (s, value) => s.brush.update({ opacity: value / 100 }),
    colored: false,
    toFraction: (value, max) => value / max,
    fromFraction: (fraction) => 1 + fraction * 99
  },
  {
    id: 'hue',
    group: 'color-channels',
    label: 'Hue',
    short: 'H',
    unit: '°',
    min: 0,
    max: () => 360,
    read: (s) => s.color.hsv().h,
    write: (s, value, hsv) => s.color.set(hsvToHex({ ...hsv, h: value % 360 })),
    colored: true,
    wrap: true,
    fromFraction: (fraction) => Math.min(359.9, fraction * 360),
    track: (s) => gradient([0, 60, 120, 180, 240, 300, 360].map((h) => hsvToHex({ ...s.color.hsv(), h })))
  },
  {
    id: 'saturation',
    group: 'color-channels',
    label: 'Saturation',
    short: 'S',
    unit: '%',
    min: 0,
    max: () => 100,
    read: (s) => s.color.hsv().s * 100,
    write: (s, value, hsv) => s.color.set(hsvToHex({ ...hsv, s: value / 100 })),
    colored: true,
    track: (s) => gradient([0, 1].map((v) => hsvToHex({ ...s.color.hsv(), s: v })))
  },
  {
    id: 'brightness',
    group: 'color-channels',
    label: 'Brightness',
    short: 'B',
    unit: '%',
    min: 0,
    max: () => 100,
    read: (s) => s.color.hsv().v * 100,
    write: (s, value, hsv) => s.color.set(hsvToHex({ ...hsv, v: value / 100 })),
    colored: true,
    track: (s) => gradient([0, 1].map((v) => hsvToHex({ ...s.color.hsv(), v })))
  },
  {
    id: 'lightness',
    group: 'color-channels',
    label: 'Lightness',
    short: 'L',
    unit: '%',
    min: 0,
    max: () => 100,
    read: (s) => s.color.oklch.wheel().l * 100,
    write: (s, value) => s.color.oklch.edit({ ...s.color.oklch.wheel(), l: value / 100 }),
    colored: true,
    track: (s) =>
      gradient(Array.from({ length: 11 }, (_, index) => wheelToHex({ ...s.color.oklch.wheel(), l: index / 10 }))),
    cancel: (s, value) => s.color.oklch.edit({ ...s.color.oklch.wheel(), l: value / 100 })
  }
] as const satisfies readonly ValueChannel[];

/** Static definitions and their full-slider popups are generated from the same channel specs. */
export const valueParts = channels.map(defineValuePart);

/** Studio-only definitions follow the ordinary catalogue so existing specimen positions stay stable. */
export const brushValueParts = brushChannels.map(defineValuePart);

/** Defines a value part from one complete channel spec. Missing writers fail immediately, including untyped input. */
export function defineValuePart(channel: ValueChannel) {
  if (typeof channel.write !== 'function') {
    throw new TypeError(`Value channel ${channel.id} requires a write command`);
  }

  return definePart({
    kind: `value:${channel.id}`,
    family: 'value',
    group: channel.group,
    section: channel.section ?? 'Values',
    studioOnly: channel.studioOnly,
    label: channel.label,
    defaultSpan: { columns: 4, rows: 1 },
    looks: { looks, auto: (room) => (lookFitsSlider(room) ? 'slider' : 'knob') },
    needs: (services, frame) => valueNeeds(services, frame, channel),
    View: ValuePart,
    popup: {
      needs: (services, frame) => valueNeeds(services, frame, channel),
      View: (props) => (
        <div class={styles.popupSlider}>
          <ValuePart {...props} look="slider" span={popupSliderSpan} />
        </div>
      )
    }
  });
}

/** Whether a value part with `room` is long enough for a slider. */
function lookFitsSlider(room: { width: number; height: number }) {
  return Math.max(room.width, room.height) >= sliderLength();
}

/** The span a value's popup slider shows at, as `.popupSlider` lays it out: room for the longest name and its value. */
const popupSliderSpan = { columns: 7, rows: 1 };

/** The LEGO look translates cells into the controlled input's orientation and captions. */
function ValuePart(props: ReturnType<typeof valueNeeds>) {
  const grid = useGrid();
  const [element, setElement] = createSignal<HTMLDivElement>();
  const [size, setSize] = createSignal<DOMRectReadOnly>();
  // A brush-studio row fills the detail pane. Its width can differ from the part it drops.
  if (typeof ResizeObserver !== 'undefined') {
    createResizeObserver(element, (rect) => setSize(rect));
  }
  const width = () => size()?.width || grid.length(props.span.columns);
  const height = () => size()?.height || grid.length(props.span.rows);
  const vertical = () => props.span.rows > props.span.columns;
  // A new value re-decides the captions only when its text takes another width.
  const widths = createMemo(() => valueTextWidths(props.texts), { equals: sameWidths });
  const captions = createMemo(() =>
    valueCaptions({
      width: width(),
      height: height(),
      vertical: vertical(),
      cell: grid.cell(),
      label: props.label,
      short: props.short,
      unit: props.unit,
      widths: widths()
    })
  );
  // A knob, and a number look without room for its caption, name their value on their face and in a tag.
  const face = createMemo(() =>
    props.look === 'knob' || (props.look === 'number' && captions().caption === undefined)
      ? oneCellFace(props.look, { width: width(), height: height() }, props)
      : undefined
  );
  const tag = createNameTag();
  return (
    <div
      ref={setElement}
      class={styles.valueState}
      aria-disabled={props.active ? 'false' : 'true'}
      data-inactive={!props.active ? '' : undefined}
      onPointerDown={(event) => {
        tag.onPointerDown(event);
        if (!props.active) {
          event.stopPropagation();
          event.preventDefault();
        }
      }}
      {...tag.handlers}
    >
      <ValueControl
        {...props}
        vertical={vertical()}
        caption={captions().caption}
        unit={captions().unit ? props.unit : undefined}
        sliderCaption={captions().sliderCaption}
        chip={captions().chip}
        knobText={captions().bareKnob ? props.knobNumber : props.text}
        face={face()}
      />
      <Show when={face() && tag.shown() && element()}>
        {(anchor) => <NameTag anchor={anchor()} label={props.label} value={props.text} />}
      </Show>
    </div>
  );
}

/**
 * What a value part shows in its room, each decided by whether its text fits (see `textFit.ts`), never by a size
 * threshold. `widths` are those of the widest texts the value takes (see `valueTextWidths`).
 *
 * - Number look: the field must hold the widest number. Beside it the caption shows the full name when it fits, the
 *   short name when only that does, and none otherwise; the unit shows when it fits too. Without a caption the field
 *   takes the compact type and padding.
 * - Slider look, along its long side: the value chip shows whenever the chip with the widest text fits between the
 *   label's paddings, so the number never vanishes while its chip fits; the name shows beside it, full or short, when
 *   both fit with the gap between them.
 * - Knob look: the value with its unit when that fits the knob's face, the number alone otherwise.
 */
export function valueCaptions(part: {
  width: number;
  height: number;
  vertical: boolean;
  /** The cell edge in CSS pixels, which sizes the knob's face. */
  cell: number;
  label: string;
  short: string;
  unit: string;
  widths: ReturnType<typeof valueTextWidths>;
}) {
  const unit = unitSuffix(part.unit);
  const unitWidth = unit ? widestText([unit], unitStyle) + unitPadding : 0;
  const full = numberBorder + part.widths.number;
  const caption = fitText(
    part.width - 2 * numberPadding - numberGap - full - unitWidth,
    numberCaptionStyle,
    part.label,
    part.short
  );
  const compactRoom = part.width - 2 * compactPadding - numberBorder - 2 * compactInset - part.widths.compactNumber;

  const length = part.vertical ? part.height : part.width;
  const padding = part.vertical ? verticalLabelPadding : labelPadding;
  const chipWidth = Math.max(chipMinimum, part.widths.chip + chipInset);
  const chip = chipWidth + 2 * padding + 1 <= length;
  const sliderCaption = chip
    ? fitText(length - 2 * padding - chipWidth - labelGap - captionInset, sliderCaptionStyle, part.label, part.short)
    : undefined;

  const face = Math.min(knobFace, part.cell - knobInset);

  return {
    caption,
    unit: caption !== undefined ? unit !== '' : unit !== '' && compactRoom - unitWidth >= 1,
    chip,
    sliderCaption,
    bareKnob: part.widths.knob + 1 > face
  };
}

/**
 * The widths in CSS pixels of the widest of `texts` a value can show (see `valueTexts`): as its chip and its knob set
 * them, and its bare numbers in the number look's full and compact type.
 */
export function valueTextWidths(texts: ReturnType<typeof valueTexts>) {
  return {
    chip: widestText(texts.chip, chipStyle),
    knob: widestText(texts.chip, knobStyle),
    number: widestText(texts.numbers, numberStyle),
    compactNumber: widestText(texts.numbers, compactNumberStyle)
  };
}

function sameWidths(a: ReturnType<typeof valueTextWidths>, b: ReturnType<typeof valueTextWidths>) {
  return a.chip === b.chip && a.knob === b.knob && a.number === b.number && a.compactNumber === b.compactNumber;
}

/** How the number look sets its caption, number and unit (see `.number`, `.numberCaption` and `ScrubNumber`). */
const numberCaptionStyle: TextStyle = { size: 12, weight: 600 };
const numberStyle: TextStyle = { size: 13, tabular: true };
const compactNumberStyle: TextStyle = { size: 11, tabular: true };
const unitStyle: TextStyle = { size: 11 };
const numberPadding = 4;
const numberGap = 2;
const compactPadding = 2;
const compactInset = 1;
const numberBorder = 2;
const unitPadding = 8;

/** The length of a value chip that holds the widest of `texts`. */
function chipLength(texts: readonly string[]) {
  return Math.max(chipMinimum, widestText(texts, chipStyle) + chipInset);
}

/** How a slider sets its name and value chip (see `.sliderLabel` and `.valueChip`). */
const sliderCaptionStyle: TextStyle = { size: 13, weight: 600 };
const chipStyle: TextStyle = { size: 13, weight: 600, tabular: true };
const labelPadding = 10;
const verticalLabelPadding = 8;
const labelGap = 16;
const captionInset = 10;
const chipInset = 16;
const chipMinimum = 30;

/** How a knob sets its value on its face (see `.knob`): a circle of at most `knobFace`, `knobInset` inside the cell. */
const knobStyle: TextStyle = { size: 12, weight: 600 };
const knobFace = 32;
const knobInset = 4;

/**
 * Controlled knob, slider or scrub field. Input callbacks edit live; commit records the settled edit; cancel
 * restores the exact captured value. This component has no session, registry, cells or storage knowledge.
 *
 * A slider wide enough to name its value shows the value in a chip at its end. A press on the track sets the value
 * where it is and slides it; a tap on the chip (a press that moves less than a tap's distance) leaves the value and
 * opens number entry anchored to the slider: a keypad (`NumberKeypad`), or for a value with named levels a picker of
 * them (`LevelPicker`). A drag that starts on the chip slides the value from where it was, without a jump. Entry
 * commits once, as one edit, and is open only while the part is live: a board in edit mode keeps its parts inert.
 */
function ValueControl(
  props: Omit<ReturnType<typeof valueNeeds>, 'span' | 'unit'> & {
    vertical: boolean;
    caption?: string;
    unit?: string;
    sliderCaption?: string;
    /** Whether the slider shows its value chip; see `valueCaptions`. */
    chip: boolean;
    /** What the knob's face shows. */
    knobText: string;
    /** How a knob or a captionless number look names its value on its face; see `oneCellFace`. */
    face?: ReturnType<typeof oneCellFace>;
  }
) {
  let start = 0;
  /** Whether the press in progress began on the value chip, which slides only once it moves as no tap does. */
  let fromChip = false;
  /** The element number entry is anchored to while it is open. */
  const [entry, setEntry] = createSignal<Element>();
  const begin = () => {
    start = props.fraction;
    props.onStart();
  };
  const set = (value: number) => props.onInput(Math.max(0, Math.min(1, value)));
  const scrub = pressHandlers({
    start: () => {
      if (!props.active) {
        return false;
      }
      begin();
    },
    move: (press) => set(start + (press.point.x - press.start.x - (press.point.y - press.start.y)) / 300),
    end: props.onCommit,
    cancel: props.onCancel,
    tap: (press, event) => {
      // A press held without moving only shows the name tag.
      if (event.timeStamp - press.time < peekHold) {
        props.onOpen(press.target);
      }
    }
  });
  const slide = pressHandlers({
    start: (press, event) => {
      if (!props.active) {
        return false;
      }
      fromChip = event.target instanceof Element && event.target.closest('[data-value-chip]') !== null;
      begin();
      if (!fromChip) {
        set(trackFraction(press));
      }
    },
    move: (press) => {
      if (!fromChip) {
        set(trackFraction(press));
      } else if (press.moved) {
        set(start + chipDelta(press));
      }
    },
    end: props.onCommit,
    cancel: props.onCancel,
    tap: (press) => {
      props.onCommit();
      if (fromChip) {
        setEntry(press.target);
      }
    }
  });

  function trackFraction(press: Press) {
    const rect = press.target.getBoundingClientRect();
    return props.vertical
      ? (rect.bottom - press.point.y) / Math.max(1, rect.height)
      : (press.point.x - rect.left) / Math.max(1, rect.width);
  }

  /** The fraction of the track a drag from the chip has covered. */
  function chipDelta(press: Press) {
    const rect = press.target.getBoundingClientRect();
    return props.vertical
      ? (press.start.y - press.point.y) / Math.max(1, rect.height)
      : (press.point.x - press.start.x) / Math.max(1, rect.width);
  }

  const enter = (value: number) => {
    setEntry(undefined);
    props.onStart();
    props.onNumberCommit(value);
  };
  /** The keypad's key handler, which it hands over as it is made; see `NumberKeypad`'s `keys`. */
  let keypadKeys: ((event: KeyboardEvent) => boolean) | undefined;

  return (
    <>
      <Show
        when={props.look !== 'number'}
        fallback={
          <div
            class={styles.number}
            data-compact={!props.caption ? '' : undefined}
            data-face={props.face?.name ? '' : undefined}
            style={props.face?.name ? faceOffsets(props.face) : undefined}
          >
            <Show when={props.caption}>
              <span class={styles.numberCaption}>{props.caption}</span>
            </Show>
            <Show when={props.face?.name}>{(name) => <span class={styles.faceName}>{name()}</span>}</Show>
            <Show when={props.active} fallback={<span class={styles.numberDash}>—</span>}>
              <ScrubNumber
                label={props.label}
                disabled={!props.active}
                step={props.step}
                value={props.number}
                min={props.min}
                max={props.max}
                unit={props.unit && unitSuffix(props.unit)}
                scale={props.scale}
                wrap={props.wrap}
                onStart={props.onStart}
                onCancel={props.onCancel}
                onInput={props.onNumberInput}
                onChange={props.onNumberCommit}
              />
            </Show>
          </div>
        }
      >
        <Show
          when={props.look !== 'knob'}
          fallback={
            <div
              class={styles.knob}
              role="slider"
              aria-label={props.label}
              aria-valuenow={Math.round(props.fraction * 100)}
              aria-valuetext={props.text}
              data-face={props.face?.name ? '' : undefined}
              style={{
                '--fraction': `${props.fraction * 360}deg`,
                ...(props.face?.name ? faceOffsets(props.face) : {}),
                '--swatch': props.color,
                '--swatch-ink': props.color && luminance(props.color) < 0.4 ? '#ffffff' : undefined
              }}
              {...scrub}
            >
              <span class={props.face?.name ? styles.stackFace : styles.knobFace}>
                <Show when={props.face?.name}>{(name) => <span class={styles.faceName}>{name()}</span>}</Show>
                <span class={styles.faceNumber}>{props.knobText}</span>
              </span>
            </div>
          }
        >
          <div
            class={[styles.slider, props.vertical && styles.vertical, props.track !== undefined && styles.colored]}
            role="slider"
            aria-label={props.label}
            aria-orientation={props.vertical ? 'vertical' : 'horizontal'}
            aria-valuenow={Math.round(props.fraction * 100)}
            aria-valuetext={props.text}
            data-levels={props.levels ? '' : undefined}
            data-entry={entry() ? '' : undefined}
            style={{
              '--fraction': `${props.fraction * 100}%`,
              '--track-to': props.vertical ? 'top' : 'right',
              background: props.track
            }}
            {...slide}
          >
            <span class={styles.fill} />
            <Show when={props.levels}>{(levels) => <LevelTicks levels={levels()} vertical={props.vertical} />}</Show>
            <span class={styles.thumb} />
            <Show when={props.chip}>
              <span class={styles.sliderLabel}>
                <span>{props.sliderCaption}</span>
                <span
                  class={styles.valueChip}
                  data-value-chip
                  title={props.active ? (props.levels ? 'Tap to choose a level' : 'Tap to type a value') : undefined}
                >
                  {props.text}
                </span>
              </span>
            </Show>
          </div>
        </Show>
      </Show>
      <Show when={entry()}>
        {(anchor) => (
          <ValueEntryCard
            anchor={anchor()}
            label={props.label}
            onCancel={() => setEntry(undefined)}
            onKey={(event) => (props.levels ? moveLevelFocus(event) : (keypadKeys?.(event) ?? false))}
          >
            <Show
              when={props.levels}
              fallback={
                <NumberKeypad
                  label={props.label}
                  value={props.number}
                  min={props.min}
                  max={props.max}
                  step={props.step}
                  unit={props.unit ? unitSuffix(props.unit) : ''}
                  onCommit={enter}
                  onCancel={() => setEntry(undefined)}
                  keys={(handler) => (keypadKeys = handler)}
                />
              }
            >
              {(levels) => <LevelPicker label={props.label} levels={levels()} value={props.number} onChoose={enter} />}
            </Show>
          </ValueEntryCard>
        )}
      </Show>
    </>
  );
}

/** The face's spacing as the CSS of `.stackFace` and a named `.number` reads it; see `oneCellFace`. */
function faceOffsets(face: ReturnType<typeof oneCellFace>) {
  return {
    '--face-ring': `${face.ring}px`,
    '--face-gap': `${face.gap}px`,
    '--face-name-offset': `${face.nameOffset}px`,
    '--face-number-offset': `${face.numberOffset}px`
  };
}

/**
 * A level slider's marks: a tick at each level, and the zones after the first tinted, with a line where each begins,
 * so Smoothing's strong levels above 15 read apart from the others.
 */
function LevelTicks(props: { levels: readonly (ValueLevel & { fraction: number })[]; vertical: boolean }) {
  const edge = (fraction: number) =>
    props.vertical ? { bottom: `${fraction * 100}%` } : { left: `${fraction * 100}%` };
  const zones = createMemo(() =>
    props.levels.flatMap((level, index) => {
      const previous = props.levels[index - 1];
      return previous && previous.zone !== level.zone
        ? [{ zone: level.zone, from: (previous.fraction + level.fraction) / 2 }]
        : [];
    })
  );

  return (
    <span class={styles.levelTicks} aria-hidden="true">
      <For each={zones()}>
        {(zone) => <span class={styles.levelZoneMark} data-zone={zone.zone} style={edge(zone.from)} />}
      </For>
      <For each={props.levels}>{(level) => <span class={styles.levelTick} style={edge(level.fraction)} />}</For>
    </span>
  );
}

/** Selects one channel's observations and guarded edits, preserving exact gesture cancellation. */
function valueNeeds(services: LegoServices, frame: PartBinding, channel: ValueChannel) {
  const { color } = services;
  const [draft, setDraft] = createSignal<number>();
  const active = createMemo(() => channel.active?.(services) ?? true);
  const min = createMemo(() => channel.minimum?.(services) ?? channel.min);
  const observed = createMemo(() => channel.read(services));
  const value = () => draft() ?? observed();
  const max = createMemo(() => channel.max(services));
  const toFraction = (of: number) => channel.toFraction?.(of, max(), services) ?? (of - min()) / (max() - min());
  const fraction = () => toFraction(value());
  /** The channel's levels where the slider draws them, while the value applies; see `ValueChannel`'s `levels`. */
  const levels = createMemo(() =>
    active() ? channel.levels?.map((level) => ({ ...level, fraction: toFraction(level.value) })) : undefined
  );
  /** `next` at the nearest of the channel's levels, or as it is for a channel without levels. */
  const snap = (next: number) =>
    channel.levels?.reduce((best, level) => (Math.abs(level.value - next) < Math.abs(best.value - next) ? level : best))
      .value ?? next;
  const formatted = (of: number) => formatValue(channel, of);
  let start: { value: number; hsv: Hsv; color: string };
  let captured: ReturnType<NonNullable<ValueChannel['capture']>> | undefined;
  const write = (next: number, hsv: Hsv) => {
    if (!active()) {
      return;
    }

    if (channel.deferred) {
      setDraft(next);
    } else {
      channel.write(services, next, hsv);
    }
  };
  const commit = (next = draft()) => {
    setDraft(undefined);
    if (channel.deferred && next !== undefined && next !== (captured ? start.value : channel.read(services))) {
      (captured ?? ((value: number, hsv: Hsv) => channel.write(services, value, hsv)))(next, color.hsv());
    }

    captured = undefined;
    if (channel.colored) {
      color.recent.remember(color.value());
    }
  };

  return {
    id: channel.id,
    label: channel.label,
    short: channel.short,
    unit: channel.unit,
    get span() {
      return frame.span;
    },
    get look() {
      return frame.look;
    },
    get number() {
      return roundedValue(value(), channel.step);
    },
    get fraction() {
      return fraction();
    },
    get max() {
      return max();
    },
    get min() {
      return min();
    },
    get active() {
      return active();
    },
    step: channel.step,
    get levels() {
      return levels();
    },
    scale: channel.scale,
    wrap: channel.wrap,
    get text() {
      return active() ? formatted(value()) : '—';
    },
    /** The value without its unit, which a knob too small for the unit shows. */
    get knobNumber() {
      return active() ? `${roundedValue(value(), channel.step)}` : '—';
    },
    /**
     * The texts the value can show, which its captions make room for: as the chip shows them, and as bare numbers
     * in the number look, at the current value and both ends of its range.
     */
    get texts() {
      return valueTexts(channel, active() ? [value(), min(), max()] : undefined);
    },
    get color() {
      return channel.colored ? color.value() : undefined;
    },
    get track() {
      return channel.track?.(services);
    },
    onStart: frame.command(() => {
      setDraft(undefined);
      captured = channel.capture?.(services);
      start = { value: value(), hsv: color.hsv(), color: color.value() };
    }),
    onInput: frame.command((next: number) =>
      write(snap(channel.fromFraction?.(next, max(), services) ?? min() + next * (max() - min())), start.hsv)
    ),
    onNumberInput: frame.command((next: number) => write(next, start.hsv)),
    onNumberCommit: frame.command((next: number) => {
      write(next, color.hsv());
      commit(next);
    }),
    onCommit: frame.command(() => commit()),
    onCancel: frame.command(() => {
      if (channel.deferred) {
        setDraft(undefined);
        captured = undefined;
      } else if (channel.colored) {
        channel.cancel?.(services, start.value);
        color.restore(start.color);
      } else {
        write(start.value, start.hsv);
      }
    }),
    onOpen: (anchor: Element) => frame.onPopup(anchor, { kind: 'part', partKind: frame.kind })
  };
}

/** `value` as `channel`'s chip and knob show it. */
function formatValue(channel: ValueChannel, value: number) {
  const rounded = roundedValue(value, channel.step);
  return channel.format?.(rounded) ?? `${rounded}${unitSuffix(channel.unit)}`;
}

/**
 * The texts a value of `channel` can show, which its captions make room for: as the chip shows `values` (its current
 * value and both ends of its range), and as bare numbers in the number look; a dash for a value that does not apply.
 */
function valueTexts(channel: ValueChannel, values: readonly number[] | undefined) {
  return {
    chip: values ? values.map((value) => formatValue(channel, value)) : ['—'],
    numbers: values ? values.map((value) => `${roundedValue(value, channel.step)}`) : ['—']
  };
}

/**
 * The span of a one-row slider of the value part `kind` just long enough to show its full name beside its value
 * chip, as a part lifted from the brush studio takes; `undefined` for a kind that is no value part.
 */
export function namedSliderSpan(
  kind: string,
  services: LegoServices,
  minimumSpan: ReturnType<typeof createGrid>['minimumSpan']
) {
  const channel = ([...channels, ...brushChannels] as readonly ValueChannel[]).find(
    (candidate) => `value:${candidate.id}` === kind
  );
  if (!channel) {
    return undefined;
  }

  const active = channel.active?.(services) ?? true;
  const ends = [channel.minimum?.(services) ?? channel.min, channel.max(services)];
  const { chip } = valueTexts(channel, active ? [channel.read(services), ...ends] : undefined);
  const length =
    2 * labelPadding + captionInset + labelGap + chipLength(chip) + textWidth(channel.label, sliderCaptionStyle) + 1;
  return { columns: minimumSpan({ width: length, height: 0 }).columns, rows: 1 };
}

function gradient(stops: readonly string[]) {
  return `linear-gradient(to var(--track-to), ${stops.join(', ')})`;
}

/** Removes binary multiplication noise from stepped UI values. */
export function roundedValue(value: number, step = 1) {
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number((Math.round(value / step) * step).toFixed(decimals));
}
