import { createMemo, createSignal, type Accessor } from 'solid-js';
import type { OpenedPsd, PsdClient, PsdResultOf, RenderedPixels } from '../psd-worker';
import { requiresWindowedRendering } from '../psd-worker/protocol';

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
  const [chosen, setView] = createSignal<ViewMode>('ours');
  const view = createMemo(() => {
    const document = opened();
    return document?.ok && requiresWindowedRendering(document.value.info) ? 'ours' : chosen();
  });
  const merged = createMemo(() => {
    const document = opened();
    return document?.ok && !requiresWindowedRendering(document.value.info)
      ? client.merged(document.value.document)
      : undefined;
  });
  const difference = createMemo(() => {
    if (view() !== 'difference') {
      return undefined;
    }

    const document = opened();
    const current = render();
    return document?.ok && current?.ok && !current.value.window
      ? client.difference(document.value.document, current.value.render)
      : undefined;
  });

  return { view, setView, merged, difference };
}
