import { createPatternPyramid } from '@app-game/abr-brush/patternPyramid';
import { rasterizePatternRegion } from '@app-game/abr-brush/patternRaster';
import { createTipPyramid } from '@app-game/abr-brush/tipPyramid';
import { rasterizeSampledTip } from '@app-game/abr-brush/sampledTipRaster';
import { accumulateColorPaintbrush } from '@app-game/abr-brush/colorMaskAccumulation';
import { accumulatePaintbrushMask } from '@app-game/abr-brush/maskAccumulation';
import { maskRasterAddresses, maskRasterRects, maskRasterColorBytes, paintbrushMaskMode } from '@app-game/abr-brush/maskRaster';
import { createMaskRoundingTable } from '@app-game/abr-brush/maskRounding';
import { accumulateAffineSecondary } from '@app-game/abr-brush/secondaryMask';
import { blockEraserTip, blockEraserValues, isBlockEraser } from '@app-game/abr-brush/blockEraser';
import { linearSourceOver } from '@app-game/abr-brush/effects';
import { paintBlend, paintModes } from '@app-game/abr-brush/paintBlend';
import { pencilCoverage, usesPencilCoverage } from '@app-game/abr-brush/pencil';
import { d } from 'typegpu';
import type { BrushTipImage } from '../../lib/abr';
import { blendModeId, dualCoverage, grain, textureCoverage, textureTone } from './effects';
import { eraserPreviewColor } from './eraser';
import { renderResourcePixels } from './resource-pixels';
import { preparePreviewResources, type PreviewResources } from './resources';
import { isRetouch, renderRetouchPixels } from './retouch';
import {
  createPreviewStroke,
  dualPreviewInput,
  previewColor,
  strokeCompositeOpacity,
  stampStride,
  type PreviewInput,
  type PreviewStroke
} from './stroke';

