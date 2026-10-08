import { For, Show } from 'solid-js';
import { presets, type Setting } from '../../kit/catalog';
import type { Studio } from '../../kit/createStudio';
import { galleryUi } from '../../kit/variant';
import { dialControl, type Dial } from './dials';
import styles from './Encoders.module.css';
import { Knob } from './Knob';
import { tapHandlers } from './tapHandlers';

/**
 * The encoder section, as on Push: two rows of four knobs for the current tool's numbers around one screen that
 * labels them (each label faces its knob), and four soft keys below for the tool's toggles and choices. Encoders
 * without a setting stay dark. Pressing a knob or its screen cell selects it for the arrow keys.
 */
export function Encoders(props: {
  studio: Studio;
  /** Eight slots, top row first; `undefined` for unused encoders. */
  dials: readonly (Dial | undefined)[];
  /** The dial the arrow keys turn. */
  cursor: string | undefined;
  onSelect: (dial: Dial) => void;
}) {
  const controls = slots.map((slot) =>
    dialControl(
      () => props.dials[slot],
      (dial) => props.onSelect(dial)
    )
  );
  const selected = (slot: number) => props.dials[slot] !== undefined && props.dials[slot]?.id === props.cursor;
  const title = () => {
    const tool = props.studio.toolInfo();
    const preset = presets.find((entry) => entry.id === props.studio.preset());
    return preset?.tool === tool.id ? `${tool.label} · ${preset.name}` : tool.label;
  };

  const knob = (slot: number) => (
    <div class={styles.knobCell} {...galleryUi} {...controls[slot]}>
      <Knob
        fraction={props.dials[slot]?.fraction()}
        bipolar={props.dials[slot]?.bipolar}
        detents={props.dials[slot]?.detents}
        selected={selected(slot)}
      />
    </div>
  );
  const cell = (slot: number) => (
    <div
      class={[styles.cell, { [styles.below!]: slot >= 4, [styles.cursor!]: selected(slot) }]}
      {...galleryUi}
      {...controls[slot]}
    >
      <span class={styles.label}>{props.dials[slot]?.label ?? ''}</span>
      <LcdValue text={props.dials[slot]?.text() ?? '·'} />
    </div>
  );

  return (
    <div class={styles.encoders}>
      <div class={styles.row}>{slots.slice(0, 4).map(knob)}</div>
      <div class={styles.screen}>
        <div class={styles.cells}>{slots.slice(0, 4).map(cell)}</div>
        <div class={styles.title}>
          <span>{title()}</span>
          <span class={styles.legend}>←→ ↑↓</span>
        </div>
        <div class={styles.cells}>{slots.slice(4).map(cell)}</div>
      </div>
      <div class={styles.row}>{slots.slice(4).map(knob)}</div>
      <SoftKeys studio={props.studio} />
    </div>
  );
}

/** A screen value with its unit set smaller, as LCDs print it: `12` `px`; words (choices) print smaller. */
export function LcdValue(props: { text: string }) {
  const parts = () => /^(-?[\d.]+)(.*)$/.exec(props.text);

  return (
    <Show when={parts()} fallback={<span class={[styles.value, styles.word]}>{props.text}</span>}>
      {(number) => (
        <span class={styles.value}>
          {number()[1]}
          <span class={styles.unit}>{number()[2]}</span>
        </span>
      )}
    </Show>
  );
}

/**
 * Soft keys under the encoders for the current tool's toggles (a key with an LED) and choices (a stepper: ‹ › or
 * a tap on the value steps through the options). Up to four slots; choices take two. Keys Y U I O press them in
 * order, Shift steps choices back.
 */
function SoftKeys(props: { studio: Studio }) {
  const soft = () => softSettings(props.studio);
  const blanks = () => Math.max(0, 4 - soft().reduce((sum, setting) => sum + (setting.kind === 'choice' ? 2 : 1), 0));

  return (
    <div class={styles.soft}>
      <For each={soft()}>
        {(setting, index) => {
          const hint = () => softKeyHints[index()] ?? '';
          if (setting.kind === 'toggle') {
            const on = () => props.studio.value(setting.key) === true;
            return (
              <button
                class={[styles.toggle, { [styles.on!]: on() }]}
                {...galleryUi}
                {...tapHandlers(() => stepSoft(props.studio, setting, 1))}
                aria-pressed={on() ? 'true' : 'false'}
              >
                <i class={styles.led} />
                <span>{toggleLabels[setting.key] ?? setting.label}</span>
                <kbd>{hint()}</kbd>
              </button>
            );
          }

          return (
            <div class={styles.choice}>
              <button class={styles.stepper} {...galleryUi} {...tapHandlers(() => stepSoft(props.studio, setting, -1))}>
                ‹
              </button>
              <button
                class={styles.choiceValue}
                {...galleryUi}
                {...tapHandlers(() => stepSoft(props.studio, setting, 1))}
              >
                <small>
                  {setting.label}
                  <kbd>{hint()}</kbd>
                </small>
                <b>{String(props.studio.value(setting.key))}</b>
              </button>
              <button class={styles.stepper} {...galleryUi} {...tapHandlers(() => stepSoft(props.studio, setting, 1))}>
                ›
              </button>
            </div>
          );
        }}
      </For>
      <For each={Array.from({ length: blanks() })}>{() => <span class={styles.blank} />}</For>
    </div>
  );
}

/** The current tool's toggles and choices that get soft keys, at most four slots' worth. */
export function softSettings(studio: Studio) {
  const choices: Exclude<Setting, { kind: 'number' }>[] = [];
  let used = 0;
  for (const setting of studio.settings()) {
    if (setting.kind === 'number') {
      continue;
    }

    used += setting.kind === 'choice' ? 2 : 1;
    if (used <= 4) {
      choices.push(setting);
    }
  }

  return choices;
}

/** Presses a soft key: flips a toggle, or steps a choice `by` options (wrapping). */
export function stepSoft(studio: Studio, setting: Exclude<Setting, { kind: 'number' }>, by: number) {
  if (setting.kind === 'toggle') {
    studio.setValue(setting.key, studio.value(setting.key) !== true);
    return;
  }

  const index = setting.options.indexOf(String(studio.value(setting.key)));
  const next = (((index + by) % setting.options.length) + setting.options.length) % setting.options.length;
  studio.setValue(setting.key, setting.options[next]!);
}

/** `KeyboardEvent.code` of the soft keys, in order. */
export const softKeyCodes = ['KeyY', 'KeyU', 'KeyI', 'KeyO'] as const;
const softKeyHints = softKeyCodes.map((code) => code.slice(3));

const slots = [0, 1, 2, 3, 4, 5, 6, 7];

const toggleLabels: Record<string, string> = {
  pressureSize: 'Pen → size',
  pressureOpacity: 'Pen → opac',
  antialias: 'Antialias',
  dither: 'Dither'
};
