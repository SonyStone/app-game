import type { JSX } from '@solidjs/web';
import { createContext, createSignal, Show, useContext } from 'solid-js';
import styles from './ComponentCanvas.module.css';
import type { createChoices } from './createChoices';

/**
 * A group of the canvas: every variant of one kind of component under a small title, in a dashed frame. `id` names it
 * for the canvas's group list, which moves the camera to `data-group` elements. `omitted` says what the group leaves
 * out and why.
 */
export function CanvasGroup(props: { id: string; title: string; omitted?: JSX.Element; children: JSX.Element }) {
  return (
    <section class={styles.group} data-group={props.id} aria-label={props.title}>
      <h2 class={styles.groupTitle}>{props.title}</h2>
      <div class={styles.groupFrame}>
        <SpecimenPath value={[props.title]}>{props.children}</SpecimenPath>
        <Show when={props.omitted}>
          <p class={styles.omitted}>{props.omitted}</p>
        </Show>
      </div>
    </section>
  );
}

/** A row of a group: specimens that differ in one property, named by `title`. */
export function CanvasRow(props: { title: string; note?: string; children: JSX.Element }) {
  const path = useContext(SpecimenPath);

  return (
    <div class={styles.row}>
      <h3 class={styles.rowTitle}>
        {props.title}
        <Show when={props.note}>
          <span class={styles.rowNote}>{props.note}</span>
        </Show>
      </h3>
      <div class={styles.rowItems}>
        <SpecimenPath value={[...path, props.title]}>{props.children}</SpecimenPath>
      </div>
    </div>
  );
}

/**
 * One component on the canvas with its caption: `label`, a star and a comment, kept by `createChoices` under `id`,
 * which must stay the same when the label changes. The component goes inside `data-canvas-content`, so that the canvas
 * leaves its input alone; `below` holds what belongs to the specimen but is not the component, such as its test strip.
 */
export function Specimen(props: { id: string; label: string; below?: JSX.Element; children: JSX.Element }) {
  const choices = useContext(SpecimenChoices);
  const path = useContext(SpecimenPath);
  const [editing, setEditing] = createSignal(false);
  const fileLabel = () => [...path, props.label].join(' · ');
  const choice = () => choices.choice(props.id);
  const loading = () => choices.status() === 'loading';
  /** When the comment field last closed: a press on the comment button closes it by blurring, not to reopen it. */
  let closedAt = -Infinity;

  return (
    <figure class={styles.specimen} data-specimen={props.id}>
      <div class={styles.specimenContent} data-canvas-content>
        {props.children}
      </div>
      {props.below}
      <figcaption class={styles.caption}>
        <span class={styles.label}>{props.label}</span>
        <button
          class={styles.captionButton}
          aria-label={choice()?.star ? `Unstar ${props.label}` : `Star ${props.label}`}
          aria-pressed={choice()?.star ? 'true' : 'false'}
          disabled={loading()}
          onClick={() => choices.toggleStar(props.id, fileLabel())}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" />
          </svg>
        </button>
        <button
          class={styles.captionButton}
          aria-label={`Comment on ${props.label}`}
          aria-pressed={editing() ? 'true' : 'false'}
          disabled={loading()}
          onClick={() => {
            if (performance.now() - closedAt > reopenGuardMs) {
              setEditing(true);
            }
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 5h14v10H10l-4 4v-4H5Z" />
          </svg>
        </button>
      </figcaption>
      <Show
        when={editing()}
        fallback={<Show when={choice()?.comment}>{(comment) => <p class={styles.comment}>{comment()}</p>}</Show>}
      >
        <textarea
          class={styles.commentField}
          data-canvas-content
          aria-label={`Comment on ${props.label}`}
          placeholder="What works, what does not"
          rows={3}
          value={choice()?.comment ?? ''}
          ref={(field) => queueMicrotask(() => field.focus({ preventScroll: true }))}
          onBlur={(event) => {
            choices.setComment(props.id, fileLabel(), event.currentTarget.value);
            closedAt = performance.now();
            setEditing(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
              event.currentTarget.blur();
            }
          }}
        />
      </Show>
    </figure>
  );
}

/** Where specimens keep their stars and comments; provided by the canvas. */
export const SpecimenChoices = createContext<ReturnType<typeof createChoices>>();

/** How long after the comment field closes a press on the comment button does not reopen it. */
const reopenGuardMs = 400;

/** The titles of the group and row around a specimen, which name it in the choices file. */
const SpecimenPath = createContext<readonly string[]>([]);
