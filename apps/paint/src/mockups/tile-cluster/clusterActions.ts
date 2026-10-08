import { createContext, useContext } from 'solid-js';

/**
 * Lets controls in the cluster report a press-and-drag action, such as panning or picking a value, during which the
 * cluster hides (except the popup in use) and after which it shows again while it is still invoked. `end` may move
 * the cluster to where the action was released, as the navigation puck does after a navigation drag.
 */
export const ClusterActions = createContext<{
  /** Starts an action on `control`, whose place in the cluster may go back under the pointer afterwards. */
  begin: (control?: Element) => void;
  end: (reopenAt?: { x: number; y: number }) => void;
}>();

/** The enclosing cluster's action reporting; throws outside a `ClusterActions` provider. */
export function useClusterActions() {
  return useContext(ClusterActions);
}
