import { Show } from 'solid-js';
import { isRestorable, type PaintError } from '../../shared/errors';
import styles from './PaintStudio.module.css';

/**
 * Alert for the latest failure. A paused renderer offers "Restore renderer"; a busy editor asks to retry later;
 * other failures only need dismissing.
 */
export function ErrorNotice(props: { error: PaintError; onRestore: () => void; onDismiss: () => void }) {
  const title = () => {
    if (isRestorable(props.error)) {
      return 'Canvas paused';
    }

    return props.error.kind === 'engine' && props.error.code === 'busy'
      ? 'Paint is busy'
      : 'Could not complete that action';
  };

  return (
    <div class={styles.error} role="alert">
      <strong>{title()}</strong>
      <p>{props.error.message}</p>
      <Show when={isRestorable(props.error)}>
        <button onClick={() => props.onRestore()}>Restore renderer</button>
      </Show>
      <button onClick={() => props.onDismiss()}>Dismiss</button>
    </div>
  );
}
