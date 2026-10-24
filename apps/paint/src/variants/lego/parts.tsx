import type { Brush } from '@app-game/paint-core/brush';
import { createMemo, Match, Show, Switch } from 'solid-js';
import { maxBrushSize } from '../../features/brush';
import { wheelToHex } from '../../features/color-wheel';
import { hexToHsv, hsvToHex, luminance, type Hsv } from '../../features/color/hsv';
import type { PaintSession } from '../../features/session';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { geometricFraction, geometricValue, linearFraction, linearValue } from '../procreate/sliderScale';
import { PresetStroke } from '../zen/PresetStroke';
import { cellGap, pitch, type Part, type Span } from './board';
import {
  autoWheelLook,
  HarmonyPart,
  HexPart,
  MaskPart,
  oklchFor,
  HistoryPart,
  PairPart,
  PalettePart,
  recentFor,
  setColor,
  SwatchPart,
  WheelPart,
  wheelLooks
} from './colorParts';
import styles from './LegoStudio.module.css';
import { resolveLook, type LookSpec } from './looks';

/** The drawing session the parts work on. */
export type Session = PaintSession;

/** Brush values a value part shows and sets. */
/** `lightness` is OKLCH's, the OKLCH disk's own (see `oklchFor`). */
export type ValueKind = 'size' | 'opacity' | 'hue' | 'saturation' | 'brightness' | 'lightness';

/** CSS pixels a knob is dragged to go through its whole range. */
const scrubLength = 300;

/** Single-button actions. */
export type ActionKind = 'undo' | 'redo' | 'eraser' | 'local-undo' | 'mixing';

/** The color parts; see `colorParts.tsx`. */
export type ColorKind = 'swatch' | 'wheel' | 'pair' | 'hex' | 'history' | 'palette' | 'harmony' | 'mask';

/** What floats over the board: a value as a full slider, or the chooser of part `id`'s looks. */
export type Popup = { kind: 'value'; value: ValueKind } | { kind: 'looks'; id: string };

/**
 * One part of the board at its size, like an Android widget: the more cells it covers, the more it shows. A brush is
 * a stroke sample alone at one cell, gets its name once it is two cells wide and a large sample once it is two cells
 * tall; an action gets its name once two cells wide. Values and color pickers have looks to choose from (see
 * `partLooks`). `kind` is `preset:<id>`, `value:<ValueKind>`, `action:<ActionKind>` or `color:<ColorKind>`.
 */
export function PartView(props: {
  kind: string;
  span: Span;
  session: Session;
  /** The look it shows, for kinds with looks; the kind's automatic look for the span when absent. */
  look?: string;
  /** Opens `popup` beside `anchor`; see `Popup`. */
  onPopup: (anchor: Element, popup: Popup) => void;
  /** Opens or closes the part's own panel, for a swatch. */
  onOpen?: (anchor: Element) => void;
}) {
  const parsed = () => parseKind(props.kind);
  const look = () => props.look ?? partLooks(props.kind)?.auto(props.span) ?? '';

  return (
    <Switch fallback={<span class={styles.unknown}>?</span>}>
      <Match when={parsed()?.type === 'preset' && parsed()!.id}>
        {(id) => <PresetPart id={id()} span={props.span} session={props.session} />}
      </Match>
      <Match when={parsed()?.type === 'value' && (parsed()!.id as ValueKind)}>
        {(value) => (
          <ValuePart
            value={value()}
            look={look() as ValueLook}
            span={props.span}
            session={props.session}
            onPopup={(anchor) => props.onPopup(anchor, { kind: 'value', value: value() })}
          />
        )}
      </Match>
      <Match when={parsed()?.type === 'action' && (parsed()!.id as ActionKind)}>
        {(action) => <ActionPart action={action()} span={props.span} session={props.session} />}
      </Match>
      <Match when={parsed()?.type === 'color' && (parsed()!.id as ColorKind)}>
        {(color) => (
          <Switch fallback={<span class={styles.unknown}>?</span>}>
            <Match when={color() === 'swatch'}>
              <SwatchPart span={props.span} session={props.session} onOpen={(anchor) => props.onOpen?.(anchor)} />
            </Match>
            <Match when={color() === 'wheel'}>
              <WheelPart look={look()} span={props.span} session={props.session} />
            </Match>
            <Match when={color() === 'pair'}>
              <PairPart span={props.span} session={props.session} />
            </Match>
            <Match when={color() === 'hex'}>
              <HexPart session={props.session} />
            </Match>
            <Match when={color() === 'history'}>
              <HistoryPart span={props.span} session={props.session} />
            </Match>
            <Match when={color() === 'palette'}>
              <PalettePart span={props.span} session={props.session} />
            </Match>
            <Match when={color() === 'harmony'}>
              <HarmonyPart span={props.span} session={props.session} />
            </Match>
            <Match when={color() === 'mask'}>
              <MaskPart span={props.span} session={props.session} />
            </Match>
          </Switch>
        )}
      </Match>
    </Switch>
  );
}

