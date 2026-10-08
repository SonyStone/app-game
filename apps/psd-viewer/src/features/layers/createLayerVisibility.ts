import type { PsdLayerNode } from '@app-game/psd/viewer';
import { createMemo, createSignal, type Accessor } from 'solid-js';

/**
 * Owns visibility overrides of layer records over their saved visibility. `reset` is read as the reset key: a new
 * document drops every override. Setting a layer back to its saved state removes its override, so `pairs` lists only
 * real changes, in the `[index, visible]` form renders take.
 */
export function createLayerVisibility(reset: Accessor<unknown>) {
  const [overrides, setOverrides] = createSignal<ReadonlyMap<number, boolean>>(() => {
    reset();
    return new Map();
  });
  const pairs = createMemo(() => [...overrides()]);

  /** Shows or hides `node` for rendering. */
  function setVisible(node: PsdLayerNode, visible: boolean) {
    setOverrides((current) => {
      const next = new Map(current);
      if (visible === node.visible) {
        next.delete(node.index);
      } else {
        next.set(node.index, visible);
      }

      return next;
    });
  }

  /** Returns every layer to its saved visibility. */
  const restoreSaved = () => setOverrides(new Map());

  return { overrides, pairs, setVisible, restoreSaved };
}
