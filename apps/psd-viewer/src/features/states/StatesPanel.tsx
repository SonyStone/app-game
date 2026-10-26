import type { PsdStateChoice, PsdStates } from '@app-game/psd/viewer';
import { makeTimer } from '@solid-primitives/timer';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { playbackDelay, stepState } from './playback';
import styles from './StatesPanel.module.css';

/**
 * Picks which saved state renders: the document as saved, one of its layer comps or one frame of its animation.
 * Photoshop's merged image shows the document as saved, so the panel says that comparisons apply to that state only.
 */
export function StatesPanel(props: {
  states: PsdStates;
  choice: PsdStateChoice | null;
  busy: boolean;
  onChoose: (choice: PsdStateChoice | null) => void;
}) {
  const [playing, setPlaying] = createSignal(() => {
    props.states;
    return false;
  });
  const [loop, setLoop] = createSignal(false);
  let deadline = 0;
  let steps = 0;
  createEffect(playing, (active) => (active ? makeTimer(() => setPlaying(false), 30_000, setTimeout) : undefined));
  createEffect(
    () => ({ playing: playing(), busy: props.busy, choice: props.choice, states: props.states, loop: loop() }),
    (current) => {
      if (!current.playing || current.busy) {
        return;
      }

      return makeTimer(
        () => {
          const next = stepState(current.states, current.choice, 1, current.loop);
          if (
            ++steps >= 300 ||
            performance.now() >= deadline ||
            JSON.stringify(next) === JSON.stringify(current.choice)
          ) {
            setPlaying(false);
            return;
          }

          props.onChoose(next);
        },
        playbackDelay(current.states, current.choice),
        setTimeout
      );
    }
  );
  const value = () =>
    props.choice === null ? '' : 'comp' in props.choice ? `comp:${props.choice.comp}` : `frame:${props.choice.frame}`;
  return (
    <section class={styles.panel} aria-label="Saved states">
      <h2>Saved states</h2>
      <label>
        Show
        <select
          aria-label="Show"
          value={value()}
          onChange={(event) => {
            setPlaying(false);
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
      <div class={styles.actions}>
        <button
          onClick={() => {
            setPlaying(false);
            props.onChoose(stepState(props.states, props.choice, -1, loop()));
          }}
        >
          Previous state
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            props.onChoose(stepState(props.states, props.choice, 1, loop()));
          }}
        >
          Next state
        </button>
        <button
          aria-pressed={playing() ? 'true' : 'false'}
          onClick={() => {
            deadline = performance.now() + 30_000;
            steps = 0;
            setPlaying(!playing());
          }}
        >
          {playing() ? 'Pause' : 'Play'}
        </button>
        <label>
          <input type="checkbox" checked={loop()} onChange={(event) => setLoop(event.currentTarget.checked)} />
          Loop
        </label>
      </div>
      <p class={styles.note}>
        Playback waits for each render. Delays 0.1–10 s; stops after 30 s or 300 steps. Layer properties and bounds show
        saved records.
      </p>
      <Show when={props.choice !== null}>
        <p class={styles.note}>Photoshop's merged image shows the document as saved: compare with it only there.</p>
      </Show>
      <For each={props.states.errors}>{(error) => <p class={styles.note}>Not read: {error}</p>}</For>
    </section>
  );
}
