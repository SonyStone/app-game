import { For } from 'solid-js';
import { psdExamples, type PsdExample } from './examples';
import styles from './ExamplesMenu.module.css';

/** A button that opens a list of the bundled examples; choosing one closes the list and passes it to `onOpen`. */
export function ExamplesMenu(props: { onOpen: (example: PsdExample) => void; disabled?: boolean }) {
  let dialog!: HTMLDialogElement;
  return (
    <>
      <button type="button" aria-haspopup="dialog" disabled={props.disabled} onClick={() => dialog.showModal()}>
        Examples…
      </button>
      <dialog
        ref={(element) => (dialog = element)}
        class={styles.dialog}
        aria-label="Example documents"
        onClick={(event) => {
          if (event.target === dialog) {
            dialog.close();
          }
        }}
      >
        <header>
          <h2>Example documents</h2>
          <button type="button" aria-label="Close examples" onClick={() => dialog.close()}>
            ×
          </button>
        </header>
        <ul>
          <For each={psdExamples}>
            {(example) => (
              <li>
                <button
                  type="button"
                  class={styles.example}
                  onClick={() => {
                    dialog.close();
                    props.onOpen(example);
                  }}
                >
                  <strong>{example.name}</strong>
                  <span>{example.description}</span>
                  <small>
                    {example.file} · {example.size} · {example.credit}
                  </small>
                </button>
              </li>
            )}
          </For>
        </ul>
      </dialog>
    </>
  );
}
