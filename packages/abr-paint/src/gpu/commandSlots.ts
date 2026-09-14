import type { commandBatch } from './commandBatch';

/** Reserves reusable buffer slots until their batch is submitted.
 * Call before writing a slot. If a render pass is open, supply a flush callback that ends it first.
 * The owner allocates/destroys the actual GPU resources; this pool owns only weak batch cursors.
 */
export function commandSlots(capacity: number) {
  const cursors = new WeakMap<ReturnType<typeof commandBatch>, { version: number; next: number }>();
  return (batch: ReturnType<typeof commandBatch>, flush = batch.flush) => {
    let cursor = cursors.get(batch);
    if (!cursor || cursor.version !== batch.version) {
      cursor = { version: batch.version, next: 0 };
      cursors.set(batch, cursor);
    }
    if (cursor.next === capacity) {
      flush();
      cursor.version = batch.version;
      cursor.next = 0;
    }
    return cursor.next++;
  };
}
