import type { Brush } from '@app-game/paint-core/brush';
import { createMemo, Match, Show, Switch } from 'solid-js';
import { maxBrushSize } from '../../features/brush';
import { hexToHsv, hsvToHex, luminance, type Hsv } from '../../features/color/hsv';
import type { PaintSession } from '../../features/session';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { geometricFraction, geometricValue, linearFraction, linearValue } from '../procreate/sliderScale';
import { ColorDisc } from '../zen/ColorDisc';
import { PresetStroke } from '../zen/PresetStroke';
import { cellGap, pitch, type Span } from './board';
import styles from './LegoStudio.module.css';

/** The drawing session the parts work on. */
export type Session = PaintSession;

/** Brush values a value part shows and sets. */
export type ValueKind = 'size' | 'opacity' | 'hue' | 'saturation' | 'brightness';

/** CSS pixels a knob is dragged to go through its whole range. */
const scrubLength = 300;

/** Single-button actions. */
export type ActionKind = 'undo' | 'redo' | 'eraser' | 'local-undo';

/** What a part can open floating over the board: its value as a full slider, or the color disc. */
export type Popup = { kind: 'value'; value: ValueKind } | { kind: 'color' };

/**
 * One part of the board at its size, like an Android widget: the more cells it covers, the more it shows. A brush is
 * a stroke sample alone at one cell, gets its name once it is two cells wide and a large sample once it is two cells
 * tall; a value is a knob at one cell and a slider once longer, lying along its longer side; an action gets its name
 * once two cells wide; the color shows its hex once wide and becomes the whole color disc at 5×5 cells. `kind` is
 * `preset:<id>`, `value:<ValueKind>`, `action:<ActionKind>` or `color`.
 */
export function PartView(props: {
  kind: string;
  span: Span;
  session: Session;
  /** Opens `popup` beside `anchor`; see `Popup`. */
  onPopup: (anchor: Element, popup: Popup) => void;
}) {
  const parsed = () => parseKind(props.kind);

  return (
    <Switch fallback={<span class={styles.unknown}>?</span>}>
      <Match when={parsed()?.type === 'preset' && parsed()!.id}>
        {(id) => <PresetPart id={id()} span={props.span} session={props.session} />}
      </Match>
      <Match when={parsed()?.type === 'value' && (parsed()!.id as ValueKind)}>
        {(value) => (
          <ValuePart
            value={value()}
            span={props.span}
            session={props.session}
            onPopup={(anchor) => props.onPopup(anchor, { kind: 'value', value: value() })}
          />
        )}
      </Match>
      <Match when={parsed()?.type === 'action' && (parsed()!.id as ActionKind)}>
        {(action) => <ActionPart action={action()} span={props.span} session={props.session} />}
      </Match>
      <Match when={parsed()?.type === 'color'}>
        <ColorPart
          span={props.span}
          session={props.session}
          onPopup={(anchor) => props.onPopup(anchor, { kind: 'color' })}
        />
      </Match>
    </Switch>
  );
}

/** The kinds the box offers besides the brush presets, in box order. */
export const boxKinds = [
  'action:undo',
  'action:redo',
  'action:eraser',
  'action:local-undo',
  'color',
  'value:size',
  'value:opacity',
  'value:hue',
  'value:saturation',
  'value:brightness'
];

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

  return parsed?.type === 'color' ? 'Color' : kind;
}

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
    read: (brush: Brush, hsv: Hsv) => number;
    write: (fraction: number, session: Session, hsv: Hsv) => void;
    text: (fraction: number, session: Session) => string;
    /** The track's background; plain when absent. */
    track?: (hsv: Hsv) => string;
  }
> = {
  size: {
    label: 'Size',
    read: (brush) => geometricFraction(brush.size, 1, maxBrushSize(brush)),
    write: (fraction, session) =>
      session.tools.updateBrush({ size: geometricValue(fraction, 1, maxBrushSize(session.brush())) }),
    text: (_, session) => `${Math.round(session.brush().size)}`
  },
  opacity: {
    label: 'Opacity',
    read: (brush) => linearFraction(brush.opacity, 0, 1),
    write: (fraction, session) => session.tools.updateBrush({ opacity: linearValue(fraction, 0.01, 1) }),
    text: (fraction) => `${Math.round(fraction * 100)}%`
  },
  hue: {
    label: 'Hue',
    read: (_, hsv) => hsv.h / 360,
    write: (fraction, session, hsv) => setColor(session, { ...hsv, h: Math.min(359.9, fraction * 360) }),
    text: (fraction) => `${Math.round(fraction * 360)}°`,
    track: (hsv) =>
      `linear-gradient(to var(--track-to), ${[0, 60, 120, 180, 240, 300, 360].map((h) => hsvToHex({ h, s: hsv.s, v: hsv.v })).join(', ')})`
  },
  saturation: {
    label: 'Saturation',
    read: (_, hsv) => hsv.s,
    write: (fraction, session, hsv) => setColor(session, { ...hsv, s: fraction }),
    text: (fraction) => `${Math.round(fraction * 100)}%`,
    track: (hsv) =>
      `linear-gradient(to var(--track-to), ${hsvToHex({ ...hsv, s: 0 })}, ${hsvToHex({ ...hsv, s: 1 })})`
  },
  brightness: {
    label: 'Brightness',
    read: (_, hsv) => hsv.v,
    write: (fraction, session, hsv) => setColor(session, { ...hsv, v: fraction }),
    text: (fraction) => `${Math.round(fraction * 100)}%`,
    track: (hsv) =>
      `linear-gradient(to var(--track-to), ${hsvToHex({ ...hsv, v: 0 })}, ${hsvToHex({ ...hsv, v: 1 })})`
  }
};