/** CPU preview fallback. Photoshop evidence, rather than agreement with this renderer, defines brush behavior. */
export function renderPreviewPixels(
  input: PreviewInput,
  tip: BrushTipImage,
  stroke: PreviewStroke | undefined = undefined,
  resources: PreviewResources = {}
) {
  if (input.resourcePreview) return renderResourcePixels(input, tip, resources);
  resources = preparePreviewResources(input, resources);
  if (isBlockEraser(input.values.tool)) {
    input = { ...input, values: blockEraserValues(input.values), opacity: 1, flow: 1 };
    tip = blockEraserTip();
    resources = {};
    stroke = undefined;
  }
  if (isRetouch(input)) {
    input = { ...input, flow: input.values.tool.type === 'MixB' ? input.flow : 1, opacity: 1 };
    stroke ??= createPreviewStroke(input, tip);
    const secondary = dualPreviewInput(input);
    const dual =
      input.values.useDualBrush && resources.dualTip
        ? renderLayers(secondary, resources.dualTip, createPreviewStroke(secondary, resources.dualTip), {}).flow
        : undefined;
    let scratch: ReturnType<typeof renderLayers> | undefined;
    return renderRetouchPixels(input, stroke, (stamp) => {
      const layers = renderLayers(input, tip, stamp, resources, scratch, dual);
      scratch = layers;
      return (i) => layerCoverage(layers, input, i);
    });
  }
  stroke ??= createPreviewStroke(input, tip);
  const layers = renderLayers(input, tip, stroke, resources);
  const background = previewColor(input.background),
    pixels = new Uint8ClampedArray(input.width * input.height * 4);
  const { flow, paint } = layers;
  const mode = Math.max(
    0,
    paintModes.findIndex((mode) => mode === input.values.tool.mode)
  );
  for (let i = 0; i < flow.length; i++) {
    let alpha = layerCoverage(layers, input, i);
    if (input.values.tool.type === 'ErTl') {
      const color = eraserPreviewColor(
        d.vec3f(...background),
        alpha,
        d.vec2f(i % input.width, Math.floor(i / input.width)),
        input.dpr,
        input.values.tool.eraseToHistory
      );
      for (let c = 0; c < 3; c++) pixels[i * 4 + c] = 255 * color[c]!;
      pixels[i * 4 + 3] = 255;
      continue;
    }
    if (mode === 1) alpha = grain(i % input.width, Math.floor(i / input.width), 13.75) < alpha ? 1 : 0;
    if (mode === 27 || mode === 28) alpha = 0;
    const source = layers.channels ? d.vec3f(layers.channels[0][i]! / 255, layers.channels[1][i]! / 255, layers.channels[2][i]! / 255) : d.vec3f(
      paint[i * 3]! / Math.max(0.00001, flow[i]!),
      paint[i * 3 + 1]! / Math.max(0.00001, flow[i]!),
      paint[i * 3 + 2]! / Math.max(0.00001, flow[i]!)
    );
    if (input.colorMixing === 'linear' && mode < 2) {
      const mixed = linearSourceOver(
        d.vec4f(...background, 1),
        d.vec4f(source.x * alpha, source.y * alpha, source.z * alpha, alpha)
      );
      for (let c = 0; c < 3; c++) pixels[i * 4 + c] = 255 * mixed[c]!;
      pixels[i * 4 + 3] = 255;
      continue;
    }
    const mixed = paintBlend(d.vec3f(...background), source, mode);
    for (let c = 0; c < 3; c++) pixels[i * 4 + c] = 255 * (background[c]! * (1 - alpha) + mixed[c]! * alpha);
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

/** Applies stroke-wide effects after accumulation; retouch calls this for each individual stamp. */
function layerCoverage(
  layers: ReturnType<typeof renderLayers>,
  input: PreviewInput,
  i: number
) {
  const { flow, opacity, dual, rawOpacity, maskAccumulation } = layers;
  let alpha = maskAccumulation || dual || usesPencilCoverage(input.values.tool)
    ? flow[i]!
    : Math.min(flow[i]!, opacity[i]!);
  if (input.values.useTexture && !input.values.texture.eachTip && layers.pattern && layers.toneTable)
    alpha = textured(
      alpha,
      layers.pattern[i]!,
      input.values.texture.depth / 100,
      input,
      layers.toneTable
    );
  // Photoshop's command combines the persistent masks after stroke-wide texture,
  // rather than applying the secondary mask separately to every primary dab.
  if (dual) alpha = dualCoverage(alpha, dual[i]!, blendModeId(input.values.dualBrush.mode));
  if (input.values.useWetEdges) {
    const x = i % input.width,
      y = Math.floor(i / input.width);
    const near = Math.min(
      flow[Math.max(0, y - 1) * input.width + x]!,
      flow[Math.min(input.height - 1, y + 1) * input.width + x]!,
      flow[y * input.width + Math.max(0, x - 1)]!,
      flow[y * input.width + Math.min(input.width - 1, x + 1)]!
    );
    alpha = Math.min(1, alpha * 0.65 + Math.max(0, flow[i]! - near) * 2);
  }
  if (usesPencilCoverage(input.values.tool)) alpha = Math.min(pencilCoverage(alpha), opacity[i]!);
  if (dual && !maskAccumulation) alpha = Math.min(alpha, input.values.dualBrush.mode === 'hardMix' ? rawOpacity[i]! : opacity[i]!);
  return alpha * strokeCompositeOpacity(input);
}

function renderLayers(
  input: PreviewInput,
  tip: BrushTipImage,
  stroke: PreviewStroke,
  resources: PreviewResources,
  scratch?: {
    flow: Float32Array;
    opacity: Float32Array;
    rawOpacity: Float32Array;
    paint: Float32Array;
    toneTable?: Float32Array;
    pattern?: Uint8Array;
  },
  cachedDual?: Float32Array
): {
  flow: Float32Array;
  opacity: Float32Array;
  paint: Float32Array;
  rawOpacity: Float32Array;
  dual: Float32Array | undefined;
  toneTable: Float32Array | undefined;
  pattern: Uint8Array | undefined;
  maskAccumulation: 0 | 1 | 2;
  channels: readonly [Uint8Array, Uint8Array, Uint8Array] | undefined;
} {
  const { width, height } = input,
    v = input.values;
  const toneTable = v.useTexture && resources.pattern
    ? scratch?.toneTable ?? createTextureToneTable(v.texture)
    : undefined;
  const pattern = v.useTexture && resources.pattern
    ? scratch?.pattern ?? rasterizePatternRegion(createPatternPyramid(resources.pattern),
      (v.texture.scale / 100) * input.dpr, { x: 0, y: 0, width, height }).data
    : undefined;
  const flow = scratch?.flow.fill(0) ?? new Float32Array(width * height),
    opacity = scratch?.opacity.fill(0) ?? new Float32Array(width * height),
    rawOpacity = scratch?.rawOpacity.fill(0) ?? new Float32Array(width * height),
    paint = scratch?.paint.fill(0) ?? new Float32Array(width * height * 3);
  const maskAccumulation = paintbrushMaskMode(v, input.stampRole === 'secondary');
  const byteMask = maskAccumulation ? new Uint8Array(width * height) : undefined;
  const byteSource = maskAccumulation ? new Uint8Array(width * height) : undefined;
  const rounding = maskAccumulation ? createMaskRoundingTable() : undefined;
  const channels: readonly [Uint8Array, Uint8Array, Uint8Array] | undefined = maskAccumulation === 2
    ? [new Uint8Array(width * height), new Uint8Array(width * height), new Uint8Array(width * height)] : undefined;
  const ratio = channels ? new Uint8Array(width * height) : undefined;
  const dualInput = dualPreviewInput(input);
  const dual: Float32Array | undefined =
    cachedDual ??
    (v.useDualBrush && resources.dualTip
      ? renderLayers(dualInput, resources.dualTip, createPreviewStroke(dualInput, resources.dualTip), {}).flow
      : undefined);
  const sampledLevels = stroke.sampledTips ? createTipPyramid(tip) : undefined;
  const sampledStride = Math.ceil((width + 4) / 4) * 4;
  const sampledBytes = sampledLevels ? new Uint8Array(sampledStride * height + 4) : undefined;
  for (let index = 0; index < stroke.count; index++) {
    const offset = index * stampStride,
      s = stroke.data;
    const x = s[offset]!,
      y = s[offset + 1]!,
      rx = s[offset + 2]!,
      ry = s[offset + 3]!,
      cos = s[offset + 4]!,
      sin = s[offset + 5]!;
    const ex = Math.abs(cos * rx) + Math.abs(sin * ry),
      ey = Math.abs(sin * rx) + Math.abs(cos * ry);
    const sampled = stroke.sampledTips?.[index];
    if (sampled && sampledLevels && sampledBytes)
      rasterizeSampledTip(sampledLevels, sampled, sampledBytes, { offset: 0, stride: sampledStride, width, height,
        secondary: input.stampRole === 'secondary' });
    const bounds = sampled?.bounds ?? { left: Math.floor(x - ex), top: Math.floor(y - ey),
      right: Math.ceil(x + ex), bottom: Math.ceil(y + ey) };
    const regions = maskAccumulation ? maskRasterRects(s, offset, width, height, bounds) : [];
    if (byteSource) for (const region of regions)
      for (let row = region.y; row < region.y + region.height; row++)
        byteSource.fill(0, row * width + region.x, row * width + region.x + region.width);
    for (let py = Math.max(0, bounds.top); py < Math.min(height, bounds.bottom); py++)
      for (let px = Math.max(0, bounds.left); px < Math.min(width, bounds.right); px++) {
        let coverage: number;
        if (sampled && sampledBytes) coverage = sampledBytes[py * sampledStride + px]! / 255;
        else {
          const dx = px + 0.5 - x,
            dy = py + 0.5 - y;
          // GPU quads exclude their right/bottom edge. An extra CPU edge pixel can
          // propagate through every later Smudge pickup, rather than staying local.
          if (sin === 0 && Math.abs(cos) === 1 && (dx >= rx || dy >= ry)) continue;
          const u = ((cos * dx + sin * dy) / rx) * s[offset + 6]! * 0.5 + 0.5,
            w = ((-sin * dx + cos * dy) / ry) * s[offset + 7]! * 0.5 + 0.5;
          if (u < 0 || u > 1 || w < 0 || w > 1) continue;
          // Full square tips expose the GPU's half-open right/bottom raster edges.
          if (isBlockEraser(v.tool) && (u >= 1 || w >= 1)) continue;
          coverage = sampleTip(tip, u, w);
        }
        const i = py * width + px;
        if (input.stampRole === 'secondary') {
          // The current secondary transform is affine. Photoshop's perspective
          // replacement callback is a different dispatch, not this write policy.
          const accumulated = accumulateAffineSecondary(Math.round(coverage * 255), Math.round(flow[i]! * 255)) / 255;
          flow[i] = accumulated;
          opacity[i] = accumulated;
          rawOpacity[i] = accumulated > 0 ? 1 : 0;
          for (let c = 0; c < 3; c++) paint[i * 3 + c] = s[offset + 12 + c]! * accumulated;
          continue;
        }
        if (v.useTexture && v.texture.eachTip && pattern && toneTable)
          coverage = textured(coverage, pattern[i]!, s[offset + 10]!, input, toneTable);
        if (v.useNoise) {
          const n = Math.sin(Math.floor(px) * 12.9898 + Math.floor(py) * 78.233 + s[offset + 11]!) * 43758.5453;
          coverage *= 0.35 + 0.65 * (n - Math.floor(n));
        }
        if (usesPencilCoverage(v.tool)) coverage = pencilCoverage(coverage);
        if (byteSource) {
          byteSource[i] = Math.max(0, Math.min(255, Math.round(coverage * 255)));
          continue;
        }
        const alpha = coverage * s[offset + 8]!;
        for (let c = 0; c < 3; c++) paint[i * 3 + c] = s[offset + 12 + c]! * alpha + paint[i * 3 + c]! * (1 - alpha);
        flow[i] = alpha + flow[i]! * (1 - alpha);
        opacity[i] = Math.max(opacity[i]!, coverage * s[offset + 9]!);
        if (coverage > 0) rawOpacity[i] = Math.max(rawOpacity[i]!, s[offset + 9]!);
      }
    if (byteMask && byteSource && rounding) for (const region of regions) {
      const address = maskRasterAddresses(region, width, rounding.period);
      const source = new Uint8Array(address.stride * region.height);
      for (let row = 0; row < region.height; row++) {
        const start = (region.y + row) * width + region.x;
        source.set(byteSource.subarray(start, start + region.width), row * address.stride);
      }
      if (channels && ratio) {
        const channel = (c: number) => ({ bytes: channels[c]!, offset: region.y * width + region.x,
          stride: width, address: address.colorAddresses[c]! });
        accumulateColorPaintbrush({
          source: { bytes: source, offset: 0, stride: address.stride, address: address.sourceAddress },
          alpha: { bytes: byteMask, offset: region.y * width + region.x, stride: width, address: address.destinationAddress },
          ratio: { bytes: ratio, offset: region.y * width + region.x, stride: width, address: address.scaledSourceAddress },
          channels: [channel(0), channel(1), channel(2)],
          color: maskRasterColorBytes(region.color),
          row: region.y, column: region.x, width: region.width, height: region.height,
          flow: region.flow, opacity: region.opacity, rounding
        });
      } else accumulatePaintbrushMask({
        source: { bytes: source, offset: 0, stride: address.stride, address: address.sourceAddress },
        destination: { bytes: byteMask, offset: region.y * width + region.x, stride: width, address: address.destinationAddress },
        scaledSourceAddress: address.scaledSourceAddress,
        row: region.y, column: region.x, width: region.width, height: region.height,
        flow: region.flow, opacity: region.opacity, rounding
      });
      for (let row = region.y; row < region.y + region.height; row++)
        for (let x = region.x; x < region.x + region.width; x++) {
          const i = row * width + x;
          flow[i] = byteMask[i]! / 255;
          if (!channels) for (let c = 0; c < 3; c++) paint[i * 3 + c] = region.color[c]! * flow[i]!;
        }
    }
  }
  return { flow, opacity, paint, dual, rawOpacity, toneTable, pattern, maskAccumulation, channels };
}
/** Pattern filtering is completed before the per-tip depth operation. */
function textured(coverage: number, byte: number, depth: number, input: PreviewInput, toneTable: Float32Array) {
  return textureCoverage(coverage, toneTable[byte]!, blendModeId(input.values.texture.mode), depth);
}

/** One table per render, shared by every retouch stamp; settings remain fixed during that render. */
function createTextureToneTable(texture: PreviewInput['values']['texture']) {
  return Float32Array.from({ length: 256 }, (_, byte) =>
    textureTone(byte / 255, texture.invert ? 1 : 0, texture.brightness, texture.contrast)
  );
}
/** Fallback sampling for generated tips without sampled-tip placement metadata. */
function sampleTip(tip: BrushTipImage, u: number, v: number) {
  const x = u * tip.width - 0.5,
    y = v * tip.height - 0.5,
    x0 = Math.floor(x),
    y0 = Math.floor(y);
  const read = (px: number, py: number) =>
    tip.data[
      Math.max(0, Math.min(tip.height - 1, py)) * tip.width +
        Math.max(0, Math.min(tip.width - 1, px))
    ]! / 255;
  const fx = x - x0,
    fy = y - y0;
  return (
    (read(x0, y0) * (1 - fx) + read(x0 + 1, y0) * fx) * (1 - fy) +
    (read(x0, y0 + 1) * (1 - fx) + read(x0 + 1, y0 + 1) * fx) * fy
  );
}
