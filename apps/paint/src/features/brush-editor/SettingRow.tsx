import type { Brush } from '@app-game/paint-core/brush';
import { createMemo, createUniqueId, For, Show } from 'solid-js';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './BrushEditor.module.css';
import type { BrushSetting, ChoiceSetting, NumberSetting, ToggleSetting } from './schema';
import { Slider } from './Slider';

/**
 * One generated row of the brush editor for `setting`, which the caller has already found applicable. A row whose
 * setting is not `enabled` keeps its place and shows its value, greyed, and takes no presses. Every change is sent
 * at once as the patch the setting's `write` returns.
 */
export function SettingRow(props: { setting: BrushSetting; brush: Brush; onChange: (patch: Partial<Brush>) => void }) {
  // A row is made once per setting, so its kind never changes under it.
  const setting = props.setting;
  const enabled = createMemo(() => setting.enabled(props.brush));

  return setting.kind === 'number' ? (
    <NumberRow setting={setting} brush={props.brush} enabled={enabled()} onChange={props.onChange} />
  ) : setting.kind === 'toggle' ? (
    <ToggleRow setting={setting} brush={props.brush} enabled={enabled()} onChange={props.onChange} />
  ) : (
    <ChoiceRow setting={setting} brush={props.brush} enabled={enabled()} onChange={props.onChange} />
  );
}

/** What every row kind receives besides its setting. */
type RowProps = { brush: Brush; enabled: boolean; onChange: (patch: Partial<Brush>) => void };

/** Label, slider, number field and unit. The slider and the field change the value live. */
function NumberRow(props: RowProps & { setting: NumberSetting }) {
  const setting = props.setting;
  const labelId = createUniqueId();
  const value = createMemo(() => setting.read(props.brush));
  const min = createMemo(() => setting.min(props.brush));
  const max = createMemo(() => setting.max(props.brush));
  // Curves are built anew on each call; an equal one must not redraw the slider.
  const curve = createMemo(() => setting.curve?.(props.brush), {
    equals: (a, b) => JSON.stringify(a) === JSON.stringify(b)
  });
  const shown = createMemo(() => {
    const rounded = Math.round(value() / setting.step) * setting.step;
    return setting.format ? setting.format(rounded) : `${Number(rounded.toFixed(4))}`;
  });
  const write = (next: number) => {
    const brush = props.brush;
    const patch = setting.write(brush, next);
    if (setting.read({ ...brush, ...patch }) !== setting.read(brush)) {
      props.onChange(patch);
    }
  };

  return (
    <div class={styles.row} data-kind="number" data-disabled={props.enabled ? undefined : ''}>
      <span id={labelId} class={styles.label}>
        {setting.label}
      </span>
      <Slider
        labelledBy={labelId}
        value={value()}
        min={min()}
        max={max()}
        step={setting.step}
        curve={curve()}
        valueText={`${shown()}${setting.unit ? ` ${setting.unit}` : ''}`}
        disabled={!props.enabled}
        onInput={write}
      />
      <Show
        when={!setting.format}
        fallback={
          <output class={styles.formatted} aria-labelledby={labelId}>
            {shown()}
          </output>
        }
      >
        <ScrubNumber
          label={setting.label}
          value={value()}
          min={min()}
          max={max()}
          step={setting.step}
          scale={setting.curve ? 'log' : 'linear'}
          disabled={!props.enabled}
          onInput={write}
          onChange={write}
        />
      </Show>
      <span class={styles.unit}>{setting.unit}</span>
    </div>
  );
}

/** A full-width switch: the whole row flips it. */
function ToggleRow(props: RowProps & { setting: ToggleSetting }) {
  const setting = props.setting;
  const on = createMemo(() => setting.read(props.brush));

  return (
    <button
      type="button"
      class={styles.row}
      data-kind="toggle"
      role="switch"
      aria-checked={on() ? 'true' : 'false'}
      disabled={!props.enabled}
      onClick={() => props.onChange(setting.write(props.brush, !on()))}
    >
      <span class={styles.box}>
        <Show when={on()}>
          <SketchIcon name="check" size={16} />
        </Show>
      </span>
      <span class={styles.label}>{setting.label}</span>
    </button>
  );
}

/**
 * The options as a visible list, each a full-width row, with the chosen one marked. Under the list, the chosen
 * option's description; every description takes the same place, so choosing another option moves no row.
 */
function ChoiceRow(props: RowProps & { setting: ChoiceSetting }) {
  const setting = props.setting;
  const labelId = createUniqueId();
  const descriptionId = createUniqueId();
  const chosen = createMemo(() => setting.read(props.brush));
  const descriptions = [...new Set(setting.options.flatMap((option) => option.description ?? []))];
  const chosenDescription = createMemo(() => setting.options.find((option) => option.value === chosen())?.description);

  return (
    <div
      class={styles.choice}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-disabled={props.enabled ? undefined : 'true'}
      data-disabled={props.enabled ? undefined : ''}
    >
      <span id={labelId} class={styles.label}>
        {setting.label}
      </span>
      <For each={setting.options}>
        {(option) => (
          <button
            type="button"
            class={styles.option}
            role="radio"
            aria-checked={chosen() === option.value ? 'true' : 'false'}
            aria-describedby={option.description ? descriptionId : undefined}
            disabled={!props.enabled}
            onClick={() => {
              if (chosen() !== option.value) {
                props.onChange(setting.write(props.brush, option.value));
              }
            }}
          >
            <span class={styles.dot} />
            <span>{option.label}</span>
          </button>
        )}
      </For>
      <Show when={descriptions.length > 0}>
        <div class={styles.descriptions}>
          <For each={descriptions}>
            {(text) => (
              <p
                id={text === chosenDescription() ? descriptionId : undefined}
                data-shown={text === chosenDescription() ? '' : undefined}
              >
                {text}
              </p>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
