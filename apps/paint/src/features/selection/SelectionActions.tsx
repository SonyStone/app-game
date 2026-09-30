import type { SelectionAction } from '@app-game/paint-core/protocol';
import styles from './SelectionActions.module.css';

/** Lasso commands for mouse and pen users; keyboard shortcuts run the same undoable commands. */
export function SelectionActions(props: {
  /** Commands are unavailable, for example before the engine is ready or during a lasso gesture. */
  disabled: boolean;
  /** A selection edit is applying. */
  busy: boolean;
  /** An outline with at least three points exists. */
  selected: boolean;
  /** Copied pixels are available to paste. */
  hasClipboard: boolean;
  onAction: (action: SelectionAction) => void;
  onDeselect: () => void;
}) {
  const unavailable = () => props.disabled || props.busy;
  const empty = () => unavailable() || !props.selected;

  return (
    <div class={styles.selectionActions} aria-label="Selection actions">
      <span role="status">
        {props.busy
          ? 'Applying selection…'
          : props.selected
            ? 'Drag inside to move. Pixels move on release.'
            : 'Draw around pixels on the active layer.'}
      </span>
      <div>
        <button disabled={empty()} onClick={() => props.onAction('copy')} title="Copy · ⌘/Ctrl C">
          Copy
        </button>
        <button disabled={empty()} onClick={() => props.onAction('cut')} title="Cut · ⌘/Ctrl X">
          Cut
        </button>
        <button
          disabled={unavailable() || !props.hasClipboard}
          onClick={() => props.onAction('paste')}
          title="Paste into active layer · ⌘/Ctrl V"
        >
          Paste
        </button>
        <button disabled={empty()} onClick={() => props.onAction('new-layer')}>
          Move to new layer
        </button>
        <button disabled={empty()} onClick={() => props.onAction('delete')} title="Delete selected pixels">
          Delete
        </button>
        <button disabled={empty()} onClick={() => props.onDeselect()} title="Deselect · Escape">
          Deselect
        </button>
      </div>
    </div>
  );
}
