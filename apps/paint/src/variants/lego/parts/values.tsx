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

const channels = [
  { id: 'size', label: 'Size', short: 'Sz', unit: 'px' },
  { id: 'opacity', label: 'Opacity', short: 'Op', unit: '%' },
  { id: 'hue', label: 'Hue', short: 'H', unit: '°' },
  { id: 'saturation', label: 'Saturation', short: 'S', unit: '%' },
  { id: 'brightness', label: 'Brightness', short: 'B', unit: '%' },
  { id: 'lightness', label: 'Lightness', short: 'L', unit: '%' }
] as const;

/** One definition per channel, including its full-slider popup. Bindings are created only under a mounted frame. */
export const valueParts = channels.map((channel) =>
  definePart({
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
  })
);

/** The LEGO look translates cells into the controlled input's orientation and captions. */
export function ValuePart(props: ReturnType<typeof valueNeeds>) {
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
export function ValueControl(
  props: Omit<ReturnType<typeof valueNeeds>, 'span'> & {
    vertical: boolean;
    caption?: string;
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
function valueNeeds(services: LegoServices, frame: PartBinding, channel: (typeof channels)[number]) {
  const { id } = channel;
  const { brush, color } = services;
  const colored = id !== 'size' && id !== 'opacity';
  const value = () => {
    switch (id) {
      case 'size':
        return brush.size();
      case 'opacity':
        return brush.opacity() * 100;
      case 'hue':
        return color.hsv().h;
      case 'saturation':
        return color.hsv().s * 100;
      case 'brightness':
        return color.hsv().v * 100;
      case 'lightness':
        return color.oklch.wheel().l * 100;
    }
  };
  const max = () => (id === 'size' ? brush.maxSize() : id === 'hue' ? 360 : 100);
  const fraction = () => (id === 'size' ? geometricFraction(value(), 1, max()) : value() / max());
  let start: { value: number; hsv: Hsv; color: string };
  const write = (next: number, hsv: Hsv) => {
    switch (id) {
      case 'size':
        brush.update({ size: next });
        break;
      case 'opacity':
        brush.update({ opacity: next / 100 });
        break;
      case 'hue':
        color.set(hsvToHex({ ...hsv, h: next % 360 }));
        break;
      case 'saturation':
        color.set(hsvToHex({ ...hsv, s: next / 100 }));
        break;
      case 'brightness':
        color.set(hsvToHex({ ...hsv, v: next / 100 }));
        break;
      case 'lightness':
        color.oklch.edit({ ...color.oklch.wheel(), l: next / 100 });
        break;
    }
  };
  const commit = () => {
    if (colored) {
      color.recent.remember(color.value());
    }
  };

  return {
    label: channel.label,
    short: channel.short,
    unit: channel.unit as string | undefined,
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
    min: id === 'size' || id === 'opacity' ? 1 : 0,
    scale: id === 'size' ? ('log' as const) : undefined,
    wrap: id === 'hue',
    get text() {
      return `${Math.round(id === 'size' ? value() : fraction() * max())}${id === 'size' ? '' : channel.unit}`;
    },
    get color() {
      return colored ? color.value() : undefined;
    },
    get track() {
      return channelTrack(id, color.hsv, color.oklch.wheel);
    },
    onStart: frame.command(() => {
      start = { value: value(), hsv: color.hsv(), color: color.value() };
    }),
    onInput: frame.command((next: number) =>
      write(
        id === 'size'
          ? geometricValue(next, 1, max())
          : id === 'hue'
            ? Math.min(359.9, next * 360)
            : id === 'opacity'
              ? 1 + next * 99
              : next * 100,
        start.hsv
      )
    ),
    onNumberInput: frame.command((next: number) => write(next, start.hsv)),
    onNumberCommit: frame.command((next: number) => {
      write(next, color.hsv());
      commit();
    }),
    onCommit: frame.command(commit),
    onCancel: frame.command(() => {
      if (id === 'size' || id === 'opacity') {
        brush.update({ [id]: id === 'size' ? start.value : start.value / 100 });
      } else {
        if (id === 'lightness') {
          color.oklch.edit({ ...color.oklch.wheel(), l: start.value / 100 });
        }

        color.restore(start.color);
      }
    }),
    onOpen: (anchor: Element) => frame.onPopup(anchor, { kind: 'part', partKind: frame.kind })
  };
}

function channelTrack(
  id: ValueKind,
  hsv: LegoServices['color']['hsv'],
  wheel: LegoServices['color']['oklch']['wheel']
) {
  if (id === 'size' || id === 'opacity') {
    return undefined;
  }

  const stops =
    id === 'lightness'
      ? Array.from({ length: 11 }, (_, index) => wheelToHex({ ...wheel(), l: index / 10 }))
      : id === 'hue'
        ? [0, 60, 120, 180, 240, 300, 360].map((h) => hsvToHex({ ...hsv(), h }))
        : [0, 1].map((value) => hsvToHex({ ...hsv(), [id === 'saturation' ? 's' : 'v']: value }));
  return `linear-gradient(to var(--track-to), ${stops.join(', ')})`;
}
