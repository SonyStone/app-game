import styles from './EditCommandBar.module.css';
type EditCommandBarProps = {
  canDeleteSelection: boolean;
  onDeleteSelection: () => void;
  onUndo: () => void;
  onClear: () => void;
};

export function EditCommandBar(props: EditCommandBarProps) {
  return (
    <>
      <button
        class={`${styles.commandButton} ml-auto`}
        type="button"
        disabled={!props.canDeleteSelection}
        onClick={props.onDeleteSelection}
      >
        Delete Sel
      </button>
      <button class={styles.commandButton} type="button" onClick={props.onUndo}>
        Undo
      </button>
      <button class={styles.commandButton} type="button" onClick={props.onClear}>
        Clear
      </button>
    </>
  );
}
