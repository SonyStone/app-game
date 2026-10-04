import { createSignal, Match, Switch } from 'solid-js';
import type { InputRecorder } from './createInputRecorder';
import styles from './RecordingControls.module.css';

/**
 * Floating controls of an input recording: the elapsed time and Stop while recording, then a note with Save and
 * Discard, then where the recording was saved. Marked `data-input-recorder`, so its own input is not recorded.
 */
export function RecordingControls(props: { recorder: InputRecorder }) {
  const [note, setNote] = createSignal('');

  return (
    <div class={styles.recorder} data-input-recorder role="region" aria-label="Input recording">
      <Switch>
        <Match when={props.recorder.status() === 'recording'}>
          <span class={styles.live} role="status">
            <span class={styles.dot} />
            REC {clock(props.recorder.elapsed())}
          </span>
          <button onClick={() => props.recorder.stop()}>Stop</button>
        </Match>
        <Match when={props.recorder.status() === 'review' || props.recorder.status() === 'saving'}>
          <form
            class={styles.review}
            onSubmit={(event) => {
              event.preventDefault();
              void props.recorder.save(note()).then(() => setNote(''));
            }}
          >
            <label>
              What happened?
              <textarea
                rows={3}
                autofocus
                placeholder="Expected … but …"
                value={note()}
                onInput={(event) => setNote(event.currentTarget.value)}
              />
            </label>
            {props.recorder.failure() && <p role="alert">{props.recorder.failure()}</p>}
            <div class={styles.actions}>
              <button
                type="button"
                disabled={props.recorder.status() === 'saving'}
                onClick={() => props.recorder.discard()}
              >
                Discard
              </button>
              <button type="submit" class={styles.primary} disabled={props.recorder.status() === 'saving'}>
                {props.recorder.status() === 'saving' ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Match>
        <Match when={props.recorder.saved()}>
          {(directory) => (
            <>
              <span role="status">Saved to {directory()}</span>
              <button onClick={() => props.recorder.acknowledge()}>OK</button>
            </>
          )}
        </Match>
      </Switch>
    </div>
  );
}

/** Formats whole seconds as `m:ss`. */
function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
