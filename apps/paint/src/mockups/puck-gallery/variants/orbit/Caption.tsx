import { createSignal, onCleanup, Show } from 'solid-js';
import type { Point } from '../../kit/createSketchCanvas';
import styles from './Orbit.module.css';

/**
 * The Orbit's one floating caption: the name of the preset, tool or setting under the pointer, or of the one a key
 * just chose. Parts identify themselves by `owner`, so that a part hides only its own caption. Must be created
 * within an owner (a pending flash is cancelled on cleanup).
 */
export function createCaption() {
  const [caption, setCaption] = createSignal<CaptionState>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));

  const show = (owner: string, text: string, at: Point, hint?: string) => {
    clearTimeout(timer);
    setCaption({ owner, text, at, hint });
  };
  const hide = (owner: string) => {
    setCaption((current) => (current?.owner === owner ? undefined : current));
  };

  return {
    caption,
    /** Shows `text` at `at` (disc coordinates) until `hide(owner)` or another caption. */
    show,
    hide,
    /** Shows `text` for a moment, as after a key press. */
    flash(owner: string, text: string, at: Point, hint?: string) {
      show(owner, text, at, hint);
      timer = setTimeout(() => hide(owner), 900);
    }
  };
}

/** What the caption shows: `hint` is a muted key reminder after the text. */
type CaptionState = { owner: string; text: string; at: Point; hint?: string | undefined };

/** The caption API that parts receive. */
export type Captions = ReturnType<typeof createCaption>;

/** Draws the current caption as a small pill centered on its point; it never takes presses. */
export function Caption(props: { captions: Captions }) {
  return (
    <Show when={props.captions.caption()}>
      {(current) => (
        <div class={styles.caption} style={{ left: `${current().at.x}px`, top: `${current().at.y}px` }}>
          {current().text}
          <Show when={current().hint}>{(hint) => <kbd>{hint()}</kbd>}</Show>
        </div>
      )}
    </Show>
  );
}
