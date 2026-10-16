import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import { maximumDelay, minimumDelay, type QuickShapePreferences as Settings } from './createQuickShape';
import styles from './QuickShape.module.css';

/** QuickShape's switch and the pen's rest before a shape appears, for the brush panel; they apply to every brush. */
export function QuickShapeSettings(props: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  return (
    <section class={styles.settings} aria-label="QuickShape">
      <label class={styles.check}>
        <input
          type="checkbox"
          checked={props.settings.enabled}
          onChange={(event) => props.onChange({ enabled: event.currentTarget.checked })}
        />
        QuickShape: hold the pen at the end of a stroke to make a line, arc, ellipse or polygon
      </label>
      <label class={styles.delay}>
        Hold for
        <ScrubNumber
          label="QuickShape hold time"
          min={minimumDelay}
          max={maximumDelay}
          step={50}
          unit=" ms"
          disabled={!props.settings.enabled}
          value={props.settings.delay}
          onChange={(delay) => props.onChange({ delay })}
        />
      </label>
    </section>
  );
}