/** Paints in `color` (`#rrggbb` or HSV) from now on; the eraser gives way to the brush. */
function setColor(session: Session, color: string | Hsv) {
  if (session.tool() === 'eraser') {
    session.chooseTool('brush');
  }

  session.tools.updateBrush({ color: typeof color === 'string' ? color : hsvToHex(color) });
}

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
 * A brush value: a knob at one cell, a slider along the longer side otherwise. Pressing the knob and dragging in any
 * direction changes the value (right and up raise it); tapping it opens the full slider beside it.
 */
export function ValuePart(props: {
  value: ValueKind;
  span: Span;
  session: Session;
  /** Opens the full slider beside `anchor`; absent on the popup's own slider. */
  onPopup?: (anchor: Element) => void;
}) {
  const hsv = createBrushHsv(props.session);
  const spec = () => values[props.value];
  const fraction = () => spec().read(props.session.brush(), hsv());
  const knob = () => props.span.columns === 1 && props.span.rows === 1;
  const vertical = () => props.span.rows > props.span.columns;
  /**
   * The value and color when the press began: a press changes one channel, and the others keep their values even
   * where the color alone would lose them, such as the hue while brightness passes black.
   */
  let start = { fraction: 0, hsv: hsv() };

  const set = (next: number) => spec().write(Math.max(0, Math.min(1, next)), props.session, start.hsv);
  const scrub = pressHandlers({
    start() {
      start = { fraction: fraction(), hsv: hsv() };
    },
    move(press) {
      set(start.fraction + (press.point.x - press.start.x - (press.point.y - press.start.y)) / scrubLength);
    },
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
    tapDistance: 0
  });

  function trackFraction(press: Press) {
    const rect = press.target.getBoundingClientRect();
    return vertical()
      ? (rect.bottom - press.point.y) / Math.max(1, rect.height)
      : (press.point.x - rect.left) / Math.max(1, rect.width);
  }

  const track = () => spec().track?.(hsv());
  /** Color knobs show the brush color in their middle. */
  const swatched = () => track() !== undefined;

  return (
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
  );
}

const actions: Record<ActionKind, { label: string; icon: 'undo' | 'redo' | 'erase' | 'localUndo' }> = {
  undo: { label: 'Undo', icon: 'undo' },
  redo: { label: 'Redo', icon: 'redo' },
  eraser: { label: 'Eraser', icon: 'erase' },
  'local-undo': { label: 'Local undo', icon: 'localUndo' }
};

function ActionPart(props: { action: ActionKind; span: Span; session: Session }) {
  const spec = () => actions[props.action];
  const state = () => props.session.engine.state();
  const disabled = () =>
    (props.action === 'undo' && !(state().canUndo && props.session.ready())) ||
    (props.action === 'redo' && !(state().canRedo && props.session.ready()));
  const active = () =>
    (props.action === 'eraser' || props.action === 'local-undo') && props.session.tool() === props.action;
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
    } else if (props.action === 'eraser') {
      props.session.chooseTool(props.session.tool() === 'eraser' ? 'brush' : 'eraser');
    } else if (props.session.tool() === 'local-undo') {
      props.session.chooseTool(props.session.tools.slot());
    } else {
      props.session.chooseLocalUndo();
    }
  }
}

/** Covers at least this many cells each way before the color part shows the whole disc. */
const discCells = 5;

function ColorPart(props: { span: Span; session: Session; onPopup: (anchor: Element) => void }) {
  const color = () => props.session.brush().color;
  const inline = () => props.span.columns >= discCells && props.span.rows >= discCells;

  return (
    <Show
      when={!inline()}
      fallback={
        <div class={styles.inlineDisc} style={{ '--disc-scale': `${Math.min(length(props.span.columns), length(props.span.rows)) / 232}` }}>
          <ColorDiscFor session={props.session} />
        </div>
      }
    >
      <button
        type="button"
        class={styles.color}
        style={{ background: color(), color: luminance(color()) > 0.4 ? '#1c1c1e' : '#ffffff' }}
        aria-label={`Color ${color()}`}
        onClick={(event) => props.onPopup(event.currentTarget)}
      >
        <Show when={props.span.columns >= 2}>
          <span class={styles.name}>{color()}</span>
        </Show>
      </button>
    </Show>
  );
}

/** The Zen variant's color disc on the session's brush color. */
export function ColorDiscFor(props: { session: Session }) {
  return (
    <ColorDisc color={props.session.brush().color} onInput={(color) => setColor(props.session, color)} onCommit={() => {}} />
  );
}

