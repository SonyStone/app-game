import type { BrushResource } from '@app-game/abr-paint/resources';
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import type { Result } from 'neverthrow';
import { createEffect, createSignal, onCleanup } from 'solid-js';
import type { BrushPreset } from '../../features/brush-library';

/**
 * A brush preset's sample stroke: an S-curve across the whole width, stamped dab by dab with the preset's spacing,
 * flow and opacity. Round brushes use their hardness and taper with pressure; presets with tip images (ABR and
 * textured brushes) stamp their primary tip, read through `resources` when the sample first scrolls into view. Sizes
 * map to the strip's height geometrically, keeping the presets' relative sizes. Sizes itself to its box's CSS width
 * and `height`.
 */
export function PresetStroke(props: {
  preset: BrushPreset;
  /** Reads the preset's tip images; see `BrushLibrary.resources`. */
  resources: (preset: BrushPreset) => Promise<Result<BrushResource[], unknown>>;
  color: string;
  /** CSS height in pixels. */
  height: number;
}) {
  let canvas!: HTMLCanvasElement;
  const [visible, setVisible] = createSignal(false);
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      setVisible(true);
      observer.disconnect();
    }
  });
  onCleanup(() => observer.disconnect());

  createEffect(
    () => (visible() ? { preset: props.preset, color: props.color, height: props.height } : undefined),
    (sample) => {
      if (!sample) {
        return;
      }

      let current = true;
      const frame = requestAnimationFrame(() => {
        void tipOf(sample.preset, props.resources).then((tip) => {
          if (current) {
            paint(canvas, sample.preset, tip, sample.color, sample.height);
          }
        });
      });
      return () => {
        current = false;
        cancelAnimationFrame(frame);
      };
    }
  );

  return (
    <canvas
      ref={(element) => {
        canvas = element;
        observer.observe(element);
      }}
      style={{ display: 'block', width: '100%', height: `${props.height}px` }}
      aria-hidden="true"
    />
  );
}

/** The primary tip of a preset with images, as a small white coverage mask; none for round brushes. */
function tipOf(preset: BrushPreset, resources: Parameters<typeof PresetStroke>[0]['resources']) {
  const id = preset.resourceIds[0];
  if (!id) {
    return Promise.resolve(undefined);
  }

  let tip = tips.get(id);
  if (!tip) {
    tip = resources(preset).then((result) => {
      const resource = result.isOk() ? result.value.find((candidate) => candidate.id === id) : undefined;
      return resource && maskOf(resource);
    });
    tips.set(id, tip);
    // Keep the cache small: forget the oldest tips first.
    if (tips.size > tipLimit) {
      tips.delete(tips.keys().next().value!);
    }
  }

  return tip;
}

/** Tip masks by resource id, oldest first. */
const tips = new Map<string, Promise<HTMLCanvasElement | undefined>>();
const tipLimit = 96;

