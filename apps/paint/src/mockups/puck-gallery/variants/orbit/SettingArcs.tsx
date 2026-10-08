import { createMemo, createSignal, createUniqueId, For, Show } from 'solid-js';
import type { Setting } from '../../kit/catalog';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { pressHandlers } from '../../kit/pressHandlers';
import { formatValue, fractionOf, valueAt, type NumberSetting } from '../../kit/values';
import { galleryUi } from '../../kit/variant';
import {
  angleOf,
  polar,
  satellites,
  sectorPath,
  settingBand,
  settingSlot,
  spokePath,
  wrap,
  type SettingSlot
} from './geometry';
import styles from './Orbit.module.css';
import { tappable, tapPress } from './tapPress';

/**
 * The current tool's settings as arcs wrapping the rim on the non-hand side, Krita's slider spin boxes bent around
 * the disc: numbers are gauges (`Gauge`), four at a time with a pager at 3 o'clock when the tool has more; choices
 * are segmented arcs and toggles share one arc of switch segments (`SegmentArc`). Slots fill the inner ring first,
 * upper arc before lower, so the most important settings sit nearest the disc. Renders into the Orbit's SVG scene.
 */
export function SettingArcs(props: {
  studio: Studio;
  side: 1 | -1;
  /** The page of numbers shown, kept by the variant across openings. */
  page: number;
  setPage: (page: number) => void;
  toLocal: (client: Point) => Point;
}) {
  const numbers = createMemo(() =>
    props.studio.settings().filter((setting): setting is NumberSetting => setting.kind === 'number')
  );
  const choices = createMemo(() =>
    props.studio.settings().filter((setting): setting is ChoiceSetting => setting.kind === 'choice')
  );
  const toggles = createMemo(() =>
    props.studio.settings().filter((setting): setting is ToggleSetting => setting.kind === 'toggle')
  );
  const pages = () => Math.max(1, Math.ceil(numbers().length / perPage));
  const page = () => Math.min(props.page, pages() - 1);
  const shown = () => numbers().slice(page() * perPage, page() * perPage + perPage);
  /** Numbers keep their slots on every page, so choices and toggles never move when paging. */
  const reserved = () => Math.min(perPage, numbers().length);
  const pager = () => polar(props.side * satellites.pager.angle, satellites.pager.radius);
  const pagerPress = tapPress(() => props.setPage((page() + 1) % pages()));

  return (
    <g data-part="ui">
      <For each={shown()} keyed={(setting) => setting.key}>
        {(setting, index) => (
          <Gauge
            studio={props.studio}
            setting={setting()}
            slot={settingSlot(index(), props.side)}
            toLocal={props.toLocal}
          />
        )}
      </For>
      <For each={choices()} keyed={(setting) => setting.key}>
        {(setting, index) => (
          <SegmentArc
            slot={settingSlot(reserved() + index(), props.side)}
            label={setting().label.toUpperCase()}
            shortLabel={setting().short.toUpperCase()}
            title={setting().label}
            wheel="choice"
            wheelKey={setting().key}
            segments={setting().options.map((option) => ({
              text: option,
              on: props.studio.value(setting().key) === option,
              choose: () => props.studio.setValue(setting().key, option)
            }))}
          />
        )}
      </For>
      <Show when={toggles().length > 0}>
        <SegmentArc
          slot={settingSlot(reserved() + choices().length, props.side)}
          segments={toggles().map((setting) => ({
            text: setting.label,
            on: props.studio.value(setting.key) === true,
            choose: () => props.studio.setValue(setting.key, props.studio.value(setting.key) !== true)
          }))}
        />
      </Show>
      <Show when={pages() > 1}>
        <g
          ref={tappable}
          class={styles.pager}
          {...galleryUi}
          {...pagerPress}
          transform={`translate(${pager().x} ${pager().y})`}
        >
          <title>More settings (Tab)</title>
          <circle r="14" />
          <text>{`${page() + 1}/${pages()}`}</text>
        </g>
      </Show>
    </g>
  );
}

const perPage = 4;

type ChoiceSetting = Extract<Setting, { kind: 'choice' }>;
type ToggleSetting = Extract<Setting, { kind: 'toggle' }>;

/**
 * A number as an arc gauge: a band filled from its low end to the value, a bright edge at the value, and the name and
 * value printed along the band at its outer end. Press anywhere on the band to set the value there and drag along
 * the arc to change it; log settings (sizes, spacing) move geometrically. The wheel steps through the setting's
 * presets (handled by the Orbit).
 */
