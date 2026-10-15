import styles from './FreshTab.module.css';

/** The Drawing menu's choice of moving to a new tab by itself once Chrome loses the pen hover; see `createFreshTab`. */
export function FreshTabControls(props: { auto: boolean; onChange: (auto: boolean) => void }) {
  return (
    <fieldset class={styles.controls}>
      <legend>Pen hover</legend>
      <label class={styles.checkbox}>
        <input
          type="checkbox"
          checked={props.auto}
          onChange={(event) => props.onChange(event.currentTarget.checked)}
        />
        When Chrome loses the pen hover, continue in a new tab automatically
      </label>
    </fieldset>
  );
}
