import { Show } from 'solid-js';
import { wheelToHex } from '../../../features/color-wheel';
import { hsvToHex, luminance, type Hsv } from '../../../features/color/hsv';
import { pressHandlers, type Press } from '../../../shared/ui/pressHandlers';
import { ScrubNumber } from '../../../shared/ui/ScrubNumber';
import { geometricFraction, geometricValue } from '../../procreate/sliderScale';
import type { LegoServices } from '../LegoServices';
import styles from '../LegoStudio.module.css';
import type { LookSpec } from '../looks';
import { definePart, type PartBinding } from './definition';

/** Value kinds are derived from their static definitions; stored identifiers stay unchanged. */
export type ValueKind = (typeof channels)[number]['id'];

/** Shared looks resolved by looks.ts, independently of the channel's app binding. */
const looks: readonly LookSpec[] = [
  { id: 'knob', label: 'Knob', min: { columns: 1, rows: 1 } },
  { id: 'slider', label: 'Slider', min: { columns: 2, rows: 1 }, fits: (span) => span.columns >= 2 || span.rows >= 2 },
  { id: 'number', label: 'Number', min: { columns: 1, rows: 1 } }
];

/** A channel's complete read/write, range and presentation contract. Adding a value needs only one spec. */
export type ValueChannel = {
  id: string;
  label: string;
  short: string;
  unit: string;
  min: number;
  max: (services: LegoServices) => number;
  read: (services: LegoServices) => number;
  write: (services: LegoServices, value: number, hsv: Hsv) => void;
  colored: boolean;
  scale?: 'log';
  wrap?: boolean;
  /** Defaults to linear interpolation between min and max. */
  toFraction?: (value: number, max: number) => number;
  /** Maps a normalized gesture to the channel value; defaults to linear min/max interpolation. */
  fromFraction?: (fraction: number, max: number) => number;
  track?: (services: LegoServices) => string;
  format?: (value: number) => string;
  /** Restores channel-specific intent before the original color is restored without tool policy. */
  cancel?: (services: LegoServices, value: number) => void;
};

