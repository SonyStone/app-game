import type { PsdStateChoice, PsdStates } from '@app-game/psd/viewer';
import { For, Show } from 'solid-js';
import styles from './StatesPanel.module.css';

/**
 * Picks which saved state renders: the document as saved, one of its layer comps or one frame of its animation.
 * Photoshop's merged image shows the document as saved, so the panel says that comparisons apply to that state only.
 */
export function StatesPanel(props: {
  states: PsdStates;
  choice: PsdStateChoice | null;
  onChoose: (choice: PsdStateChoice | null) => void;
}) {
  const value = () =>
    props.choice === null ? '' : 'comp' in props.choice ? `comp:${props.choice.comp}` : `frame:${props.choice.frame}`;
  return (
    <section class={styles.panel} aria-label="Saved states">
      <h2>Saved states</h2>
      <label>
        Show
        <select
          value={value()}
          onChange={(event) => {
            const [kind, id] = event.currentTarget.value.split(':');
            props.onChoose(kind === 'comp' ? { comp: Number(id) } : kind === 'frame' ? { frame: Number(id) } : null);
          }}
        >
          <option value="">The document as saved</option>
          <Show when={props.states.comps.length}>
            <optgroup label="Layer comps">
              <For each={props.states.comps}>
                {(comp) => (
                  <option value={`comp:${comp.id}`} title={comp.comment}>
                    {comp.name}
                    {comp.id === props.states.lastAppliedComp ? ' (last applied)' : ''}
                  </option>
                )}
              </For>
            </optgroup>
          </Show>
          <Show when={props.states.frames.length}>
            <optgroup label="Animation frames">
              <For each={props.states.frames}>
                {(frame, index) => (
                  <option value={`frame:${frame.id}`}>
                    Frame {index() + 1}, {frame.delay / 100} s{frame.id === props.states.activeFrame ? ' (saved)' : ''}
                  </option>
                )}
              </For>
            </optgroup>
          </Show>
        </select>
      </label>
      <Show when={props.choice !== null}>
        <p class={styles.note}>Photoshop's merged image shows the document as saved: compare with it only there.</p>
      </Show>
      <For each={props.states.errors}>{(error) => <p class={styles.note}>Not read: {error}</p>}</For>
    </section>
  );
}
