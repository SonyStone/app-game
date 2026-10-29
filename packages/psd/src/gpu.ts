import { gpuAdjustment } from './gpuAdjustments';
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
export const gpuCompositeCapability = 'rgb8-integer-v2';

/** Bottom-to-top bounded operands: native channels, strict generated rasters, group returns and adjustment tables. */
export type PsdGpuLayer = {
  index: number;
  bounds: PsdRegionRect;
  opacity: number;
  fill: number;
  mode: number;
  visible: boolean;
  ancestors: number[];
  density: number;
  /** Two words per pixel: packed little-endian RGBA and mask. Lookup adjustments append 768 two-word entries. */
  samples: Uint32Array;
  /** Base record of an ordinary clipping chain; absent for an unclipped operand. */
  clipBase?: number;
  /** Plain isolated Normal group, returned after all its children render into transparency. */
  isolated?: boolean;
  /** Lookup entries follow the pixel window in samples; Threshold uses the weighted RGB luminance. */
  adjustment?: 1 | 2;
  /** Weighted-luminance cutoff for a Threshold adjustment, inclusive. */
  threshold?: number;
  /** Type and merged operands retain the strict renderer's separate coverage return. */
  staged?: boolean;
  /** Default sRGB text-gamma table; ordinary imported caches use document mixing. */
  textGamma?: boolean;
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
 * Plain isolated Normal groups retain their separate shape/opacity return. Generated full-strength Normal
 * operands come from strict isolated renders; cached text uses admitted document or sRGB text mixing.
 * Cached smart rasters require cached settings and no filter-mask stage. Styles remain strict CPU work.
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

  function visit(nodes: readonly PsdLayerNode[], partialAncestor = false) {
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
        detail.effects
      ) {
        reasons.add('Styles or advanced blending require the strict worker.');
      }
      const operand = needsStrictOperand(node);
      if (
        operand &&
        (partialAncestor || node.blendMode !== 'normal' || node.opacity !== 255 || node.fill !== 255 || node.clipped)
      ) {
        reasons.add('Generated operands require full-strength unclipped Normal returns.');
      }
      if (
        operand &&
        (node.keys.includes('vstk') ||
          (node.kind === 'shape' && !node.keys.includes('SoCo')) ||
          (settings.linearBlending && node.keys.includes('GdFl')))
      ) {
        // Stroked/gradient shapes can return separate fill and stroke operands. Gradient Fill can
        // choose encoded coverage even with document gamma enabled. An isolated RGBA loses those stages.
        reasons.add('Separate generated fill/stroke or Gradient Fill mixing requires the strict worker.');
      }
      const mask = detail.mask;
      if (mask && !('error' in mask) && !mask.disabled) {
        if (!operand && (mask.real || mask.relativeToLayer || (mask.userFeather ?? mask.vectorFeather ?? 0) !== 0)) {
          reasons.add('Independent, relative or feathered masks require the strict worker.');
        }
      } else if (mask && 'error' in mask) {
        reasons.add('Unreadable mask metadata.');
      }

      if (node.kind === 'group') {
        if (
          !(
            (node.blendMode === 'passThrough' && !settings.linearBlending && node.opacity === 255) ||
            node.blendMode === 'normal'
          ) ||
          node.fill !== 255 ||
          node.clipped ||
          node.vectorMask ||
          node.mask
        ) {
          reasons.add('This group return is outside the proven flattening domain.');
        }
        visit(node.children ?? [], partialAncestor || node.opacity !== 255);
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
      } else if (node.kind === 'text') {
        const text = detail.text;
        const imported = !info.blocks.some((block) => block.key === 'Txt2');
        if (
          !text ||
          'error' in text ||
          text.engineError ||
          text.antiAlias?.startsWith('Platform') ||
          settings.availableFonts != null ||
          (!imported &&
            settings.textGamma !== null &&
            (settings.textGamma !== 1.45 ||
              info.resources.some((resource) => resource.id === 1039) ||
              node.fill !== 255))
        ) {
          reasons.add('This text mixer or profile requires the strict worker.');
        }
      } else if (node.kind === 'adjustment') {
        if (!gpuAdjustment(detail) || node.clipped || node.vectorMask) {
          reasons.add('This adjustment kernel or clipping return requires the strict worker.');
        }
      } else if (!['pixel', 'shape', 'fill'].includes(node.kind)) {
        reasons.add(`${node.kind} layers require the strict worker.`);
      }
      if (!gpuBlendModes.includes(node.blendMode as (typeof gpuBlendModes)[number])) {
        reasons.add(`Blend mode ${node.blendMode} is unadmitted.`);
      }
      if (node.kind !== 'adjustment' && !operand && ![0, 1, 2].every((id) => p.channels.includes(id))) {
        reasons.add('An RGB channel is missing.');
      }
    }
  }
  visit(layers);
  function clips(nodes: readonly PsdLayerNode[]) {
    let base: PsdLayerNode | undefined;
    for (const node of nodes) {
      if (
        node.clipped &&
        (!base || base.kind === 'group' || base.kind === 'adjustment' || base.keys.includes('vstk'))
      ) {
        reasons.add('Clipping requires a raster, text or generated base without a separate vector stroke.');
      }
      if (!node.clipped) {
        base = node;
      }
      if (node.children) {
        clips(node.children);
      }
    }
  }
  clips(layers);
  return [...reasons];
}

