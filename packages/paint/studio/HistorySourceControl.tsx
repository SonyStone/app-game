import { For } from 'solid-js';
import type { PaintSession } from './createPaintSession';

/** Selects the immutable source used by ABR Erase to History without moving the undo cursor. */
export function HistorySourceControl(props: Pick<PaintSession, 'state' | 'ready' | 'send'>) {
  const choices = () => {
    const state = props.state();
    return state.historyStates.some((item) => item.id === state.historySource.id)
      ? state.historyStates
      : [state.historySource, ...state.historyStates];
  };
  return (
    <section>
      <label class="paint-mixing">
        Erase to History source
        <select
          aria-label="Erase to History source"
          disabled={!props.ready()}
          value={props.state().historySource.id}
          onChange={(event) => props.send({ type: 'history-source', id: Number(event.currentTarget.value) })}
        >
          <For each={choices()} keyed={(item) => item.id}>
            {(item) => (
              <option value={item().id}>
                {item().label}
                {item().id === props.state().historyCurrentId ? ' (current)' : ''}
              </option>
            )}
          </For>
        </select>
      </label>
      <p class="paint-blend-note">
        Enable Erase to History in the ABR eraser’s Tool Options, or hold Alt/Option before starting a stroke. The
        source is kept for this editing session.
      </p>
    </section>
  );
}
