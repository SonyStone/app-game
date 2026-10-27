import type {
  PsdInfo,
  PsdLayerDetail,
  PsdLayerNode,
  PsdRegionRect,
  PsdRenderSettings,
  PsdResult,
  PsdViewerDocument
} from './viewer';

/** Versioned exact-arithmetic domain; a mismatch disables this capability for the document session. */
export const gpuCompositeCapability = 'rgb8-integer-v1';

/** Bottom-to-top operands with raw, bounded RGB/alpha and mask samples. No compositor arithmetic runs here. */
export type PsdGpuLayer = {
  index: number;
  bounds: PsdRegionRect;
  opacity: number;
  fill: number;
  mode: number;
  visible: boolean;
  ancestors: number[];
  density: number;
  /** Two words per pixel: packed little-endian RGBA, then the raw mask byte. */
  samples: Uint32Array;
};

/** A prepared source window is reusable across visibility changes, but never across documents or settings. */
export type PsdGpuLayers = {
  capability: typeof gpuCompositeCapability;
  rect: PsdRegionRect;
  layers: PsdGpuLayer[];
};

/**
 * Conservatively admits ordinary RGB8 rasters, unfeathered raster masks and separable modes. Full-strength
 * Pass Through groups flatten only with encoded blending: gamma 1.0 materializes group alpha a second time.
 * Cached smart rasters require cached settings and no filter-mask stage. Type mixing and isolated groups refuse.
 * Hidden records are checked too, so a future visibility flip cannot bypass admission.
 */
export function gpuCompositeAdmission(
  info: PsdInfo,
  layers: readonly PsdLayerNode[],
  details: ReadonlyMap<number, PsdLayerDetail>,
  settings: PsdRenderSettings
): string[] {
  const reasons = new Set<string>();
  if (!layers.length) {
    reasons.add('A flattened document uses its saved Background, not a layer stack.');
  }
  if (info.mode !== 3 || info.depth !== 8) {
    reasons.add('Only RGB8 process samples are admitted.');
  }
  if (settings.state || settings.vectorPaths || settings.typeLayers || settings.smartObjects) {
    reasons.add('Saved states and rerasterization require the strict worker.');
  }
  if (settings.linearBlending && info.resources.some((resource) => resource.id === 1039)) {
    reasons.add('Gamma 1.0 currently requires an untagged sRGB working space.');
  }
  if (
    info.notes.length ||
    info.resources.some((resource) => resource.id === 1075) ||
    info.blocks.some((block) => ['artd', 'abdd'].includes(block.key))
  ) {
    reasons.add('Document policy, timeline or artboard semantics require the strict worker.');
  }

  function visit(nodes: readonly PsdLayerNode[]) {
    for (const node of nodes) {
      const detail = details.get(node.index);
      if (!detail) {
        reasons.add('Layer metadata is unavailable.');
        continue;
      }
      const p = detail.properties;
      if (
        node.notes.length ||
        node.pixelSource ||
        p.blendIf ||
        p.knockout !== 'none' ||
        !p.transparencyShapesLayer ||
        p.blendInteriorAsGroup ||
        !p.blendClippedAsGroup ||
        node.keys.some((key) => ['brst', 'artb', 'artd', 'abdd', 'lfx2', 'lfxs', 'lmfx', 'lrFX'].includes(key)) ||
        detail.effects ||
        node.vectorMask ||
        node.clipped
      ) {
        reasons.add('Styles, vectors, clipping or advanced blending require the strict worker.');
      }
      const mask = detail.mask;
      if (mask && !('error' in mask) && !mask.disabled) {
        if (mask.real || mask.relativeToLayer || (mask.userFeather ?? mask.vectorFeather ?? 0) !== 0) {
          reasons.add('Independent, relative or feathered masks require the strict worker.');
        }
      } else if (mask && 'error' in mask) {
        reasons.add('Unreadable mask metadata.');
      }

      if (node.kind === 'group') {
        if (
          settings.linearBlending ||
          node.blendMode !== 'passThrough' ||
          node.opacity !== 255 ||
          node.fill !== 255 ||
          node.mask
        ) {
          reasons.add('This group return is outside the proven flattening domain.');
        }
        visit(node.children ?? []);
        continue;
      }
      if (node.kind === 'smartObject') {
        const smart = detail.smartObject;
        if (
          !smart ||
          'error' in smart ||
          smart.filters?.maskEnabled ||
          node.keys.some((key) => ['FEid', 'FXid'].includes(key))
        ) {
          reasons.add('The smart-object cache has a separate filter stage.');
        }
      } else if (node.kind !== 'pixel') {
        reasons.add(`${node.kind} layers require the strict worker.`);
      }
      if (!gpuBlendModes.includes(node.blendMode as (typeof gpuBlendModes)[number])) {
        reasons.add(`Blend mode ${node.blendMode} is unadmitted.`);
      }
      if (![0, 1, 2].every((id) => p.channels.includes(id))) {
        reasons.add('An RGB channel is missing.');
      }
    }
  }
  visit(layers);
  return [...reasons];
}

/**
 * Reads only intersecting native channel windows. The 32 MiB preparation cap covers raw planes and packed output;
 * it refuses before decoding, and never calls whole-layer layerPixels. Empty source intersections need no read.
 * retainedBytes counts caller-owned compressed input alongside the additional packed source storage.
 */