/**
 * Reads only intersecting native channel windows. The 24 MiB preparation cap covers raw planes and packed output;
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
  const leaves: { node: PsdLayerNode; ancestors: number[]; clipBase?: number }[] = [];
  function collect(nodes: readonly PsdLayerNode[], ancestors: number[]) {
    let base: number | undefined;
    for (const node of nodes) {
      const clipBase = node.clipped ? base : undefined;
      if (!node.clipped) {
        base = node.index;
      }
      const detail = document.layerDetail(node.index);
      if (detail.ok) {
        details.set(node.index, detail.value);
      }
      if (node.kind === 'group') {
        if (node.blendMode === 'normal') {
          leaves.push({ node, ancestors });
        }
        collect(node.children ?? [], [...ancestors, node.index]);
      } else {
        leaves.push({ node, ancestors, clipBase });
      }
    }
  }
  collect(document.layers, []);
  const reasons = gpuCompositeAdmission(document.info, document.layers, details, settings);
  if (reasons.length) {
    return { ok: false, error: { kind: 'unsupported', message: reasons.join(' ') } };
  }

  const windows = leaves.map((leaf) => ({
    ...leaf,
    bounds:
      ['group', 'adjustment'].includes(leaf.node.kind) || needsStrictOperand(leaf.node)
        ? rect
        : intersection(rect, leaf.node.bounds)
  }));
  const bytes = windows.reduce(
    (sum, { node, bounds }) => sum + bounds.width * bounds.height * 13 + (node.kind === 'adjustment' ? 768 * 8 : 0),
    0
  );
  if (bytes > 24 * 1024 * 1024) {
    return {
      ok: false,
      error: {
        kind: 'budget',
        resource: 'GPU layer preparation bytes',
        requested: BigInt(bytes),
        limit: 24n * 1024n * 1024n,
        message: 'GPU layer preparation exceeds its 24 MiB window budget.'
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
  for (const { node, ancestors, bounds, clipBase } of windows) {
    if (!bounds.width || !bounds.height) {
      continue;
    }
    const detail = details.get(node.index)!;
    if (node.kind === 'group') {
      const samples = new Uint32Array(rect.width * rect.height * 2);
      for (let i = 0; i < samples.length; i += 2) {
        samples[i] = 0xff000000;
        samples[i + 1] = 255;
      }
      layers.push({
        index: node.index,
        bounds: rect,
        opacity: node.opacity,
        fill: 255,
        mode: 0,
        visible: node.visible,
        ancestors,
        density: 255,
        samples,
        isolated: true,
        staged: true
      });
      continue;
    }
    const text = node.kind === 'text' && document.info.blocks.some((block) => block.key === 'Txt2');
    if (needsStrictOperand(node)) {
      // Source::new and generator::painted own coverage, geometry and mask dependencies. Full-strength
      // Normal has Paint(transparent,S,255), then L by shape: its isolated RGBA is an independent operand.
      // Keep the document gamma off during extraction: a Pass Through ancestor otherwise doubles alpha.
      const shown = new Set([node.index, ...ancestors]);
      const visibility = [...details.keys()].map((index) => [index, shown.has(index)] as const);
      const rendered = document.renderRegion(
        rect,
        {
          ...settings,
          linearBlending: false,
          maxWorkPixels: 4_194_304,
          budget: { allocationBytes: 24 * 1024 * 1024, liveBytes: 2 * 1024 ** 3, retainedBytes: retainedBytes + bytes }
        },
        visibility
      );
      if (!rendered.ok) {
        return rendered;
      }
      if (!rendered.value.exactToLayerRender || rendered.value.approximations.length) {
        return { ok: false, error: { kind: 'unsupported', message: 'Strict operand extraction was approximate.' } };
      }
      const samples = new Uint32Array(rect.width * rect.height * 2);
      const rgba = rendered.value.pixels;
      for (let i = 0; i < rgba.length / 4; i++) {
        samples[i * 2] =
          (rgba[i * 4]! | (rgba[i * 4 + 1]! << 8) | (rgba[i * 4 + 2]! << 16) | (rgba[i * 4 + 3]! << 24)) >>> 0;
        samples[i * 2 + 1] = 255;
      }
      layers.push({
        index: node.index,
        bounds: rect,
        opacity: 255,
        fill: 255,
        mode: 0,
        visible: node.visible,
        ancestors,
        density: 255,
        samples
      });
      continue;
    }
    const mask =
      detail.mask && !('error' in detail.mask) && !detail.mask.disabled && detail.properties.channels.includes(-2)
        ? detail.mask
        : undefined;
    if (node.kind === 'adjustment') {
      const adjustment = gpuAdjustment(detail)!;
      const extra = adjustment.kind === 'lookup' ? 768 : 0;
      const samples = new Uint32Array((bounds.width * bounds.height + extra) * 2);
      const result = mask
        ? document.layerRegion(node.index, bounds, new Int16Array([-2]), {
            allocationBytes: 24 * 1024 * 1024,
            liveBytes: 2 * 1024 ** 3,
            retainedBytes: retainedBytes + bytes
          })
        : undefined;
      if (result && !result.ok) {
        return result;
      }
      const plane = result?.ok ? result.value.planes[0] : undefined;
      for (let y = 0; y < bounds.height; y++) {
        for (let x = 0; x < bounds.width; x++) {
          const at = (y * bounds.width + x) * 2;
          const px = bounds.left + x - (plane?.left ?? 0);
          const py = bounds.top + y - (plane?.top ?? 0);
          samples[at] = 0xff000000;
          samples[at + 1] =
            plane && px >= 0 && py >= 0 && px < plane.width && py < plane.height
              ? plane.bytes[py * plane.width + px]!
              : (mask?.defaultColor ?? 255);
        }
      }
      if (adjustment.kind === 'lookup') {
        adjustment.values.forEach((value, i) => {
          samples[(bounds.width * bounds.height + i) * 2] = value;
        });
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
        samples,
        adjustment: adjustment.kind === 'lookup' ? 1 : 2,
        threshold: adjustment.kind === 'threshold' ? adjustment.level : undefined
      });
      continue;
    }
    const ids = [0, 1, 2, ...(detail.properties.channels.includes(-1) ? [-1] : []), ...(mask ? [-2] : [])];
    const result = document.layerRegion(node.index, bounds, new Int16Array(ids), {
      allocationBytes: 24 * 1024 * 1024,
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
      clipBase,
      staged: text,
      textGamma: text && settings.textGamma === 1.45,
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

/** Geometry and generated colors are extracted by the strict renderer, never inferred from saved caches. */
function needsStrictOperand(node: PsdLayerNode) {
  return node.kind === 'shape' || node.kind === 'fill' || !!node.vectorMask;
}
