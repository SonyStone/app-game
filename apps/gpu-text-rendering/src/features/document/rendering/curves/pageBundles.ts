import type { KeepGpuResource } from '@app-game/solid-gpu/gpu';
import type { PaintNode } from '../../plan/paintTree';

type PaintLeaf = Exclude<PaintNode, { children: PaintNode[] }>;

/** Retains command bundles for ordinary pages; transparency compositing keeps its ordered pass path. */
export function createPageBundles(
  device: GPUDevice,
  format: GPUTextureFormat,
  trees: PaintNode[][],
  keep: KeepGpuResource
) {
  // Pan reuses commands. Crossing a shader-selection scale band records the page's new variant; views at different
  // scales keep one variant each. Keep ordinary books resident instead of evicting them every overview frame.
  const capacity = Math.max(512, Math.min(trees.length, 2048));
  const cache = new Map<string, GPURenderBundle>();
  keep({ destroy: () => cache.clear() });

  return (
    page: number,
    paint: (encoder: GPURenderBundleEncoder, node: PaintLeaf) => void,
    variant: string | number = 0
  ) => {
    const key = `${page}/${variant}`;
    let bundle = cache.get(key);
    cache.delete(key);

    if (!bundle) {
      const encoder = device.createRenderBundleEncoder({ colorFormats: [format] });

      for (const node of trees[page]!) {
        if (!('children' in node)) {
          paint(encoder, node);
        }
      }

      bundle = encoder.finish();
    }

    cache.set(key, bundle);

    if (cache.size > capacity) {
      cache.delete(cache.keys().next().value!);
    }

    return bundle;
  };
}