/** The kinds the box offers besides the brush presets, by family, in box order. */
export const boxSections: readonly { title: string; kinds: readonly string[] }[] = [
  { title: 'Tools', kinds: ['action:undo', 'action:redo', 'action:eraser', 'action:local-undo', 'action:mixing'] },
  {
    title: 'Color',
    kinds: [
      'color:swatch',
      'color:wheel',
      'color:pair',
      'color:hex',
      'color:history',
      'color:palette',
      'color:harmony',
      'color:mask'
    ]
  },
  {
    title: 'Values',
    kinds: ['value:size', 'value:opacity', 'value:hue', 'value:saturation', 'value:brightness', 'value:lightness']
  }
];

/** The look a part shows at its span, for kinds with several; see `looks.ts`. */
export function lookOf(part: Pick<Part, 'kind' | 'span' | 'looks'>) {
  const options = partLooks(part.kind);
  return options && resolveLook(part.looks, part.span, options.looks, options.auto(part.span));
}

/**
 * The looks a part of `kind` can take (see `looks.ts`), with the look it shows for a span until one is chosen;
 * `undefined` for kinds with a single look.
 */
export function partLooks(kind: string) {
  if (kind === 'color:wheel') {
    return { looks: wheelLooks, auto: autoWheelLook };
  }

  return kind.startsWith('value:') ? { looks: valueLooks, auto: autoValueLook } : undefined;
}

/** A part's name, for the box's tooltips and screen readers. */
export function kindLabel(kind: string, session: Session) {
  const parsed = parseKind(kind);
  if (parsed?.type === 'preset') {
    return session.library.presets().find((preset) => preset.id === parsed.id)?.name ?? 'Brush';
  }

  if (parsed?.type === 'value') {
    return values[parsed.id as ValueKind]?.label ?? kind;
  }

  if (parsed?.type === 'action') {
    return actions[parsed.id as ActionKind]?.label ?? kind;
  }

  return parsed?.type === 'color' ? (colorLabels[parsed.id as ColorKind] ?? kind) : kind;
}

const colorLabels: Record<ColorKind, string> = {
  swatch: 'Swatch',
  wheel: 'Picker',
  pair: 'Fore/back',
  hex: 'Hex',
  history: 'History',
  palette: 'Palette',
  harmony: 'Harmony',
  mask: 'Gamut mask'
};

/** How a value shows: a knob at any size, a slider along the longer side, or a number to drag or type. */
type ValueLook = 'knob' | 'slider' | 'number';

const valueLooks: readonly LookSpec[] = [
  { id: 'knob', label: 'Knob', min: { columns: 1, rows: 1 } },
  {
    id: 'slider',
    label: 'Slider',
    min: { columns: 2, rows: 1 },
    fits: (span) => span.columns >= 2 || span.rows >= 2
  },
  { id: 'number', label: 'Number', min: { columns: 1, rows: 1 } }
];

/** A knob at one cell, a slider when longer. */
const autoValueLook = (span: Span) => (span.columns === 1 && span.rows === 1 ? 'knob' : 'slider');

function parseKind(kind: string) {
  const [type, ...rest] = kind.split(':');
  return type ? { type, id: rest.join(':') } : undefined;
}

/** Pixels a part of `cells` cells covers along one side. */
const length = (cells: number) => cells * pitch - cellGap;

