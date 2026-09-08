import { blockEraserTip, blockEraserValues, isBlockEraser } from '@app-game/abr-brush/blockEraser';
import { linearSourceOver } from '@app-game/abr-brush/effects';
import { paintBlend, paintModes } from '@app-game/abr-brush/paintBlend';
import { pencilCoverage, usesPencilCoverage } from '@app-game/abr-brush/pencil';
import { d } from 'typegpu';
import type { BrushTipImage } from '../../lib/abr';
import { blendModeId, dualCoverage, grain, textureCoverage, textureTone } from './effects';
import { eraserPreviewColor } from './eraser';
import { renderResourcePixels } from './resource-pixels';
import type { PreviewResources } from './resources';
import { isRetouch, renderRetouchPixels } from './retouch';
import {
  createPreviewStroke,
  dualPreviewInput,
  previewColor,
  stampStride,
  type PreviewInput,
  type PreviewStroke
} from './stroke';

/** CPU reference and fallback, using the same stamps, resources and blend rules as TypeGPU. */
export function renderPreviewPixels(
  input: PreviewInput,
  tip: BrushTipImage,
  stroke: PreviewStroke | undefined = undefined,
  resources: PreviewResources = {}
) {
  if (input.resourcePreview) return renderResourcePixels(input, tip, resources);
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
      return (i) => layerCoverage(layers, input, resources, i);
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
    let alpha = layerCoverage(layers, input, resources, i);
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
    const source = d.vec3f(
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
  resources: PreviewResources,
  i: number
) {
  const { flow, opacity, hardMix, rawOpacity } = layers;
  let alpha = hardMix
    ? dualCoverage(flow[i]!, hardMix[i]!, 7)
    : usesPencilCoverage(input.values.tool)
      ? flow[i]!
      : Math.min(flow[i]!, opacity[i]!);
  if (input.values.useTexture && !input.values.texture.eachTip && resources.pattern)
    alpha = textured(
      alpha,
      resources.pattern,
      i % input.width,
      Math.floor(i / input.width),
      input.values.texture.depth / 100,
      input
    );
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
  if (hardMix) alpha = Math.min(alpha, rawOpacity[i]!);
  return alpha;
}

function renderLayers(
  input: PreviewInput,
  tip: BrushTipImage,
  stroke: PreviewStroke,
  resources: PreviewResources,
  scratch?: { flow: Float32Array; opacity: Float32Array; rawOpacity: Float32Array; paint: Float32Array },
  cachedDual?: Float32Array
): {
  flow: Float32Array;
  opacity: Float32Array;
  paint: Float32Array;
  rawOpacity: Float32Array;
  hardMix: Float32Array | undefined;
} {
  const { width, height } = input,
    v = input.values;
  const flow = scratch?.flow.fill(0) ?? new Float32Array(width * height),
    opacity = scratch?.opacity.fill(0) ?? new Float32Array(width * height),
    rawOpacity = scratch?.rawOpacity.fill(0) ?? new Float32Array(width * height),
    paint = scratch?.paint.fill(0) ?? new Float32Array(width * height * 3);
  const dualInput = dualPreviewInput(input);
  const dual: Float32Array | undefined =
    cachedDual ??
    (v.useDualBrush && resources.dualTip
      ? renderLayers(dualInput, resources.dualTip, createPreviewStroke(dualInput, resources.dualTip), {}).flow
      : undefined);
  // Hard Mix thresholds accumulated Flow, matching Paint's tiled compositor.
  // Applying Flow after this threshold turns pressure into gray opacity instead.
  const hardMix = v.dualBrush.mode === 'hardMix' ? dual : undefined;
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
    for (let py = Math.max(0, Math.floor(y - ey)); py < Math.min(height, Math.ceil(y + ey)); py++)
      for (let px = Math.max(0, Math.floor(x - ex)); px < Math.min(width, Math.ceil(x + ex)); px++) {
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
        let coverage = sampleTip(tip, u, w);
        const i = py * width + px;
        if (v.useTexture && v.texture.eachTip && resources.pattern)
          coverage = textured(coverage, resources.pattern, px + 0.5, py + 0.5, s[offset + 10]!, input);
        if (dual && !hardMix) coverage = dualCoverage(coverage, dual[i]!, blendModeId(v.dualBrush.mode));
        if (v.useNoise) {
          const n = Math.sin(Math.floor(px) * 12.9898 + Math.floor(py) * 78.233 + s[offset + 11]!) * 43758.5453;
          coverage *= 0.35 + 0.65 * (n - Math.floor(n));
        }
        if (usesPencilCoverage(v.tool)) coverage = pencilCoverage(coverage);
        const alpha = coverage * s[offset + 8]!;
        for (let c = 0; c < 3; c++) paint[i * 3 + c] = s[offset + 12 + c]! * alpha + paint[i * 3 + c]! * (1 - alpha);
        flow[i] = alpha + flow[i]! * (1 - alpha);
        opacity[i] = Math.max(opacity[i]!, coverage * s[offset + 9]!);
        if (coverage > 0) rawOpacity[i] = Math.max(rawOpacity[i]!, s[offset + 9]!);
      }
  }
  return { flow, opacity, paint, hardMix, rawOpacity };
}
function textured(coverage: number, pattern: BrushTipImage, x: number, y: number, depth: number, input: PreviewInput) {
  const v = input.values.texture,
    scale = (v.scale / 100) * input.dpr;
  const u = x / (pattern.width * scale),
    w = y / (pattern.height * scale);
  const sample = sampleTip(pattern, u - Math.floor(u), w - Math.floor(w), true);
  const tone = textureTone(sample, v.invert ? 1 : 0, v.brightness, v.contrast);
  return textureCoverage(coverage, tone, blendModeId(v.mode), depth);
}
/** Matches normalized GPU linear sampling; patterns repeat at tile boundaries. */
function sampleTip(tip: BrushTipImage, u: number, v: number, repeat = false) {
  const x = u * tip.width - 0.5,
    y = v * tip.height - 0.5,
    x0 = Math.floor(x),
    y0 = Math.floor(y);
  const read = (px: number, py: number) =>
    tip.data[
      (repeat ? ((py % tip.height) + tip.height) % tip.height : Math.max(0, Math.min(tip.height - 1, py))) * tip.width +
        (repeat ? ((px % tip.width) + tip.width) % tip.width : Math.max(0, Math.min(tip.width - 1, px)))
    ]! / 255;
  const fx = x - x0,
    fy = y - y0;
  return (
    (read(x0, y0) * (1 - fx) + read(x0 + 1, y0) * fx) * (1 - fy) +
    (read(x0, y0 + 1) * (1 - fx) + read(x0 + 1, y0 + 1) * fx) * fy
  );
}