function Gauge(props: {
  studio: Studio;
  setting: NumberSetting;
  slot: SettingSlot;
  toLocal: (client: Point) => Point;
}) {
  const id = createUniqueId();
  const [dragging, setDragging] = createSignal(false);
  const value = () => props.studio.number(props.setting.key);
  const at = () => props.slot.low + (props.slot.high - props.slot.low) * fractionOf(props.setting, value());
  const inner = () => props.slot.radius - settingBand / 2;
  const outer = () => props.slot.radius + settingBand / 2;

  const setFrom = (client: Point) => {
    const { low, high } = props.slot;
    const middle = (low + high) / 2;
    const angle = middle + wrap(angleOf(props.toLocal(client)) - middle);
    props.studio.setValue(props.setting.key, valueAt(props.setting, (angle - low) / (high - low)));
  };
  const press = pressHandlers({
    start: (press) => {
      setDragging(true);
      setFrom(press.point);
    },
    move: (press) => setFrom(press.point),
    end: () => setDragging(false),
    cancel: () => setDragging(false)
  });

  return (
    <g class={[styles.gauge, { [styles.dragging!]: dragging() }]}>
      <path
        ref={tappable}
        class={styles.band}
        {...galleryUi}
        {...press}
        data-wheel="gauge"
        data-key={props.setting.key}
        d={sectorPath(inner(), outer(), props.slot.low, props.slot.high)}
      >
        <title>{`${props.setting.label}: drag along the arc, or use the wheel`}</title>
      </path>
      <path class={styles.fill} d={sectorPath(inner(), outer(), props.slot.low, at())} />
      <path class={styles.edge} d={spokePath(at(), inner() + 1, outer() - 1)} />
      <path id={id} d={props.slot.textPath} fill="none" />
      <text class={styles.arcText} text-anchor={props.slot.anchor} dominant-baseline="central">
        <textPath href={`#${id}`} startOffset={props.slot.anchor === 'start' ? 8 : props.slot.length - 8}>
          <tspan class={styles.arcLabel}>{props.setting.label.toUpperCase()}</tspan>
          <tspan dx="5">{`${formatValue(value())}${props.setting.unit === '%' || props.setting.unit === '°' ? '' : ' '}${props.setting.unit}`}</tspan>
        </textPath>
      </text>
    </g>
  );
}

/**
 * An arc of segments that light up blue when on: a choice's options (one on) or a tool's toggles (each its own).
 * An optional `label` takes the arc's outer end, where the readouts of gauges sit (`shortLabel` instead when the
 * full one would crowd the segments); segments share the rest in reading order. Long names shorten to fit.
 */
function SegmentArc(props: {
  slot: SettingSlot;
  segments: readonly { text: string; on: boolean; choose: () => void }[];
  label?: string;
  shortLabel?: string;
  title?: string;
  wheel?: string;
  wheelKey?: string;
}) {
  const id = createUniqueId();
  const label = () => {
    const full = props.label ?? '';
    const roomy = (props.slot.length - labelSpace(full)) / props.segments.length >= 46;
    return roomy || !props.shortLabel ? full : props.shortLabel;
  };
  const labelLength = () => labelSpace(label());
  /** Where each segment lies along the text path, in pixels from its start; the label leads or trails it. */
  const spans = () => {
    const count = props.segments.length;
    const free = props.slot.length - labelLength();
    const offset = props.slot.anchor === 'start' ? labelLength() : 0;
    return props.segments.map((_, index) => ({
      from: offset + (free * index) / count + 1.5,
      to: offset + (free * (index + 1)) / count - 1.5
    }));
  };
  const inner = () => props.slot.radius - settingBand / 2;
  const outer = () => props.slot.radius + settingBand / 2;

  return (
    <g class={styles.segments}>
      <Show when={label()}>
        {(label) => (
          <>
            <path
              class={styles.labelBand}
              {...galleryUi}
              d={sectorPath(
                inner(),
                outer(),
                props.slot.along(props.slot.anchor === 'start' ? 0 : props.slot.length - labelLength() + 1.5),
                props.slot.along(props.slot.anchor === 'start' ? labelLength() - 1.5 : props.slot.length)
              )}
            />
            <path id={`${id}-label`} d={props.slot.textPath} fill="none" />
            <text class={styles.arcText} text-anchor={props.slot.anchor} dominant-baseline="central">
              <textPath href={`#${id}-label`} startOffset={props.slot.anchor === 'start' ? 6 : props.slot.length - 6}>
                <tspan class={styles.arcLabel}>{label()}</tspan>
                <title>{props.title}</title>
              </textPath>
            </text>
          </>
        )}
      </Show>
      <For each={props.segments} keyed={false}>
        {(segment, index) => {
          const from = () => props.slot.along(spans()[index]!.from);
          const to = () => props.slot.along(spans()[index]!.to);
          const length = () => spans()[index]!.to - spans()[index]!.from;
          const press = tapPress(() => segment().choose());
          return (
            <g class={[styles.segment, { [styles.on!]: segment().on }]}>
              <path
                ref={tappable}
                class={styles.segmentBand}
                {...galleryUi}
                {...press}
                data-wheel={props.wheel}
                data-key={props.wheelKey}
                d={sectorPath(inner(), outer(), from(), to())}
              >
                <title>{segment().text}</title>
              </path>
              <path id={`${id}-${index}`} d={arcAlong(props.slot, from(), to())} fill="none" />
              <text class={styles.segmentText} text-anchor="middle" dominant-baseline="central">
                <textPath href={`#${id}-${index}`} startOffset="50%">
                  {shorten(segment().text, length())}
                </textPath>
              </text>
            </g>
          );
        }}
      </For>
    </g>
  );
}

/** A text path along the slot's ring between two of its angles, in the slot's reading direction. */
function arcAlong(slot: SettingSlot, from: number, to: number) {
  const start = polar(from, slot.radius);
  const end = polar(to, slot.radius);
  return `M ${start.x} ${start.y} A ${slot.radius} ${slot.radius} 0 0 ${to > from ? 1 : 0} ${end.x} ${end.y}`;
}

/** The pixels a segment arc's label takes along the arc, none without a label. */
function labelSpace(label: string) {
  return label ? label.length * 6.4 + 14 : 0;
}

/** Shortens a name to fit `length` pixels of small text: whole when it fits, else cut with a period. */
function shorten(text: string, length: number) {
  const fits = Math.floor((length - 6) / 5.4);
  if (text.length <= fits) {
    return text;
  }

  return `${text.slice(0, Math.max(2, fits - 1)).trimEnd()}.`;
}
