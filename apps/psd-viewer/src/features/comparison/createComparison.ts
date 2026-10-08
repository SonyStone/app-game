import { createMemo, createSignal, type Accessor } from 'solid-js';
import type { OpenedPsd, PsdClient, PsdResultOf, RenderedPixels } from '../psd-worker';

/** What the canvas shows: our render, Photoshop's saved merged image, or the heat map of their difference. */
export type ViewMode = 'ours' | 'photoshop' | 'difference';

/**
 * Owns the view switch and what it needs from the worker: Photoshop's merged image, read once per document, and the
 * difference of the current render with it, computed only while the difference view is selected and again for every
 * new render.
 */
export function createComparison(
  client: PsdClient,
  opened: Accessor<PsdResultOf<OpenedPsd> | undefined>,
  render: Accessor<PsdResultOf<RenderedPixels> | undefined>
) {
  const [view, setView] = createSignal<ViewMode>('ours');
  const merged = createMemo(() => {
    const document = opened();
    return document?.ok ? client.merged(document.value.document) : undefined;
  });
  const difference = createMemo(() => {
    if (view() !== 'difference') {
      return undefined;
    }

    const document = opened();
    const current = render();
    return document?.ok && current?.ok ? client.difference(document.value.document, current.value.render) : undefined;
  });

  return { view, setView, merged, difference };
}
