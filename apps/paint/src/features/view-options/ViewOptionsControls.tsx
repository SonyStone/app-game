import styles from './ViewOptionsControls.module.css';
import { pixelGridZoom, type ViewOptions } from './createViewOptions';

/** Switches for how the canvas shows pixels up close; see `createViewOptions`. */
export function ViewOptionsControls(props: { settings: ViewOptions; onChange: (patch: Partial<ViewOptions>) => void }) {
  return (
    <fieldset class={styles.options}>
      <legend>View</legend>
      <label>
        <input
          type="checkbox"
          checked={props.settings.smoothPixels}
          onChange={(event) => props.onChange({ smoothPixels: event.currentTarget.checked })}
        />
        Smooth pixels when zoomed in
      </label>
      <label>
        <input
          type="checkbox"
          checked={props.settings.pixelGrid}
          onChange={(event) => props.onChange({ pixelGrid: event.currentTarget.checked })}
        />
        Pixel grid from {pixelGridZoom * 100}%
      </label>
    </fieldset>
  );
}
