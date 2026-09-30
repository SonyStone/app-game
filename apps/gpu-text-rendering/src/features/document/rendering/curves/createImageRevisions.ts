import type { KeepGpuResource } from '@app-game/solid-gpu/gpu';

/**
 * Propagates image uploads to the pages that paint them.
 *
 * Every raster `change` invalidates the composed tiles of the pages using that image (all cached pages for an
 * image-less change). The first time an image's fallback becomes drawable, the revision of each page painting
 * it advances, so retained command bundles recorded without the image are re-encoded. The listener is removed
 * when `keep`'s owner is destroyed.
 */
export function createImageRevisions(
  raster: { events: EventTarget; hasFallback(image: number): boolean },
  runs: readonly (readonly { image: number | undefined }[])[],
  tileCache: { invalidate(pages?: Iterable<number>): void },
  keep: KeepGpuResource
) {
  const imagePages = new Map<number, Set<number>>();
  const readyImages = new Set<number>();
  const revisions = new Uint32Array(runs.length);

  for (const [index, pageRuns] of runs.entries()) {
    for (const { image } of pageRuns) {
      if (image === undefined) {
        continue;
      }

      const pages = imagePages.get(image) ?? new Set<number>();
      pages.add(index);
      imagePages.set(image, pages);
    }
  }

  const uploaded = (event: Event) => {
    const image = (event as CustomEvent<{ image: number } | undefined>).detail?.image;
    if (image !== undefined && raster.hasFallback(image) && !readyImages.has(image)) {
      readyImages.add(image);

      for (const page of imagePages.get(image) ?? []) {
        revisions[page]!++;
      }
    }

    tileCache.invalidate(image === undefined ? undefined : (imagePages.get(image) ?? []));
  };
  raster.events.addEventListener('change', uploaded);
  keep({ destroy: () => raster.events.removeEventListener('change', uploaded) });

  /** Revision of `page`'s image fallbacks; changes whenever one of them first becomes drawable. */
  return (page: number) => revisions[page]!;
}
