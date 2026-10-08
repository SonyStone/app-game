import type { JSX } from '@solidjs/web';
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import type { Setting, SettingValue } from '../../kit/catalog';
import type { Studio } from '../../kit/createStudio';
import { pressHandlers, type Press } from '../../kit/pressHandlers';
import { formatValue, fractionOf, stepPreset, valueAt, type NumberSetting } from '../../kit/values';
import { galleryUi } from '../../kit/variant';
import styles from './Deck.module.css';

/**
 * `pressHandlers` for one element nested among others: a press belongs to the innermost pressable element under it,
 * so a card does not steal the capture of a button on it. Also marks the element as the variant's UI.
 *
 * Create it once, in a component or row body, and spread the variable: `<div {...press}>`. Called inline in JSX it
 * would be rebuilt whenever another reactive attribute of the element changes, losing the press in progress.
 */
export function pressable(options: Parameters<typeof pressHandlers>[0]) {
  return {
    ...galleryUi,
    'data-press': '',
    ...pressHandlers({
      ...options,
      start(press, event) {
        if ((event.target as Element).closest('[data-press]') !== event.currentTarget) {
          return false;
        }

        return options.start?.(press, event);
      }
    })
  };
}

/** A button that acts on a tap (pen, finger or mouse), without taking focus. */
export function TapButton(props: {
  onTap: () => void;
  class?: string;
  title?: string;
  on?: boolean;
  /** Dims the button and ignores taps; it still takes presses, so that they do not reach the drawing. */
  disabled?: boolean;
  children: JSX.Element;
}) {
  const press = pressable({
    tap: () => {
      if (props.disabled !== true) {
        props.onTap();
      }
    }
  });

  return (
    <button
      type="button"
      class={[
        styles.button,
        props.class,
        { [styles.on!]: props.on === true, [styles.disabled!]: props.disabled === true }
      ]}
      title={props.title}
      aria-disabled={props.disabled === true ? 'true' : undefined}
      {...press}
    >
      {props.children}
    </button>
  );
}

/**
 * A number as a drag-to-scrub chip, in the manner of Blender's fields: drag sideways to scrub (300 px for the
 * whole range, geometrically for log settings, four times finer with Shift), tap ‹ or › at the ends to step through the setting's presets, or turn the wheel
 * over it. The fill shows where the value lies in its range.
 */
export function ScrubChip(props: { setting: NumberSetting; value: number; onChange: (value: number) => void }) {
  const [scrubbing, setScrubbing] = createSignal(false);
  /** The unrounded position while scrubbing, so that slow drags still move rounded values. */
  let fraction = 0;
  const step = (steps: number) => props.onChange(stepPreset(props.setting, props.value, steps));
  const press = pressable({
    start() {
      fraction = fractionOf(props.setting, props.value);
    },
    move(press) {
      if (!press.moved) {
        return;
      }

      setScrubbing(true);
      fraction = Math.min(1, Math.max(0, fraction + press.delta.x / (press.shift ? 1200 : 300)));
      props.onChange(valueAt(props.setting, fraction));
    },
    tap(press) {
      const edge = edgeOf(press);
      if (edge !== 0) {
        step(edge);
      }
    },
    end: () => setScrubbing(false),
    cancel: () => setScrubbing(false)
  });

  return (
    <div
      class={[styles.chip, { [styles.scrubbing!]: scrubbing() }]}
      style={{ '--fraction': `${fractionOf(props.setting, props.value) * 100}%` }}
      title={`${props.setting.label}: drag to scrub, tap ‹ › to step, wheel`}
      onWheel={(event) => {
        event.preventDefault();
        step(event.deltaY > 0 ? -1 : 1);
      }}
      {...press}
    >
      <span class={styles.chipFill} />
      <span class={styles.chipStep}>‹</span>
      <span class={styles.chipLabel}>{props.setting.label}</span>
      <span class={styles.chipValue}>
        {formatValue(props.value)}
        <small>{props.setting.unit}</small>
      </span>
      <span class={styles.chipStep}>›</span>
    </div>
  );
}

