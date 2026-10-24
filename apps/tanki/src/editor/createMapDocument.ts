import { createSignal } from 'solid-js';
import type { TankiMap } from '../map/format';
import { record, redo, startHistory, undo } from './history';

/**
 * The map being edited, with undo history. Every committed edit is one undo step; a drag shows
 * its intermediate maps through {@link preview} and commits once when it ends, so undo takes
 * back the whole drag. Undo and redo drop an unfinished preview.
 *
 * The history stores whole immutable maps rather than restore callbacks, which keeps it a pure,
 * separately tested reducer (`history.ts`) and lets previews bypass it.
 */
export function createMapDocument(initial: TankiMap) {
  const [history, setHistory] = createSignal(startHistory(initial));
  const [draft, setDraft] = createSignal<TankiMap>();

  return {
    /** The map as shown: the preview of a drag in progress, else the present snapshot. */
    map: () => draft() ?? history().present,

    /** The last committed map, without any preview. */
    committed: () => history().present,

    canUndo: () => history().past.length > 0,
    canRedo: () => history().future.length > 0,

    /** Shows `next` without recording it. */
    preview(next: TankiMap) {
      setDraft(() => next);
    },

    /** Drops the preview, going back to the committed map. */
    cancelPreview() {
      setDraft(undefined);
    },

    /** Records `next` as one undo step and drops the preview. */
    commit(next: TankiMap) {
      setDraft(undefined);
      setHistory((current) => record(current, next));
    },

    undo() {
      setDraft(undefined);
      setHistory(undo);
    },

    redo() {
      setDraft(undefined);
      setHistory(redo);
    }
  };
}

/** The editor's map document, as {@link createMapDocument} returns it. */
export type MapDocument = ReturnType<typeof createMapDocument>;
