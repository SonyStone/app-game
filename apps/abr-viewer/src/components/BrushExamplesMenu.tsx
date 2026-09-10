import { createSignal, For, Show } from 'solid-js';
import closeIcon from '../assets/icons/x.svg?url';
import { brushExamples, type BrushExample } from '../lib/brush-examples';
import styles from './BrushExamplesMenu.module.css';

/** Modal gallery of bundled collections; native dialog handles focus trapping and Escape. */
export function BrushExamplesMenu(props: {
  busy: boolean;
  loadingMessage: string;
  /** Resolves after downloading and importing the collection into the workspace. */
  onSelect: (example: BrushExample) => Promise<void>;
}) {
  let dialog!: HTMLDialogElement;
  const [opened, setOpened] = createSignal(false);
  const [loading, setLoading] = createSignal<BrushExample>();
  return (
    <>
      <button
        disabled={props.busy}
        class={loading() ? styles.isLoading : undefined}
        aria-haspopup="dialog"
        onClick={() => {
          setOpened(true);
          dialog.showModal();
        }}
      >
        <Show when={loading()} fallback="Examples…">
          <span class={styles.loadingSpinner} aria-hidden="true" />
          Loading brushes…
        </Show>
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
                    <Show when={loading() === example}>
                      <p class={styles.exampleLoading} role="status">
                        {props.loadingMessage}
                      </p>
                    </Show>
                    <footer>
                      <span>
                        {example.count} brushes · {example.size}
                      </span>
                      <button
                        type="button"
                        disabled={props.busy}
                        class={loading() === example ? styles.isLoading : undefined}
                        aria-label={`Add ${example.name}`}
                        onClick={async () => {
                          if (props.busy || loading()) return;
                          setLoading(example);
                          try {
                            await props.onSelect(example);
                            dialog.close();
                          } finally {
                            setLoading(undefined);
                          }
                        }}
                      >
                        <Show when={loading() === example} fallback="Add brushes">
                          <span class={styles.loadingSpinner} aria-hidden="true" />
                          Loading…
                        </Show>
                      </button>
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