/**
 * One of a list of options as a scrub chip: drag sideways through the options, tap ‹ › at the ends to step, or turn
 * the wheel. For long lists such as blend modes.
 */
export function StepChip<T extends string>(props: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  format?: (value: T) => string;
}) {
  const [scrubbing, setScrubbing] = createSignal(false);
  let position = 0;
  const indexOf = () => Math.max(0, props.options.indexOf(props.value));
  const go = (index: number) => {
    const clamped = Math.min(props.options.length - 1, Math.max(0, index));
    props.onChange(props.options[clamped]!);
  };
  const press = pressable({
    start() {
      position = indexOf();
    },
    move(press) {
      if (!press.moved) {
        return;
      }

      setScrubbing(true);
      position += press.delta.x / 26;
      go(Math.round(position));
    },
    tap(press) {
      const edge = edgeOf(press);
      if (edge !== 0) {
        go(indexOf() + edge);
      }
    },
    end: () => setScrubbing(false),
    cancel: () => setScrubbing(false)
  });

  return (
    <div
      class={[styles.chip, { [styles.scrubbing!]: scrubbing() }]}
      style={{ '--fraction': `${(indexOf() / Math.max(1, props.options.length - 1)) * 100}%` }}
      title={`${props.label}: drag to scrub, tap ‹ › to step, wheel`}
      onWheel={(event) => {
        event.preventDefault();
        go(indexOf() + (event.deltaY > 0 ? 1 : -1));
      }}
      {...press}
    >
      <span class={styles.chipFill} />
      <span class={styles.chipStep}>‹</span>
      <span class={styles.chipLabel}>{props.label}</span>
      <span class={styles.chipValue}>{(props.format ?? String)(props.value)}</span>
      <span class={styles.chipStep}>›</span>
    </div>
  );
}

/** Choices as a row of segments; wraps when the options do not fit. */
export function Segmented(props: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <div class={styles.segmented} role="radiogroup" aria-label={props.label}>
      <Show when={props.label}>{(label) => <span class={styles.segmentedLabel}>{label()}</span>}</Show>
      <For each={props.options}>
        {(option) => (
          <TapButton class={styles.segment} on={option === props.value} onTap={() => props.onChange(option)}>
            {option}
          </TapButton>
        )}
      </For>
    </div>
  );
}

/** An on/off setting as a chip with a switch. */
export function ToggleChip(props: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <TapButton class={styles.toggle} on={props.on} onTap={() => props.onChange(!props.on)}>
      <span class={styles.toggleLabel}>{props.label}</span>
      <span class={styles.switch} />
    </TapButton>
  );
}

/**
 * A setting of the current tool (or of `of`) as the deck shows it: numbers scrub, choices are segments, toggles
 * switch. Choices span the full width of a two-column grid.
 */
export function SettingControl(props: { studio: Studio; setting: Setting }) {
  const value = (): SettingValue | undefined => props.studio.value(props.setting.key);
  const set = (next: SettingValue) => props.studio.setValue(props.setting.key, next);

  return (
    <Switch>
      <Match when={props.setting.kind === 'number' && props.setting}>
        {(setting) => (
          <ScrubChip
            setting={setting()}
            value={typeof value() === 'number' ? (value() as number) : setting().min}
            onChange={set}
          />
        )}
      </Match>
      <Match when={props.setting.kind === 'choice' && props.setting}>
        {(setting) => (
          <div class={styles.wide}>
            <Segmented label={setting().label} options={setting().options} value={String(value())} onChange={set} />
          </div>
        )}
      </Match>
      <Match when={props.setting.kind === 'toggle' && props.setting}>
        {(setting) => <ToggleChip label={setting().label} on={value() === true} onChange={set} />}
      </Match>
    </Switch>
  );
}

/** −1 for a press on a chip's left step zone, 1 on its right one, 0 in between. */
function edgeOf(press: Press) {
  const box = press.target.getBoundingClientRect();
  const x = press.start.x - box.left;
  if (x < stepZone) {
    return -1;
  }

  if (x > box.width - stepZone) {
    return 1;
  }

  return 0;
}

/** The width of a chip's ‹ › step zones, a finger's secondary target. */
const stepZone = 30;
