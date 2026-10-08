import { For } from 'solid-js';
import { SketchIcon } from '../../../../shared/ui/SketchIcon';
import { tools } from '../../kit/catalog';
import type { Studio } from '../../kit/createStudio';
import { Kbd } from './cards';
import { SettingControl, TapButton } from './controls';
import styles from './Deck.module.css';

/**
 * The tools as a 4 × 2 grid of square buttons with their keys, and the current tool's three most important settings
 * below. Choosing a tool is a finished action (`done`); the settings are not.
 */
export function ToolsCard(props: { studio: Studio; done: () => void }) {
  return (
    <div class={styles.body}>
      <div class={styles.toolGrid}>
        <For each={tools}>
          {(tool) => (
            <TapButton
              class={styles.toolButton}
              title={`${tool.label} (${tool.key})`}
              on={props.studio.tool() === tool.id}
              onTap={() => {
                props.studio.setTool(tool.id);
                props.done();
              }}
            >
              <SketchIcon name={tool.icon} size={22} />
              <span class={styles.toolName}>{tool.label}</span>
              <Kbd class={styles.toolKey}>{tool.key}</Kbd>
            </TapButton>
          )}
        </For>
      </div>

      <h4 class={styles.section}>
        {props.studio.toolInfo().label}
        <span>top settings</span>
      </h4>
      <div class={styles.settingsColumn}>
        <For each={props.studio.settings().slice(0, 3)}>
          {(setting) => <SettingControl studio={props.studio} setting={setting} />}
        </For>
      </div>
    </div>
  );
}
