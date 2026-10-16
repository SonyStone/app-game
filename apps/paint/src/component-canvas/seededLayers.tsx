import { createDocument, type LayerAction, type LayerInfo } from '@app-game/paint-core/document';
import type { JSX } from '@solidjs/web';
import { createSignal, untrack } from 'solid-js';
import type { DocumentState } from '../features/layers';

/**
 * A paint-core document of `layers` (bottom first) of its own, kept in memory, for a layers panel in `children`: its
 * state and the commands that edit it, as the engine would apply them.
 */
export function SeededLayers(props: {
  layers: readonly LayerSeed[];
  children: (layers: {
    state: () => DocumentState;
    onAction: (action: LayerAction) => void;
    onLinearBlending: (linear: boolean) => void;
  }) => JSX.Element;
}) {
  const drawing = seededDocument(untrack(() => props.layers));
  const [state, setState] = createSignal(drawing.state());
  const run = (change: () => void) => {
    try {
      change();
    } catch {
      // Merging needs the engine's pixels; the panel stays as it was.
    }

    setState(drawing.state());
  };

  return untrack(() =>
    props.children({
      state,
      onAction: (action) => run(() => drawing.changeLayer(action)),
      onLinearBlending: (linear) => run(() => drawing.setLinearBlending(linear))
    })
  );
}

/** A layer of the test data, bottom first, as a paint-core layer without its id. */
export type LayerSeed = Pick<LayerInfo, 'name'> & Partial<Pick<LayerInfo, 'visible' | 'alphaLock' | 'clipping'>>;

/** A paint-core document holding `layers`, bottom first, with the top one selected. */
export function seededDocument(layers: readonly LayerSeed[]) {
  const drawing = createDocument();
  for (const [index, seed] of layers.entries()) {
    if (index > 0) {
      drawing.changeLayer({ type: 'add' });
    }

    // The seed's properties only: an undefined `visible` would hide the layer.
    drawing.changeLayer({ type: 'update', id: drawing.state().activeId, patch: { ...seed } });
  }

  return drawing;
}

/** The four layers every panel shows, bottom first. */
export const fourLayers: readonly LayerSeed[] = [
  { name: 'Flat colors' },
  { name: 'Shadows', clipping: true },
  { name: 'Ink', alphaLock: true },
  { name: 'Sketch', visible: false }
];
