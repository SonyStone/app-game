/**
 * Undo history of immutable snapshots: the editor records whole maps, so undoing an edit is
 * swapping one snapshot for another, and objects untouched by an edit are shared between them.
 */
export type History<T> = {
  /** Earlier snapshots, oldest first. */
  past: readonly T[];
  present: T;
  /** Undone snapshots, the next one to redo last. */
  future: readonly T[];
};

/** Starts a history at `present` with nothing to undo or redo. */
export function startHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * Makes `next` the present as one undo step and drops the redo branch. Recording the present
 * itself changes nothing; past `limit` steps the oldest are forgotten.
 */
export function record<T>(history: History<T>, next: T, limit = HISTORY_LIMIT): History<T> {
  if (next === history.present) {
    return history;
  }

  return { past: [...history.past, history.present].slice(-limit), present: next, future: [] };
}

/** Steps back one snapshot; without one to go back to, returns `history` unchanged. */
export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) {
    return history;
  }

  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [...history.future, history.present]
  };
}

/** Steps forward to the last undone snapshot; without one, returns `history` unchanged. */
export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) {
    return history;
  }

  return {
    past: [...history.past, history.present],
    present: history.future[history.future.length - 1],
    future: history.future.slice(0, -1)
  };
}

/** Undo steps kept by default. */
export const HISTORY_LIMIT = 200;
