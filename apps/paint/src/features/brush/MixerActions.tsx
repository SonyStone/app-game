import styles from './BrushPanel.module.css';

/** Mixer Brush reservoir buttons shown with the colors of a native Mixer Brush preset. */
export function MixerActions(props: {
  /** Buttons are disabled before the engine is ready or while a command runs. */
  disabled: boolean;
  onLoad: () => void;
  onClean: () => void;
  /** Arms loading paint from the next canvas contact. */
  onPick: () => void;
}) {
  return (
    <div class={styles.mixerActions} role="group" aria-label="Mixer Brush load">
      <button disabled={props.disabled} onClick={() => props.onLoad()}>
        Load Brush
      </button>
      <button disabled={props.disabled} onClick={() => props.onClean()}>
        Clean Brush
      </button>
      <button class={styles.mixerPick} disabled={props.disabled} onClick={() => props.onPick()}>
        Load from canvas
      </button>
      <p class={styles.panelNote}>
        Alt/Option-click also loads canvas paint. Choose solid or multiple colors in the preset’s Tool Options.
      </p>
    </div>
  );
}
