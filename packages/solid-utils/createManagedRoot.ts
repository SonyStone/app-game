import { createRoot, getOwner, onCleanup, Owner } from 'solid-js';
import { linkCleanupToOwners } from './link-cleanup-to-owners';

/**
 * Creates a managed, reusable SolidJS root that persists until explicitly disposed.
 *
 * This function creates a component root that:
 * 1. Is created only once upon first invocation
 * 2. Can be reused across multiple calls without creating new roots
 * 3. Automatically links its disposal to provided owner contexts
 * 4. Resets itself when disposed, allowing recreation on next call
 *
 * Use this to create persistent reactive contexts that exist outside the normal
 * component tree but still maintain proper cleanup when parent components unmount.
 *
 * @param rootFn - Function that receives the disposal callback and defines the root's content
 * @param owners - Owner contexts that should trigger cleanup of this root when they're disposed
 * @returns A function that activates/reuses the root when called
 *
 * @example
 * ```ts
 * // Create a root that's linked to the current component
 * const activateTooltip = createManagedRoot(
 *   (dispose) => {
 *     // Tooltip content and logic here
 *     const hideTooltip = () => dispose();
 *     document.body.appendChild(tooltipElement);
 *   },
 *   getOwner()
 * );
 *
 * // Call this whenever you want to show the tooltip
 * activateTooltip();
 * ```
 */
export function createManagedRoot(rootFn: (dispose: VoidFunction) => void, ...owners: (typeof Owner | undefined)[]) {
  // Default to current owner if none provided
  if (owners?.length === 0) owners = [getOwner()];

  // Track root disposal function
  let rootDisposer: VoidFunction | undefined = undefined;

  return () => {
    // Skip if root already exists
    if (rootDisposer) {
      return;
    }

    // Create root and store its disposer
    rootDisposer = createRoot((dispose) => {
      // Run user-provided root function
      rootFn(dispose);

      // Link cleanup to all owners
      linkCleanupToOwners(dispose, ...owners);

      // Reset when disposed
      onCleanup(() => {
        rootDisposer = undefined;
      });

      return dispose;
    });
  };
}