/** Box-filters a coverage image down to at most `maskSize` pixels on its longer side, as white with that alpha. */
function maskOf(resource: BrushResource) {
  const scale = Math.min(1, maskSize / Math.max(resource.width, resource.height));
  const width = Math.max(1, Math.round(resource.width * scale));
  const height = Math.max(1, Math.round(resource.height * scale));
  const sums = new Float64Array(width * height);
  const counts = new Uint32Array(width * height);
  for (let y = 0; y < resource.height; y++) {
    const row = Math.min(height - 1, Math.floor(y * scale)) * width;
    for (let x = 0; x < resource.width; x++) {
      const at = row + Math.min(width - 1, Math.floor(x * scale));
      sums[at]! += resource.pixels[y * resource.width + x]!;
      counts[at]! += 1;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(width, height);
  for (let at = 0; at < sums.length; at++) {
    image.data.set([255, 255, 255, counts[at] ? sums[at]! / counts[at]! : 0], at * 4);
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

/** The longest side of a tip mask, in pixels: enough for the strip's height at a device pixel ratio of 2. */
const maskSize = 64;

/** Paints the sample stroke of `preset` into `canvas`, stamping `tip` when given and round dabs otherwise. */
function paint(
  canvas: HTMLCanvasElement,
  preset: BrushPreset,
  tip: HTMLCanvasElement | undefined,
  color: string,
  height: number
) {
  const ratio = Math.min(2, devicePixelRatio || 1);
  const width = Math.max(40, canvas.clientWidth || 160);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d')!;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);

  const brush: Brush = { ...defaultBrush(), ...preset.settings };
  const erase = brush.tool === 'eraser' || erasesInAbr(brush);
  // Sizes map to the strip's height geometrically, so that a 3 px liner and a 300 px airbrush both read.
  const thickness = Math.min(height * 0.7, 1.2 + Math.log2(1 + brush.size) * height * 0.08);
  const round = !tip;
  const taper = round && brush.pressureSize;

  // Dabs build up on their own layer, which then shows at the stroke's opacity, as a stroke does.
  const layer = document.createElement('canvas');
  layer.width = canvas.width;
  layer.height = canvas.height;
  const stroke = layer.getContext('2d')!;
  stroke.scale(ratio, ratio);
  stroke.globalAlpha = Math.max(0.05, Math.min(1, brush.flow * (round ? 1 : 1.4)));
  const dab = tip ? tinted(tip, erase ? '#ffffff' : color) : roundDab(brush.hardness);

  const margin = thickness / 2 + 6;
  const step = Math.max(0.6, thickness * Math.max(0.02, Math.min(2, brush.spacing)));
  const point = (t: number) => ({
    x: margin + (width - margin * 2) * t,
    y: height / 2 + Math.sin(t * Math.PI * 2) * (height / 2 - margin) * 0.55
  });
  let previous = point(0);
  let travelled = step;
  for (let sample = 1; sample <= 400; sample++) {
    const t = sample / 400;
    const next = point(t);
    travelled += Math.hypot(next.x - previous.x, next.y - previous.y);
    previous = next;
    if (travelled < step) {
      continue;
    }

    travelled = 0;
    const pressure = taper ? Math.sin(Math.PI * Math.min(0.97, 0.06 + t * 0.94)) : 1;
    const size = Math.max(0.8, thickness * pressure);
    if (round) {
      stroke.save();
      stroke.translate(next.x, next.y);
      stroke.scale(size / 2, size / 2);
      stroke.fillStyle = dab as CanvasGradient;
      stroke.beginPath();
      stroke.arc(0, 0, 1, 0, Math.PI * 2);
      stroke.fill();
      stroke.restore();
    } else {
      const mask = dab as HTMLCanvasElement;
      const aspect = mask.width / mask.height;
      const w = aspect >= 1 ? size : size * aspect;
      const h = aspect >= 1 ? size / aspect : size;
      stroke.drawImage(mask, next.x - w / 2, next.y - h / 2, w, h);
    }
  }

  context.globalAlpha = erase ? 0.45 : Math.max(0.1, brush.opacity);
  context.drawImage(layer, 0, 0, width, height);
  if (erase) {
    // An eraser's sample shows the cut it makes: a dashed outline along the band it clears.
    context.globalAlpha = 0.8;
    context.setLineDash([4, 4]);
    context.lineWidth = 1;
    context.strokeStyle = '#d0d0d0';
    context.strokeRect(margin, height / 2 - thickness / 2, width - margin * 2, thickness);
  }

  /** A unit round dab in the stroke color, solid up to `hardness` of its radius and fading to the edge. */
  function roundDab(hardness: number) {
    const gradient = stroke.createRadialGradient(0, 0, 0, 0, 0, 1);
    const solid = erase ? '#ffffff' : color;
    gradient.addColorStop(0, solid);
    gradient.addColorStop(Math.min(0.98, Math.max(0, hardness)), solid);
    gradient.addColorStop(1, transparent(solid));
    return gradient;
  }
}

/** A tip mask in `color`. */
function tinted(mask: HTMLCanvasElement, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = mask.width;
  canvas.height = mask.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(mask, 0, 0);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/** `#rrggbb` with zero alpha, so that gradients fade without darkening. */
function transparent(hex: string) {
  return `${hex.slice(0, 7)}00`;
}

/** Whether an ABR preset is Photoshop's Eraser tool. */
function erasesInAbr(brush: Brush) {
  const settings = brush.engine?.settings as { values?: { tool?: { type?: unknown } } } | undefined;
  return brush.engine?.id === 'abr' && settings?.values?.tool?.type === 'ErTl';
}
