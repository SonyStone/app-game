/** Latest request per target wins. Active previews run before queued thumbnail work. */
export function createPreviewQueue<T extends { target: number; priority: number }>() {
  const pending = new Map<number, T>();
  return {
    put(job: T) {
      pending.set(job.target, job);
    },
    remove(target: number) {
      pending.delete(target);
    },
    take() {
      let selected: T | undefined;
      for (const job of pending.values()) if (!selected || job.priority > selected.priority) selected = job;
      if (selected) pending.delete(selected.target);
      return selected;
    },
    clear() {
      pending.clear();
    },
    get size() {
      return pending.size;
    }
  };
}
