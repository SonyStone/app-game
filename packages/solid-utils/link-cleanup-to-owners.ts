import { access, asArray } from '@solid-primitives/utils';
import { onCleanup, Owner, runWithOwner } from 'solid-js';

/**
 * Links a cleanup function to one or more owner contexts, ensuring proper resource disposal.
 *
 * This function registers the provided cleanup function with multiple SolidJS owner contexts,
 * ensuring that when any of these owners are disposed, the cleanup function will be called.
 * This prevents memory leaks and ensures proper cleanup of transient components even if
 * their parent contexts are destroyed.
 *
 * @param cleanupFn - The function to call when any owner is disposed
 * @param owners - One or more SolidJS owner contexts to link the cleanup to
 *
 * @example
 * ```ts
 * // Link component cleanup to both parent and current owner
 * linkCleanupToOwners(
 *   () => element.remove(),
 *   parentOwner,
 *   getOwner()
 * );
 * ```
 */
export function linkCleanupToOwners(cleanupFn: VoidFunction, ...owners: (typeof Owner | undefined)[]) {
  asArray(access(owners)).forEach((owner) => owner && runWithOwner(owner, onCleanup.bind(void 0, cleanupFn)));
}