const channels = [
  {
    id: 'size',
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

/** Defines a value part from one complete channel spec. Missing writers fail immediately, including untyped input. */
export function defineValuePart(channel: ValueChannel) {
  if (typeof channel.write !== 'function') {
    throw new TypeError(`Value channel ${channel.id} requires a write command`);
  }

  return definePart({
    kind: `value:${channel.id}`,
    family: 'value',
    section: 'Values',
    label: channel.label,
    looks: { looks, auto: (span) => (span.columns === 1 && span.rows === 1 ? 'knob' : 'slider') },
    needs: (services, frame) => valueNeeds(services, frame, channel),
    View: ValuePart,
    popup: {
      needs: (services, frame) => valueNeeds(services, frame, channel),
      View: (props) => (
        <div class={styles.popupSlider}>
          <ValuePart {...props} look="slider" span={{ columns: 5, rows: 1 }} />
        </div>
      )
    }
  });
}

/** The LEGO look translates cells into the controlled input's orientation and captions. */
function ValuePart(props: ReturnType<typeof valueNeeds>) {
  return (
    <ValueControl
      {...props}
      vertical={props.span.rows > props.span.columns}
      caption={props.span.columns >= 2 ? (props.span.columns >= 3 ? props.label : props.short) : undefined}
      unit={props.span.columns >= 2 ? props.unit : undefined}
      named={(props.span.rows > props.span.columns ? props.span.rows : props.span.columns) >= 3}
    />
  );
}

/**
 * Controlled knob, slider or scrub field. Input callbacks edit live; commit records the settled edit; cancel
 * restores the exact captured value. This component has no session, registry, cells or storage knowledge.
 */
function ValueControl(
  props: Omit<ReturnType<typeof valueNeeds>, 'span' | 'unit'> & {
    vertical: boolean;
    caption?: string;
    unit?: string;
    named: boolean;
  }
) {
  let start = 0;
  const begin = () => {
    start = props.fraction;
    props.onStart();
  };
  const set = (value: number) => props.onInput(Math.max(0, Math.min(1, value)));
  const scrub = pressHandlers({
    start: begin,
    move: (press) => set(start + (press.point.x - press.start.x - (press.point.y - press.start.y)) / 300),
    end: props.onCommit,
    cancel: props.onCancel,
    tap: (press) => props.onOpen(press.target)
  });
  const slide = pressHandlers({
    start: (press) => {
      begin();
      set(trackFraction(press));
    },
    move: (press) => set(trackFraction(press)),
    end: props.onCommit,
    cancel: props.onCancel,
    tapDistance: 0
  });

  function trackFraction(press: Press) {
    const rect = press.target.getBoundingClientRect();
    return props.vertical
      ? (rect.bottom - press.point.y) / Math.max(1, rect.height)
      : (press.point.x - rect.left) / Math.max(1, rect.width);
  }

  return (
    <Show
      when={props.look !== 'number'}
      fallback={
        <div class={styles.number}>
          <Show when={props.caption}>
            <span class={styles.numberCaption}>{props.caption}</span>
          </Show>
          <ScrubNumber
            label={props.label}
            value={props.number}
            min={props.min}
            max={props.max}
            unit={props.unit}
            scale={props.scale}
            wrap={props.wrap}
            onStart={props.onStart}
            onCancel={props.onCancel}
            onInput={props.onNumberInput}
            onChange={props.onNumberCommit}
          />
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
            style={{
              '--fraction': `${props.fraction * 360}deg`,
              '--swatch': props.color,
              '--swatch-ink': props.color && luminance(props.color) < 0.4 ? '#ffffff' : undefined
            }}
            {...scrub}
          >
            <span>{props.text}</span>
          </div>
        }
      >
        <div
          class={[styles.slider, props.vertical && styles.vertical, props.track !== undefined && styles.colored]}
          role="slider"
          aria-label={props.label}
          aria-orientation={props.vertical ? 'vertical' : 'horizontal'}
          aria-valuenow={Math.round(props.fraction * 100)}
          style={{
            '--fraction': `${props.fraction * 100}%`,
            '--track-to': props.vertical ? 'top' : 'right',
            background: props.track
          }}
          {...slide}
        >
          <span class={styles.fill} />
          <span class={styles.thumb} />
          <Show when={props.named}>
            <span class={styles.sliderLabel}>
              <span>{props.label}</span>
              <span>{props.text}</span>
            </span>
          </Show>
        </div>
      </Show>
    </Show>
  );
}

/** Selects one channel's observations and guarded edits, preserving exact gesture cancellation. */
function valueNeeds(services: LegoServices, frame: PartBinding, channel: ValueChannel) {
  const { color } = services;
  const value = () => channel.read(services);
  const max = () => channel.max(services);
  const fraction = () => channel.toFraction?.(value(), max()) ?? (value() - channel.min) / (max() - channel.min);
  let start: { value: number; hsv: Hsv; color: string };
  const write = (next: number, hsv: Hsv) => channel.write(services, next, hsv);
  const commit = () => {
    if (channel.colored) {
      color.recent.remember(color.value());
    }
  };

  return {
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
      return Math.round(value());
    },
    get fraction() {
      return fraction();
    },
    get max() {
      return max();
    },
    min: channel.min,
    scale: channel.scale,
    wrap: channel.wrap,
    get text() {
      return channel.format?.(value()) ?? `${Math.round(value())}${channel.unit}`;
    },
    get color() {
      return channel.colored ? color.value() : undefined;
    },
    get track() {
      return channel.track?.(services);
    },
    onStart: frame.command(() => {
      start = { value: value(), hsv: color.hsv(), color: color.value() };
    }),
    onInput: frame.command((next: number) =>
      write(channel.fromFraction?.(next, max()) ?? channel.min + next * (max() - channel.min), start.hsv)
    ),
    onNumberInput: frame.command((next: number) => write(next, start.hsv)),
    onNumberCommit: frame.command((next: number) => {
      write(next, color.hsv());
      commit();
    }),
    onCommit: frame.command(commit),
    onCancel: frame.command(() => {
      if (channel.colored) {
        channel.cancel?.(services, start.value);
        color.restore(start.color);
      } else {
        write(start.value, start.hsv);
      }
    }),
    onOpen: (anchor: Element) => frame.onPopup(anchor, { kind: 'part', partKind: frame.kind })
  };
}

function gradient(stops: readonly string[]) {
  return `linear-gradient(to var(--track-to), ${stops.join(', ')})`;
}
