import type { OnionSkinSettings } from '../../document'

type OnionSkinPanelProps = {
  onionSkin: OnionSkinSettings
  onSetEnabled: (enabled: boolean) => void
  onSetPreviousFrames: (previousFrames: number) => void
  onSetNextFrames: (nextFrames: number) => void
  onSetOpacity: (opacity: number) => void
}

export function OnionSkinPanel(props: OnionSkinPanelProps) {
  return (
    <section class="onion-panel">
      <div class="panel-header">
        <span>Onion Skin</span>
        <label class="toggle-control">
          <input
            name="onion-enabled"
            type="checkbox"
            checked={props.onionSkin.enabled}
            onChange={(event) => props.onSetEnabled(event.currentTarget.checked)}
          />
          Enabled
        </label>
      </div>

      <div class="onion-controls">
        <label class="number-control">
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
        <label class="number-control">
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
        <label class="onion-opacity">
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
  )
}
