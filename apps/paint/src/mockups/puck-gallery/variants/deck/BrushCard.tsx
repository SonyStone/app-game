import { For } from 'solid-js';
import { presets } from '../../kit/catalog';
import type { Studio } from '../../kit/createStudio';
import { StrokePreview } from '../../kit/StrokePreview';
import { SettingControl, pressable } from './controls';
import styles from './Deck.module.css';

/**
 * Brush presets as wide stroke samples in two columns, then every setting of the current tool: numbers as scrub
 * chips, choices as segments, toggles. Choosing a preset is a finished action (`done`); settings are not.
 */
export function BrushCard(props: { studio: Studio; done: () => void }) {
  return (
    <div class={styles.body}>
      <div class={styles.presets}>
        <For each={presets}>
          {(preset) => {
            const press = pressable({
              tap() {
                props.studio.choosePreset(preset.id);
                props.done();
              }
            });
            return (
              <div
                class={[styles.preset, { [styles.on!]: props.studio.preset() === preset.id }]}
                title={`${preset.name} · ${preset.set}`}
                {...press}
              >
                <StrokePreview preset={preset} color={props.studio.color()} height={24} />
                <span class={styles.presetName}>
                  {preset.name}
                  <small>{preset.tool === 'brush' ? preset.set : preset.tool}</small>
                </span>
              </div>
            );
          }}
        </For>
      </div>

      <h4 class={styles.section}>
        {props.studio.toolInfo().label}
        <span>
          {props.studio.settings().length} settings · <kbd class={styles.kbd}>↑</kbd>
          <kbd class={styles.kbd}>↓</kbd> preset
        </span>
      </h4>
      <div class={styles.settingsGrid}>
        <For each={props.studio.settings()}>
          {(setting) => <SettingControl studio={props.studio} setting={setting} />}
        </For>
      </div>
    </div>
  );
}
