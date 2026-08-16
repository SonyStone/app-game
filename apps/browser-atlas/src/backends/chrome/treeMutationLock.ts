const PERSISTENT_TREE_LOCK_NAME = 'browser-atlas:persistent-tree:v2';

/** Serializes persistent-tree transactions across extension pages and the MV3 background worker. */
export function withPersistentTreeMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  const lockManager = globalThis.navigator?.locks;
  return lockManager ? lockManager.request(PERSISTENT_TREE_LOCK_NAME, operation) : operation();
}
