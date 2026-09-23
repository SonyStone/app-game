import type { KeepGpuResource } from '../../../../shared/gpu/resources';
import type { PaintNode } from './paintTree';

type PaintLeaf = Exclude<PaintNode, { children: PaintNode[] }>;

/** Retains command bundles for ordinary pages; transparency compositing keeps its ordered pass path. */
export function createPageBundles(
  device: GPUDevice,
  format: GPUTextureFormat,
  trees: PaintNode[][],
  keep: KeepGpuResource
) {
  // Pan reuses commands. Crossing a shader-selection scale band replaces only the affected
  // page's variant. Keep ordinary books resident instead of evicting them every overview frame.
  const capacity = Math.max(512, Math.min(trees.length, 2048));
  const cache = new Map<number, { variant: string | number; bundle: GPURenderBundle }>();
  keep({ destroy: () => cache.clear() });

  return (
    page: number,
    paint: (encoder: GPURenderBundleEncoder, node: PaintLeaf) => void,
    variant: string | number = 0
  ) => {
    const previous = cache.get(page);
    let bundle = previous?.variant === variant ? previous.bundle : undefined;
    cache.delete(page);

    if (!bundle) {
      const encoder = device.createRenderBundleEncoder({ colorFormats: [format] });

      for (const node of trees[page]!) {
        if (!('children' in node)) {
          paint(encoder, node);
        }
      }

      bundle = encoder.finish();
    }

    cache.set(page, { variant, bundle });

    if (cache.size > capacity) {
      cache.delete(cache.keys().next().value!);
    }

    return bundle;
  };
}
