import { makeEventListener } from '@solid-primitives/event-listener';
import { makeTimer } from '@solid-primitives/timer';
import { createSignal, onCleanup } from 'solid-js';
import type { BrushLibrary } from '../brush-library';
import type { createBrushTools } from './createBrushTools';

/**
 * Renaming and deleting the user's own brushes, every preset but the built-in ones, imported ones included.
 *
 * `remove` deletes at once as far as painting goes: the tools stop using the brush (`abandonPreset`), the one in use
 * moving to `next` when given, and `deleting` lists it with the time its deletion becomes final, `undoTime` later.
 * Only then does `tools.deletePreset` delete it from the library with its images, which storage frees with their last
 * reference; until then `undo` puts it back as it was, and makes it the brush in use again (`choose`) when it was and
 * the tool has not moved on since. Pending deletions also become final when the owner is disposed and when the page is
 * hidden (`pagehide`); a page closed before storage commits keeps the brush.
 *
 * `rename` renames a brush in place, keeping its id, its place and its images. Names need not be unique, as elsewhere
 * in the library; a blank name is refused. Must be created within a Solid owner.
 */
export function createOwnBrushes(options: {
  library: Pick<BrushLibrary, 'find' | 'update'>;
  tools: Pick<ReturnType<typeof createBrushTools>, 'preset' | 'abandonPreset' | 'deletePreset'>;
  /** Makes `id` the brush in use, as choosing it in the library does. */
  choose: (id: string) => void;
  /** Milliseconds a deletion can be undone. Default `undoTime`. */
  delay?: number;
}) {
  const delay = options.delay ?? undoTime;
  /** Deletions not yet final; read and written within one event, so a plain map. */
  const pending = new Map<string, { expires: number; cancel: () => void; chosen?: readonly string[] }>();
  const [deleting, setDeleting] = createSignal<ReadonlyMap<string, number>>(new Map());
  onCleanup(finishAll);
  if (typeof window !== 'undefined') {
    makeEventListener(window, 'pagehide', finishAll);
  }

  return {
    /** Brushes being deleted, by id, with the time (`Date.now()`) their deletion becomes final. */
    deleting: (): ReadonlyMap<string, number> => deleting(),
    /** Renames brush `id` to `name` without its outer spaces; false, changing nothing, for a blank name or built-in. */
    rename(id: string, name: string): boolean {
      const trimmed = name.trim();
      const preset = options.library.find(id);
      if (!trimmed || !preset || preset.builtIn) {
        return false;
      }

      if (trimmed !== preset.name) {
        options.library.update(id, { name: trimmed });
      }

      return true;
    },
    /**
     * Deletes brush `id`, undoably for `delay` milliseconds; when it is the brush in use, the tool moves to `next`, or
     * to its default brush without one. False for a built-in brush, an unknown one or one already being deleted.
     */
    remove(id: string, next?: string): boolean {
      const preset = options.library.find(id);
      if (!preset || preset.builtIn || pending.has(id)) {
        return false;
      }

      const inUse = options.tools.preset() === id;
      options.tools.abandonPreset(id);
      const fallback = options.tools.preset();
      if (inUse && next !== undefined) {
        options.choose(next);
      }

      const expires = Date.now() + delay;
      const cancel = makeTimer(() => finish(id), delay, setTimeout);
      pending.set(id, {
        expires,
        cancel,
        chosen: inUse ? [fallback, ...(next === undefined ? [] : [next])] : undefined
      });
      publish();
      return true;
    },
    /** Takes back the pending deletion of `id`; nothing once it is final. */
    undo(id: string) {
      const entry = pending.get(id);
      if (!entry) {
        return;
      }

      entry.cancel();
      pending.delete(id);
      publish();
      if (entry.chosen?.includes(options.tools.preset())) {
        options.choose(id);
      }
    }
  };

  /** Makes the pending deletion of `id` final. */
  function finish(id: string) {
    const entry = pending.get(id);
    if (!entry) {
      return;
    }

    entry.cancel();
    pending.delete(id);
    publish();
    options.tools.deletePreset(id);
  }

  function finishAll() {
    for (const id of [...pending.keys()]) {
      finish(id);
    }
  }

  function publish() {
    setDeleting(new Map([...pending].map(([id, { expires }]) => [id, expires])));
  }
}

/** Milliseconds a deleted brush can be brought back by default. */
export const undoTime = 5000;
