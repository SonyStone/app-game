import { createSignal, For, Show } from 'solid-js';
import closeIcon from '../assets/icons/x.svg?url';
import { brushExamples } from '../lib/brush-examples';
import styles from './BrushExamplesMenu.module.css';

/** Modal gallery of Adobe downloads; native dialog handles focus trapping and Escape. */
export function BrushExamplesMenu(props: { busy: boolean }) {
  let dialog!: HTMLDialogElement;
  const [opened, setOpened] = createSignal(false);
  return (
    <>
      <button
        disabled={props.busy}
        aria-haspopup="dialog"
        onClick={() => {
          setOpened(true);
          dialog.showModal();
        }}
      >
        Examples…
      </button>
      <dialog
        ref={dialog}
        class={styles.examplesDialog}
        aria-label="Example brushes"
        onClick={(event) => {
          if (event.target === dialog) {
            const bounds = dialog.getBoundingClientRect();
            if (
              event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom
            )
              dialog.close();
          }
        }}
      >
        <button
          class={styles.examplesClose}
          type="button"
          aria-label="Close examples"
          autofocus
          onClick={() => dialog.close()}
        >
          <img src={closeIcon} width="20" height="20" alt="" />
        </button>
        <div
          class={styles.examplesGallery}
          role="group"
          aria-label="Example brush collections"
          onClick={(event) => {
            if (event.target === event.currentTarget) dialog.close();
          }}
        >
          <Show when={opened()}>
            <For each={brushExamples}>
              {(example, index) => (
                <article class={styles.exampleCard} style={{ '--reveal-delay': `${index() * 45}ms` }}>
                  <img
                    src={example.cover}
                    alt={`${example.name} brush artwork`}
                    loading="lazy"
                    width="611"
                    height="425"
                  />
                  <div class={styles.exampleBody}>
                    <h3>{example.name}</h3>
                    <p>{example.description}</p>
                    <p>Download the file, then import it into the editor.</p>

                    <footer>
                      <span>
                        {example.count} brushes · {example.size}
                      </span>
                      <a href={example.url} target="_blank" rel="noopener noreferrer">
                        Download from Adobe
                      </a>
                    </footer>
                  </div>
                </article>
              )}
            </For>
          </Show>
        </div>
      </dialog>
    </>
  );
}