function PresetPart(props: { id: string; span: Span; session: Session }) {
  const { library, tools, brush, tool } = props.session;
  const preset = () => library.presets().find((candidate) => candidate.id === props.id);
  const active = () => tool() === 'brush' && tools.preset() === props.id;
  const named = () => props.span.columns >= 2;
  const large = () => props.span.rows >= 2;
  /** Sample height: the whole part, less the name's line on a large part. */
  const sampleHeight = () => (large() && named() ? length(props.span.rows) - 22 : length(props.span.rows));

  return (
    <button
      type="button"
      class={[styles.preset, large() && styles.large]}
      data-active={active() ? '' : undefined}
      aria-label={preset()?.name ?? 'Brush'}
      onClick={() => {
        void choose();
      }}
    >
      <Show when={preset()} fallback={<span class={styles.unknown}>?</span>}>
        {(found) => (
          <>
            <span
              class={styles.sample}
              style={{ width: large() || !named() ? '100%' : `${length(1)}px`, height: `${sampleHeight()}px` }}
            >
              <PresetStroke
                preset={found()}
                resources={library.resources}
                color={brush().color}
                height={sampleHeight()}
              />
            </span>
            <Show when={named()}>
              <span class={styles.name}>{found().name}</span>
            </Show>
          </>
        )}
      </Show>
    </button>
  );

  async function choose() {
    if (tool() !== 'brush') {
      props.session.chooseTool('brush');
    }

    await props.session.choosePreset(props.id, 'brush');
  }
}

/**
 * How each value reads from and writes to the brush, as a fraction along its track. Size is geometric, so small
 * sizes get as much travel as large ones; hue, saturation and brightness edit the brush color in HSV.
 */
const values: Record<
  ValueKind,
  {
    label: string;
    read: (brush: Brush, hsv: Hsv, session: Session) => number;
    write: (fraction: number, session: Session, hsv: Hsv) => void;
    text: (fraction: number, session: Session) => string;
    /** The track's background; plain when absent. */
    track?: (hsv: Hsv, session: Session) => string;
    /** The value as the number look shows and takes it, with a `short` caption for a part two cells wide. */
    number: {
      short: string;
      unit: string;
      max: (session: Session) => number;
      min?: number;
      scale?: 'log';
      wrap?: boolean;
      get: (brush: Brush, hsv: Hsv, session: Session) => number;
      set: (value: number, session: Session, hsv: Hsv) => void;
    };
  }
> = {
  size: {
    label: 'Size',
    read: (brush) => geometricFraction(brush.size, 1, maxBrushSize(brush)),
    write: (fraction, session) =>
      session.tools.updateBrush({ size: geometricValue(fraction, 1, maxBrushSize(session.brush())) }),
    text: (_, session) => `${Math.round(session.brush().size)}`,
    number: {
      short: 'Sz',
      unit: 'px',
      min: 1,
      max: (session) => maxBrushSize(session.brush()),
      scale: 'log',
      get: (brush) => Math.round(brush.size),
      set: (value, session) => session.tools.updateBrush({ size: value })
    }
  },
  opacity: {
    label: 'Opacity',
    read: (brush) => linearFraction(brush.opacity, 0, 1),
    write: (fraction, session) => session.tools.updateBrush({ opacity: linearValue(fraction, 0.01, 1) }),
    text: (fraction) => `${Math.round(fraction * 100)}%`,
    number: {
      short: 'Op',
      unit: '%',
      min: 1,
      max: () => 100,
      get: (brush) => Math.round(brush.opacity * 100),
      set: (value, session) => session.tools.updateBrush({ opacity: value / 100 })
    }
  },
  hue: {
    label: 'Hue',
    read: (_, hsv) => hsv.h / 360,
    write: (fraction, session, hsv) => setColor(session, { ...hsv, h: Math.min(359.9, fraction * 360) }),
    text: (fraction) => `${Math.round(fraction * 360)}°`,
    number: {
      short: 'H',
      unit: '°',
      max: () => 360,
      wrap: true,
      get: (_, hsv) => Math.round(hsv.h),
      set: (value, session, hsv) => setColor(session, { ...hsv, h: value % 360 })
    },
    track: (hsv) =>
      `linear-gradient(to var(--track-to), ${[0, 60, 120, 180, 240, 300, 360].map((h) => hsvToHex({ h, s: hsv.s, v: hsv.v })).join(', ')})`
  },
  saturation: {
    label: 'Saturation',
    read: (_, hsv) => hsv.s,
    write: (fraction, session, hsv) => setColor(session, { ...hsv, s: fraction }),
    text: (fraction) => `${Math.round(fraction * 100)}%`,
    number: {
      short: 'S',
      unit: '%',
      max: () => 100,
      get: (_, hsv) => Math.round(hsv.s * 100),
      set: (value, session, hsv) => setColor(session, { ...hsv, s: value / 100 })
    },
    track: (hsv) =>
      `linear-gradient(to var(--track-to), ${hsvToHex({ ...hsv, s: 0 })}, ${hsvToHex({ ...hsv, s: 1 })})`
  },
  brightness: {
    label: 'Brightness',
    read: (_, hsv) => hsv.v,
    write: (fraction, session, hsv) => setColor(session, { ...hsv, v: fraction }),
    text: (fraction) => `${Math.round(fraction * 100)}%`,
    number: {
      short: 'B',
      unit: '%',
      max: () => 100,
      get: (_, hsv) => Math.round(hsv.v * 100),
      set: (value, session, hsv) => setColor(session, { ...hsv, v: value / 100 })
    },
    track: (hsv) =>
      `linear-gradient(to var(--track-to), ${hsvToHex({ ...hsv, v: 0 })}, ${hsvToHex({ ...hsv, v: 1 })})`
  },
  lightness: {
    label: 'Lightness',
    read: (_, __, session) => oklchFor(session).wheel().l,
    write: (fraction, session) => oklchFor(session).edit({ ...oklchFor(session).wheel(), l: fraction }),
    text: (fraction) => `${Math.round(fraction * 100)}%`,
    track: (_, session) => {
      const wheel = oklchFor(session).wheel();
      const stops = Array.from({ length: 11 }, (_, index) => wheelToHex({ ...wheel, l: index / 10 }));
      return `linear-gradient(to var(--track-to), ${stops.join(', ')})`;
    },
    number: {
      short: 'L',
      unit: '%',
      max: () => 100,
      get: (_, __, session) => Math.round(oklchFor(session).wheel().l * 100),
      set: (value, session) => oklchFor(session).edit({ ...oklchFor(session).wheel(), l: value / 100 })
    }
  }
};

