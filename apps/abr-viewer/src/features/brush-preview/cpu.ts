import type { BrushTipImage } from '../../lib/abr';
import { blendModeId, dualCoverage, textureCoverage, textureTone } from './effects';
import { renderResourcePixels } from './resource-pixels';
import type { PreviewResources } from './resources';
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
  stroke ??= createPreviewStroke(input, tip);
  const layers = renderLayers(input, tip, stroke, resources);
  const background = previewColor(input.background),
    pixels = new Uint8ClampedArray(input.width * input.height * 4);
  const { flow, opacity, paint } = layers;
  for (let i = 0; i < flow.length; i++) {
    let alpha = Math.min(flow[i]!, opacity[i]!);
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
    for (let c = 0; c < 3; c++)
      pixels[i * 4 + c] =
        255 * (background[c]! * (1 - alpha) + (paint[i * 3 + c]! / Math.max(0.00001, flow[i]!)) * alpha);
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

function renderLayers(input: PreviewInput, tip: BrushTipImage, stroke: PreviewStroke, resources: PreviewResources) {
  const { width, height } = input,
    v = input.values;
  const flow = new Float32Array(width * height),
    opacity = new Float32Array(width * height),
    paint = new Float32Array(width * height * 3);
  const dualInput = dualPreviewInput(input);
  const dual =
    v.useDualBrush && resources.dualTip
      ? renderLayers(dualInput, resources.dualTip, createPreviewStroke(dualInput, resources.dualTip), {}).flow
      : undefined;
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
        const u = ((cos * dx + sin * dy) / rx) * s[offset + 6]! * 0.5 + 0.5,
          w = ((-sin * dx + cos * dy) / ry) * s[offset + 7]! * 0.5 + 0.5;
        if (u < 0 || u > 1 || w < 0 || w > 1) continue;
        let coverage = sampleTip(tip, u, w);
        const i = py * width + px;
        if (v.useTexture && v.texture.eachTip && resources.pattern)
          coverage = textured(coverage, resources.pattern, px + 0.5, py + 0.5, s[offset + 10]!, input);
        if (dual) coverage = dualCoverage(coverage, dual[i]!, blendModeId(v.dualBrush.mode));
        if (v.useNoise) {
          const n = Math.sin(Math.floor(px) * 12.9898 + Math.floor(py) * 78.233 + s[offset + 11]!) * 43758.5453;
          coverage *= 0.35 + 0.65 * (n - Math.floor(n));
        }
        const alpha = coverage * s[offset + 8]!;
        for (let c = 0; c < 3; c++) paint[i * 3 + c] = s[offset + 12 + c]! * alpha + paint[i * 3 + c]! * (1 - alpha);
        flow[i] = alpha + flow[i]! * (1 - alpha);
        opacity[i] = Math.max(opacity[i]!, coverage * s[offset + 9]!);
      }
  }
  return { flow, opacity, paint };
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
