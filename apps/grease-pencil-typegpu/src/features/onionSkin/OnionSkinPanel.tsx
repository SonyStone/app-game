import type { OnionSkinSettings } from '../../document';
import styles from './OnionSkinPanel.module.css';

type OnionSkinPanelProps = {
  onionSkin: OnionSkinSettings;
  onSetEnabled: (enabled: boolean) => void;
  onSetPreviousFrames: (previousFrames: number) => void;
  onSetNextFrames: (nextFrames: number) => void;
  onSetOpacity: (opacity: number) => void;
};

export function OnionSkinPanel(props: OnionSkinPanelProps) {
  return (
    <section class="onion-panel">
      <div class={styles.panelHeader}>
        <span>Onion Skin</span>
        <label class={styles.toggleControl}>
          <input
            name="onion-enabled"
            type="checkbox"
            checked={props.onionSkin.enabled}
            onChange={(event) => props.onSetEnabled(event.currentTarget.checked)}
          />
          Enabled
        </label>
      </div>

      <div class={styles.onionControls}>
        <label class={styles.numberControl}>
          Back
          <input
            name="onion-previous"
            type="number"
            min="0"
            max="6"
            step="1"
            value={props.onionSkin.previousFrames}
            onInput={(event) => props.onSetPreviousFrames(event.currentTarget.valueAsNumber)}
          />
        </label>
        <label class={styles.numberControl}>
          Ahead
          <input
            name="onion-next"
            type="number"
            min="0"
            max="6"
            step="1"
            value={props.onionSkin.nextFrames}
            onInput={(event) => props.onSetNextFrames(event.currentTarget.valueAsNumber)}
          />
        </label>
        <label class={styles.onionOpacity}>
          Opacity
          <input
            name="onion-opacity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={props.onionSkin.opacity}
            onInput={(event) => props.onSetOpacity(event.currentTarget.valueAsNumber)}
          />
        </label>
      </div>
    </section>
  );
}
