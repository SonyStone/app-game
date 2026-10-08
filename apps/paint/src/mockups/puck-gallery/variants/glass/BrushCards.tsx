import { createSignal, For, Show } from 'solid-js';
import { SketchIcon } from '../../../../shared/ui/SketchIcon';
import { presets, type Preset } from '../../kit/catalog';
import type { Studio } from '../../kit/createStudio';
import { StrokePreview } from '../../kit/StrokePreview';
import { galleryUi } from '../../kit/variant';
import styles from './BrushCards.module.css';
import { PillScrubber, Segmented, SwitchRow, TapButton } from './controls';
import css from './glass.module.css';
import { placed, type Box } from './layout';

/**
 * Procreate's Brush Library: brush sets on the left, the chosen set's brushes as wide stroke cards on the right, the
 * active brush in blue. Choosing a brush applies it and finishes; choosing a set only browses. The set follows the
 * active brush each time the brush changes.
 */
export function BrushLibrary(props: { studio: Studio; box: Box; done: () => void }) {
  const active = () => presets.find((preset) => preset.id === props.studio.preset());
  const [set, setSet] = createSignal<Preset['set']>(() => active()?.set ?? 'Inking');
  const isActive = (preset: Preset) => props.studio.preset() === preset.id && props.studio.tool() === preset.tool;

  return (
    <section class={[css.card, styles.library]} style={placed(props.box)} {...galleryUi}>
      <header class={css.cardHeader}>
        <h3>Brush Library</h3>
      </header>
      <div class={styles.columns}>
        <nav class={styles.sets}>
          <For each={sets}>
            {(name) => (
              <TapButton class={[styles.set, { [styles.on!]: set() === name }]} onTap={() => setSet(name)}>
                <span>{name}</span>
                <Show when={active()?.set === name && props.studio.tool() === active()?.tool}>
                  <i class={styles.dot} />
                </Show>
              </TapButton>
            )}
          </For>
        </nav>
        <div class={styles.brushes}>
          <For each={presets.filter((preset) => preset.set === set())}>
            {(preset) => (
              <TapButton
                class={[styles.brush, { [styles.on!]: isActive(preset) }]}
                onTap={() => {
                  props.studio.choosePreset(preset.id);
                  props.done();
                }}
              >
                <span class={styles.brushName}>{preset.name}</span>
                <StrokePreview preset={preset} color={isActive(preset) ? '#ffffff' : '#e8e8ed'} height={22} />
              </TapButton>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}

/** The brush sets in the library's order. */
const sets = ['Inking', 'Painting', 'Soft', 'Erase'] as const satisfies readonly Preset['set'][];

/**
 * The current tool's settings as a simplified Brush Studio: numbers as pill scrubbers, toggles as switches, choices
 * as segmented controls. Tweaks apply at once and keep the cluster open. `onPreview` reports drags of size and
 * opacity, so that the cluster can show the brush preview.
 */
export function BrushStudio(props: {
  studio: Studio;
  box: Box;
  onPreview: (kind: 'size' | 'opacity' | undefined) => void;
}) {
  const presetName = () => {
    const preset = presets.find((entry) => entry.id === props.studio.preset());
    return preset?.tool === props.studio.tool() ? preset.name : undefined;
  };
  const paints = () => props.studio.toolInfo().paints;

  return (
    <section class={[css.card, styles.studio]} style={placed(props.box, 'max')} {...galleryUi}>
      <header class={css.cardHeader}>
        <span class={styles.toolIcon}>
          <SketchIcon name={props.studio.toolInfo().icon} size={18} />
        </span>
        <h3>{paints() ? 'Brush Studio' : props.studio.toolInfo().label}</h3>
        <small>{presetName() ?? (paints() ? props.studio.toolInfo().label : 'Settings')}</small>
      </header>
      <div class={styles.settings}>
        <For each={props.studio.settings()}>
          {(setting) => {
            if (setting.kind === 'number') {
              return (
                <PillScrubber
                  setting={setting}
                  value={props.studio.number(setting.key)}
                  onChange={(value) => props.studio.setValue(setting.key, value)}
                  onActive={(active) =>
                    (setting.key === 'size' || setting.key === 'opacity') &&
                    props.onPreview(active ? setting.key : undefined)
                  }
                />
              );
            }

            if (setting.kind === 'toggle') {
              return (
                <SwitchRow
                  label={setting.label}
                  on={props.studio.value(setting.key) === true}
                  onToggle={() => props.studio.setValue(setting.key, props.studio.value(setting.key) !== true)}
                />
              );
            }

            return (
              <Segmented
                label={setting.label}
                options={setting.options}
                value={String(props.studio.value(setting.key))}
                onChange={(option) => props.studio.setValue(setting.key, option)}
              />
            );
          }}
        </For>
      </div>
    </section>
  );
}
