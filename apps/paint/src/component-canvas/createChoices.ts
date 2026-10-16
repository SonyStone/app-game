import { createSignal, onCleanup } from 'solid-js';
import { createImmediateSignal } from '../shared/createImmediateSignal';

/**
 * The user's stars and comments on the canvas's specimens, kept in the repository's
 * `apps/paint/docs/component-choices.json` through the dev server (see `choicesBridge.ts`), so that they are committed
 * with the code and whoever builds the next UI reads them. Loads them once; every change writes the whole file again,
 * in order. Without the dev server, as on a deployment, changes stay in this page and `status` says so. Must be
 * created within a Solid owner.
 */
export function createChoices() {
  const [choices, setChoices, latest] = createImmediateSignal<Choices>({});
  const [status, setStatus] = createSignal<ChoicesStatus>('loading');
  let disposed = false;
  /** The write in progress, so that writes reach the file in the order they were made. */
  let writing = Promise.resolve();
  onCleanup(() => {
    disposed = true;
  });

  void load();

  const change = (id: string, label: string, patch: Partial<Pick<Choice, 'star' | 'comment'>>) => {
    const next: Choice = { ...latest()[id], ...patch, label, updated: new Date().toISOString() };
    if (!next.star) {
      delete next.star;
    }

    if (!next.comment) {
      delete next.comment;
    }

    const all = { ...latest() };
    if (next.star || next.comment) {
      all[id] = next;
    } else {
      delete all[id];
    }

    setChoices(all);
    if (status() !== 'offline') {
      writing = writing.then(() => save(all));
    }
  };

  return {
    /** The choice for a specimen, by its id. */
    choice: (id: string): Choice | undefined => choices()[id],
    /** `loading` until the file is read, then `saved`, `saving`, `failed` (the last write failed) or `offline`. */
    status,
    /** Stars or unstars a specimen; `label` names it in the file for whoever reads the spec. */
    toggleStar(id: string, label: string) {
      change(id, label, { star: !latest()[id]?.star });
    },
    /** Replaces a specimen's comment; an empty one removes it. */
    setComment(id: string, label: string, comment: string) {
      change(id, label, { comment: comment.trim() });
    }
  };

  async function load() {
    try {
      const response = await fetch(endpoint);
      // A deployment answers its SPA page instead.
      const loaded = response.ok ? ((await response.json()) as unknown) : undefined;
      if (disposed) {
        return;
      }

      if (typeof loaded !== 'object' || loaded === null || Array.isArray(loaded)) {
        setStatus('offline');
        return;
      }

      setChoices(loaded as Choices);
      setStatus('saved');
    } catch {
      if (!disposed) {
        setStatus('offline');
      }
    }
  }

  async function save(all: Choices) {
    setStatus('saving');
    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(all)
      });
      if (!disposed) {
        setStatus(response.ok ? 'saved' : 'failed');
      }
    } catch {
      if (!disposed) {
        setStatus('failed');
      }
    }
  }
}

/** A specimen's choice as kept in the file. */
export type Choice = {
  /** Where the specimen is on the canvas, e.g. "Color pickers · Picker alone · Triangle". */
  label: string;
  star?: boolean;
  comment?: string;
  /** When it last changed, as an ISO date. */
  updated: string;
};

type Choices = Record<string, Choice>;

export type ChoicesStatus = 'loading' | 'saved' | 'saving' | 'failed' | 'offline';

const endpoint = '/__component-choices';