export function prepareGpuLayers(
  document: PsdViewerDocument,
  rect: PsdRegionRect,
  settings: PsdRenderSettings,
  retainedBytes = 0
): PsdResult<PsdGpuLayers> {
  const details = new Map<number, PsdLayerDetail>();
  const leaves: { node: PsdLayerNode; ancestors: number[] }[] = [];
  function collect(nodes: readonly PsdLayerNode[], ancestors: number[]) {
    for (const node of nodes) {
      const detail = document.layerDetail(node.index);
      if (detail.ok) {
        details.set(node.index, detail.value);
      }
      if (node.kind === 'group') {
        collect(node.children ?? [], [...ancestors, node.index]);
      } else {
        leaves.push({ node, ancestors });
      }
    }
  }
  collect(document.layers, []);
  const reasons = gpuCompositeAdmission(document.info, document.layers, details, settings);
  if (reasons.length) {
    return { ok: false, error: { kind: 'unsupported', message: reasons.join(' ') } };
  }

  const windows = leaves.map(({ node, ancestors }) => ({ node, ancestors, bounds: intersection(rect, node.bounds) }));
  const bytes = windows.reduce((sum, { bounds }) => sum + bounds.width * bounds.height * 13, 0);
  if (bytes > 32 * 1024 * 1024) {
    return {
      ok: false,
      error: {
        kind: 'budget',
        resource: 'GPU layer preparation bytes',
        requested: BigInt(bytes),
        limit: 32n * 1024n * 1024n,
        message: 'GPU layer preparation exceeds its 32 MiB window budget.'
      }
    };
  }

  // A preview that the strict worker cannot verify under its unchanged window policy is unadmitted.
  const { grayProfile, smartObjects, availableFonts, ...options } = settings;
  const capability = document.regionCapability(rect, {
    ...options,
    grayProfile: grayProfile ?? undefined,
    smartObjects: smartObjects ?? undefined,
    availableFonts: availableFonts ? [...availableFonts] : undefined,
    maxWorkPixels: 4_194_304,
    budget: { liveBytes: 2 * 1024 ** 3, retainedBytes: retainedBytes + bytes }
  });
  if (!capability.ok) {
    return capability;
  }
  if (capability.value.refusal) {
    return { ok: false, error: capability.value.refusal };
  }

  const layers: PsdGpuLayer[] = [];
  for (const { node, ancestors, bounds } of windows) {
    if (!bounds.width || !bounds.height) {
      continue;
    }
    const detail = details.get(node.index)!;
    const mask =
      detail.mask && !('error' in detail.mask) && !detail.mask.disabled && detail.properties.channels.includes(-2)
        ? detail.mask
        : undefined;
    const ids = [0, 1, 2, ...(detail.properties.channels.includes(-1) ? [-1] : []), ...(mask ? [-2] : [])];
    const result = document.layerRegion(node.index, bounds, new Int16Array(ids), {
      allocationBytes: 32 * 1024 * 1024,
      liveBytes: 2 * 1024 ** 3,
      retainedBytes: retainedBytes + bytes
    });
    if (!result.ok) {
      return result;
    }
    const planes = new Map(result.value.planes.map((plane) => [plane.id, plane]));
    const samples = new Uint32Array(bounds.width * bounds.height * 2);
    for (let y = 0; y < bounds.height; y++) {
      for (let x = 0; x < bounds.width; x++) {
        const sample = (id: number, fallback: number) => {
          const plane = planes.get(id);
          const px = bounds.left + x - (plane?.left ?? 0);
          const py = bounds.top + y - (plane?.top ?? 0);
          return plane && px >= 0 && py >= 0 && px < plane.width && py < plane.height
            ? (plane.bytes[py * plane.width + px] ?? fallback)
            : fallback;
        };
        const offset = (y * bounds.width + x) * 2;
        samples[offset] = (sample(0, 0) | (sample(1, 0) << 8) | (sample(2, 0) << 16) | (sample(-1, 255) << 24)) >>> 0;
        samples[offset + 1] = sample(-2, mask?.defaultColor ?? 255);
      }
    }
    layers.push({
      index: node.index,
      bounds,
      opacity: node.opacity,
      fill: node.fill,
      mode: gpuBlendModes.indexOf(node.blendMode as (typeof gpuBlendModes)[number]),
      visible: node.visible,
      ancestors,
      density: mask?.userDensity ?? mask?.vectorDensity ?? 255,
      samples
    });
  }
  return { ok: true, value: { capability: gpuCompositeCapability, rect, layers } };
}

/** Stable shader mode IDs. Nonseparable modes and Dissolve intentionally have no entry. */
export const gpuBlendModes = [
  'normal',
  'darken',
  'lighten',
  'multiply',
  'screen',
  'colorBurn',
  'linearBurn',
  'colorDodge',
  'linearDodge',
  'overlay',
  'softLight',
  'hardLight',
  'vividLight',
  'linearLight',
  'pinLight',
  'hardMix',
  'difference',
  'exclusion',
  'subtract',
  'divide'
] as const;

function intersection(
  a: PsdRegionRect,
  b: { left: number; top: number; right: number; bottom: number }
): PsdRegionRect {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  return {
    left,
    top,
    width: Math.max(0, Math.min(a.left + a.width, b.right) - left),
    height: Math.max(0, Math.min(a.top + a.height, b.bottom) - top)
  };
}
