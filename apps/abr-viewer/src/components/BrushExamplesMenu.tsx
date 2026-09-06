import { createSignal, For, Show } from 'solid-js';
import closeIcon from '../assets/icons/x.svg?url';
import { brushExamples, type BrushExample } from '../lib/brush-examples';

/** Modal gallery of bundled collections; native dialog handles focus trapping and Escape. */
export function BrushExamplesMenu(props: { busy: boolean; onSelect: (example: BrushExample) => void }) {
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
        class="abr-examples-dialog"
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
          class="abr-examples-close"
          type="button"
          aria-label="Close examples"
          autofocus
          onClick={() => dialog.close()}
        >
          <img src={closeIcon} width="20" height="20" alt="" />
        </button>
        <div
          class="abr-examples-gallery"
          role="group"
          aria-label="Example brush collections"
          onClick={(event) => {
            if (event.target === event.currentTarget) dialog.close();
          }}
        >
          <Show when={opened()}>
            <For each={brushExamples}>
              {(example, index) => (
                <article class="abr-example-card" style={{ '--reveal-delay': `${index() * 45}ms` }}>
                  <img
                    src={example.cover}
                    alt={`${example.name} brush artwork`}
                    loading="lazy"
                    width="611"
                    height="425"
                  />
                  <div class="abr-example-body">
                    <h3>{example.name}</h3>
                    <p>{example.description}</p>
                    <footer>
                      <span>
                        {example.count} brushes · {example.size}
                      </span>
                      <button
                        type="button"
                        disabled={props.busy}
                        aria-label={`Add ${example.name}`}
                        onClick={() => {
                          dialog.close();
                          props.onSelect(example);
                        }}
                      >
                        Add brushes
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