/**
 * The HSV of the session's brush color. Greys and black keep the hue and saturation they were reached from, so
 * dragging brightness to black and back returns to the same color.
 */
function createBrushHsv(session: Session) {
  return createMemo<Hsv>((previous) =>
    previous && hsvToHex(previous) === session.brush().color ? previous : hexToHsv(session.brush().color, previous)
  );
}

/**
 * A brush value in `look`: a knob, a slider along the longer side, or a number. Pressing the knob and dragging in any
 * direction changes the value (right and up raise it); tapping it opens the full slider beside it. The number drags
 * sideways or, tapped, takes typing (see `ScrubNumber`).
 */
export function ValuePart(props: {
  value: ValueKind;
  look: ValueLook;
  span: Span;
  session: Session;
  /** Opens the full slider beside `anchor`; absent on the popup's own slider. */
  onPopup?: (anchor: Element) => void;
}) {
  const hsv = createBrushHsv(props.session);
  const spec = () => values[props.value];
  const fraction = () => spec().read(props.session.brush(), hsv(), props.session);
  const knob = () => props.look === 'knob';
  const vertical = () => props.span.rows > props.span.columns;
  /**
   * The value and color when the press began: a press changes one channel, and the others keep their values even
   * where the color alone would lose them, such as the hue while brightness passes black.
   */
  let start = { fraction: 0, hsv: hsv() };

  const set = (next: number) => spec().write(Math.max(0, Math.min(1, next)), props.session, start.hsv);
  /** A color value puts the color a press ends on in the history. */
  const remember = () => {
    if (spec().track) {
      recentFor(props.session).remember(props.session.brush().color);
    }
  };
  const scrub = pressHandlers({
    start() {
      start = { fraction: fraction(), hsv: hsv() };
    },
    move(press) {
      set(start.fraction + (press.point.x - press.start.x - (press.point.y - press.start.y)) / scrubLength);
    },
    end: remember,
    tap: (press) => props.onPopup?.(press.target)
  });
  const slide = pressHandlers({
    start(press) {
      start = { fraction: fraction(), hsv: hsv() };
      set(trackFraction(press));
    },
    move(press) {
      set(trackFraction(press));
    },
    end: remember,
    tapDistance: 0
  });

  function trackFraction(press: Press) {
    const rect = press.target.getBoundingClientRect();
    return vertical()
      ? (rect.bottom - press.point.y) / Math.max(1, rect.height)
      : (press.point.x - rect.left) / Math.max(1, rect.width);
  }

  const track = () => spec().track?.(hsv(), props.session);
  /** Color knobs show the brush color in their middle. */
  const swatched = () => track() !== undefined;

  const number = () => spec().number;

  return (
    <Show
      when={props.look !== 'number'}
      fallback={
        <div class={styles.number}>
          <Show when={props.span.columns >= 2}>
            <span class={styles.numberCaption}>
              {props.span.columns >= 3 ? spec().label : number().short}
            </span>
          </Show>
          <ScrubNumber
            label={spec().label}
            value={number().get(props.session.brush(), hsv(), props.session)}
            min={number().min ?? 0}
            max={number().max(props.session)}
            unit={props.span.columns >= 2 ? number().unit : undefined}
            scale={number().scale}
            wrap={number().wrap}
            onInput={(value) => number().set(value, props.session, hsv())}
            onChange={(value) => {
              number().set(value, props.session, hsv());
              remember();
            }}
          />
        </div>
      }
    >
      <Show
        when={!knob()}
        fallback={
          <div
            class={styles.knob}
            role="slider"
            aria-label={spec().label}
            aria-valuenow={Math.round(fraction() * 100)}
            style={{
              '--fraction': `${fraction() * 360}deg`,
              '--swatch': swatched() ? props.session.brush().color : undefined,
              '--swatch-ink': swatched() && luminance(props.session.brush().color) < 0.4 ? '#ffffff' : undefined
            }}
            {...scrub}
          >
            <span>{spec().text(fraction(), props.session)}</span>
          </div>
        }
      >
        <div
          class={[styles.slider, vertical() && styles.vertical, track() !== undefined && styles.colored]}
          role="slider"
          aria-label={spec().label}
          aria-orientation={vertical() ? 'vertical' : 'horizontal'}
          aria-valuenow={Math.round(fraction() * 100)}
          style={{
            '--fraction': `${fraction() * 100}%`,
            '--track-to': vertical() ? 'top' : 'right',
            background: track()
          }}
          {...slide}
        >
          <span class={styles.fill} />
          <span class={styles.thumb} />
          <Show when={(vertical() ? props.span.rows : props.span.columns) >= 3}>
            <span class={styles.sliderLabel}>
              <span>{spec().label}</span>
              <span>{spec().text(fraction(), props.session)}</span>
            </span>
          </Show>
        </div>
      </Show>
    </Show>
  );
}

