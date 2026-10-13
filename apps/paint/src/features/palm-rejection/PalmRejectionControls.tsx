import { Show } from 'solid-js';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import styles from './PalmRejection.module.css';
import type { PalmRejectionSettings } from './createPalmRejectionSettings';

/** Palm rejection settings for the Drawing menu; see `createPalmRejection`. */
export function PalmRejectionControls(props: {
  settings: PalmRejectionSettings;
  onChange: (patch: Partial<PalmRejectionSettings>) => void;
}) {
  return (
    <fieldset class={styles.controls}>
      <legend>Palm rejection</legend>
      <label class={styles.checkbox}>
        <input
          type="checkbox"
          checked={props.settings.enabled}
          onChange={(event) => props.onChange({ enabled: event.currentTarget.checked })}
        />
        Ignore touches on the pen hand's side
      </label>
      <Show when={props.settings.enabled}>
        <label>
          Pen hand
          <select
            aria-label="Pen hand"
            value={props.settings.hand}
            onChange={(event) => props.onChange({ hand: event.currentTarget.value as PalmRejectionSettings['hand'] })}
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label>
          Past the pen
          <ScrubNumber
            label="Past the pen"
            min={-200}
            max={200}
            step={5}
            unit="px"
            value={props.settings.tolerance}
            onInput={(tolerance) => props.onChange({ tolerance })}
            onChange={(tolerance) => props.onChange({ tolerance })}
          />
        </label>
        <label class={styles.checkbox}>
          <input
            type="checkbox"
            checked={props.settings.hoverless}
            onChange={(event) => props.onChange({ hoverless: event.currentTarget.checked })}
          />
          Pen without hover
        </label>
        <Show
          when={props.settings.hoverless}
          fallback={
            <label>
              Pen counts as near for
              <ScrubNumber
                label="Pen counts as near for"
                min={0}
                max={3000}
                step={50}
                unit="ms"
                value={props.settings.linger}
                onInput={(linger) => props.onChange({ linger })}
                onChange={(linger) => props.onChange({ linger })}
              />
            </label>
          }
        >
          <label>
            Near after lifting
            <ScrubNumber
              label="Near after lifting"
              min={0}
              max={3000}
              step={50}
              unit="ms"
              value={props.settings.liftLinger}
              onInput={(liftLinger) => props.onChange({ liftLinger })}
              onChange={(liftLinger) => props.onChange({ liftLinger })}
            />
          </label>
          <label>
            Take back touches before the pen
            <ScrubNumber
              label="Take back touches before the pen"
              min={0}
              max={2000}
              step={50}
              unit="ms"
              value={props.settings.before}
              onInput={(before) => props.onChange({ before })}
              onChange={(before) => props.onChange({ before })}
            />
          </label>
        </Show>
      </Show>
    </fieldset>
  );
}
