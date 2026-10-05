import { Show } from 'solid-js';
import type { DrawingFolderControl, FolderStatus } from './createDrawingFolder';
import styles from './DrawingFolder.module.css';

/**
 * Drawing menu entries for keeping the drawing in a folder on disk: keep it in a folder or open one, or, while it is
 * kept in one, the folder's name, what is left to write, and stopping. Nothing where the browser has no folders.
 */
export function DrawingFolderControls(props: { folder: DrawingFolderControl; ready: boolean }) {
  return (
    <Show when={props.folder.supported}>
      <Show
        when={props.folder.status()}
        fallback={
          <>
            <button disabled={!props.ready} onClick={() => void props.folder.save()}>
              Keep in folder…<span>Saves there as you draw</span>
            </button>
            <button disabled={!props.ready} onClick={() => void props.folder.open()}>
              Open folder…<span>A drawing kept in a folder</span>
            </button>
          </>
        }
      >
        {(status) => (
          <>
            <p class={styles.status} role="status">
              Kept in “{status().name}”<span>{folderState(status())}</span>
            </p>
            <button disabled={!props.ready} onClick={() => props.folder.unlink()}>
              Stop keeping in folder<span>Keeps it in the browser</span>
            </button>
          </>
        )}
      </Show>
    </Show>
  );
}

/** What is happening in the drawing's folder, in a few words. */
function folderState(status: FolderStatus) {
  if (status.access === 'prompt') {
    return 'Waiting for access';
  }

  if (status.error) {
    return `Not saved there: ${status.error}`;
  }

  if (status.writing) {
    return status.pending > 0 ? `Writing ${status.pending} tiles…` : 'Writing…';
  }

  return 'Saved there';
}
