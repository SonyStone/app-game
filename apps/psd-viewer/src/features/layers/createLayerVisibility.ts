import type { PsdLayerNode } from '@app-game/psd/viewer';
import { createMemo, createSignal, type Accessor } from 'solid-js';
import { layerRows } from './layerTree';

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

  /** Isolates a record with its ancestors and descendants using transient overrides. */
  function solo(nodes: readonly PsdLayerNode[], index: number) {
    const rows = layerRows(nodes);
    const selected = rows.find(({ node }) => node.index === index);
    if (!selected) {
      return;
    }

    const keep = new Set([index, ...selected.ancestors.map((node) => node.index)]);
    setOverrides(
      new Map(
        rows.map(({ node, ancestors }) => [
          node.index,
          keep.has(node.index) || ancestors.some((parent) => parent.index === index)
        ])
      )
    );
  }

  return { overrides, pairs, setVisible, restoreSaved, solo };
}