const actions: Record<ActionKind, { label: string; icon: 'undo' | 'redo' | 'erase' | 'localUndo' | 'fill' }> = {
  undo: { label: 'Undo', icon: 'undo' },
  redo: { label: 'Redo', icon: 'redo' },
  eraser: { label: 'Eraser', icon: 'erase' },
  'local-undo': { label: 'Local undo', icon: 'localUndo' },
  mixing: { label: 'Mixing', icon: 'fill' }
};

function ActionPart(props: { action: ActionKind; span: Span; session: Session }) {
  const spec = () => actions[props.action];
  const state = () => props.session.engine.state();
  const disabled = () =>
    (props.action === 'undo' && !(state().canUndo && props.session.ready())) ||
    (props.action === 'redo' && !(state().canRedo && props.session.ready()));
  const active = () =>
    props.action === 'mixing'
      ? props.session.windows.isOpen('palette')
      : (props.action === 'eraser' || props.action === 'local-undo') && props.session.tool() === props.action;
  const iconSize = () => Math.min(40, 20 + (Math.min(props.span.columns, props.span.rows) - 1) * 10);

  return (
    <button
      type="button"
      class={styles.action}
      data-active={active() ? '' : undefined}
      disabled={disabled()}
      aria-label={spec().label}
      onClick={() => run()}
    >
      <SketchIcon name={spec().icon} size={iconSize()} />
      <Show when={props.span.columns >= 2}>
        <span class={styles.name}>{spec().label}</span>
      </Show>
    </button>
  );

  function run() {
    if (props.action === 'undo') {
      props.session.undo();
    } else if (props.action === 'redo') {
      props.session.redo();
    } else if (props.action === 'mixing') {
      props.session.windows.toggle('palette');
    } else if (props.action === 'eraser') {
      props.session.chooseTool(props.session.tool() === 'eraser' ? 'brush' : 'eraser');
    } else if (props.session.tool() === 'local-undo') {
      props.session.chooseTool(props.session.tools.slot());
    } else {
      props.session.chooseLocalUndo();
    }
  }
}
