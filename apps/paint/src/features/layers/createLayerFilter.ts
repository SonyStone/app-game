import { makeTimer } from '@solid-primitives/timer';
import { createEffect, createMemo, createSignal, onCleanup, untrack, type Accessor } from 'solid-js';

/**
 * Keeps a long layer list on an infinite canvas short: the Layers panel shows the layers with paint in view, the
 * selected layer and empty layers, such as one just added. The layers in view are taken over only once the camera
 * has rested for `settleMs`, so the list does not change while the view moves. `showAll` lists every layer. Must be
 * created within a Solid owner.
 */
export function createLayerFilter(options: {
  /** The document's layers, with their number of tiles holding paint. */
  layers: Accessor<readonly { id: string; tileCount: number }[]>;
  activeId: Accessor<string>;
  /** Ids of the layers with paint in view, as the engine reports them while the view moves. */
  inView: Accessor<readonly string[]>;
  /** Read only to notice that the view moved. */
  camera: Accessor<unknown>;
  /** Milliseconds the view must rest before the list follows it; 300 by default. */
  settleMs?: number;
}) {
  const [settled, setSettled] = createSignal<readonly string[]>(untrack(options.inView));
  const [showAll, setShowAll] = createSignal(false);
  let clearTimer: (() => void) | undefined;

  createEffect(
    () => {
      options.camera();
      return options.inView();
    },
    (ids) => {
      clearTimer?.();
      clearTimer = makeTimer(() => setSettled(ids), options.settleMs ?? 300, setTimeout);
    }
  );
  onCleanup(() => clearTimer?.());

  /** Layers the filter keeps, whether or not it is applied. */
  const kept = createMemo(() => {
    const ids = new Set(settled());
    ids.add(options.activeId());
    for (const layer of options.layers()) {
      if (layer.tileCount === 0) {
        ids.add(layer.id);
      }
    }

    return ids;
  });

  return {
    /** Whether the panel lists layer `id`. */
    shown: (id: string) => showAll() || kept().has(id),
    /** Number of layers the filter leaves out, also while every layer is shown. */
    offScreen: () => options.layers().filter((layer) => !kept().has(layer.id)).length,
    showAll,
    setShowAll
  };
}

/** The Layers panel's filter of off-screen layers. */
export type LayerFilter = ReturnType<typeof createLayerFilter>;
