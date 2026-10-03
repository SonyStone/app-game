import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { createBrushResources } from '@app-game/abr-paint/resources';
import { defaultBrush, TILE_SIZE, type Sample } from '@app-game/paint-core/brush';
import { abrBrush } from '@app-game/paint-core/composition/abrBrushEngine';
import { createResourceSession } from '@app-game/paint-core/composition/resourceSession';
import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { createRawProcessor } from '@app-game/paint-core/strokeProcessors';
import { packTile, unpackTile } from '@app-game/paint-core/tilePixels';
import { library } from './megapackSweep';

/**
 * Measures what adaptive quality costs in appearance at the zoom a stroke is drawn at. Each preset draws the same pen
 * stroke three times: exactly (adaptive quality off), exactly with another random seed, and with adaptive quality at
 * `lod`. All three are composited over white, reduced to the view's pixels (a box filter of 2^lod) and lightly
 * blurred; then the adaptive stroke and the reseeded exact stroke are each compared with the first exact one. The
 * reseeded comparison is the preset's own stroke-to-stroke variation, the floor below which a difference cannot be
 * seen.
 *
 * Painting tools draw in black on white. Erasers and retouch tools (Smudge, Mixer, Blur, Sharpen) work on colored
 * stripes, so what they remove or move is visible.
 *
 * The library is the one megapackSweep parsed for this page. Rendering uses isolated documents and never opens saved
 * artwork.
 */
export async function measureLodQuality(
  fixture: Blob | undefined,
  options: {
    presets: number[];
    lods: number[];
    /** Also return both strokes at view resolution as base64 RGB bytes, for visual inspection. */
    images?: boolean;
    /**
     * Also return SHA-256 digests of both strokes at full resolution, so two builds can be compared byte for byte:
     * an optimization that must not change pixels keeps every digest.
     */
    hashes?: boolean;
  }
): Promise<LodQualityRow[]> {
  const brushes = await library(fixture);
  const rows: LodQualityRow[] = [];
  const errors: string[] = [];
  const renderer = await createPaintRenderer(new OffscreenCanvas(256, 256), (message) => errors.push(message), {
    cacheTiles: 96
  });
  try {
    for (const index of options.presets) {
      const asset = brushes[index];
      if (!asset) {
        continue;
      }

      for (const lod of options.lods) {
        try {
          const prepared = prepareAbrBrush(asset);
          const tool = prepared.engine.settings.values.tool.type;
          const striped = tool !== 'PbTl' && tool !== 'PcTl';
          const exact = await renderStroke(renderer, prepared, striped, { seed: 12345 });
          const reseeded = await renderStroke(renderer, prepared, striped, { seed: 777 });
          const adaptive = await renderStroke(renderer, prepared, striped, { seed: 12345, lod });
          if (errors.length) {
            throw new Error(errors.splice(0).join('\n'));
          }

          const base = viewImage(basePixels(striped), lod);
          const reference = viewImage(exact.pixels, lod);
          const candidate = viewImage(adaptive.pixels, lod);
          rows.push({
            index,
            name: asset.name,
            lod,
            tool,
            size: prepared.size,
            adaptive: compare(base, reference, candidate),
            reseeded: compare(base, reference, viewImage(reseeded.pixels, lod)),
            exactMs: exact.ms,
            adaptiveMs: adaptive.ms,
            ...(options.hashes
              ? { hashes: { exact: await digest(exact.pixels), adaptive: await digest(adaptive.pixels) } }
              : {}),
            ...(options.images
              ? {
                  images: {
                    width: region.width / 2 ** lod,
                    exact: imageBytes(reference),
                    adaptive: imageBytes(candidate)
                  }
                }
              : {})
          });
        } catch (error) {
          errors.length = 0;
          renderer.reset();
          rows.push({ index, name: asset.name, lod, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
  } finally {
    renderer.destroy();
  }

  return rows;
}

/** One preset at one LOD. Differences are in levels of 0-255 at view resolution. */
export type LodQualityRow = {
  index: number;
  name: string;
  lod: number;
  tool?: string;
  size?: number;
  /** Adaptive stroke against the exact stroke. */
  adaptive?: Difference;
  /** Exact stroke with another seed against the exact stroke: the preset's own variation. */
  reseeded?: Difference;
  exactMs?: number;
  adaptiveMs?: number;
  /** View-resolution RGB of both strokes, three bytes per pixel, base64. */
  images?: { width: number; exact: string; adaptive: string };
  /** SHA-256 of both strokes' full-resolution RGBA, hex. */
  hashes?: { exact: string; adaptive: string };
  error?: string;
};

type Difference = ReturnType<typeof compare>;

/** Document region covered by the test stroke. */
const region = { width: 2048, height: 768 };

type Renderer = Awaited<ReturnType<typeof createPaintRenderer>>;

/** Strokes drawn so far on this page. */
let strokes = 0;

/** Draws the test stroke on the base layer and returns the region's RGBA pixels. Without `lod` the stroke is exact. */
async function renderStroke(
  renderer: Renderer,
  prepared: ReturnType<typeof prepareAbrBrush>,
  striped: boolean,
  options: { seed: number; lod?: number }
) {
  renderer.reset();
  const document = createDocument();
  const columns = region.width / TILE_SIZE;
  const lines = region.height / TILE_SIZE;
  const base = baseTile(striped);
  for (let ty = -1; ty <= lines; ty++) {
    for (let tx = -1; tx <= columns; tx++) {
      document.active.tiles.set(`${tx},${ty}`, base);
    }
  }

  const resources = createBrushResources();
  for (const resource of prepared.resources) {
    resources.put(resource);
  }

  try {
    const zoom = 2 ** -(options.lod ?? 0);
    const stroke = createResourceSession(resources, (resources) =>
      abrBrush.engine({
        resources,
        renderer,
        layer: document.active,
        layers: document.layers,
        processor: createRawProcessor(),
        adaptiveQuality: options.lod !== undefined,
        lod: options.lod ?? 0,
        view: { zoom, angle: 0, mirrored: false },
        brush: {
          ...defaultBrush(),
          size: prepared.size,
          spacing: prepared.spacing,
          // A Mixer preset keeps its depleted reservoir between strokes; a new color loads fresh paint.
          color: strokes++ % 2 ? '#000001' : '#000000',
          flow: prepared.flow ?? 1,
          opacity: prepared.opacity ?? 1,
          mixing: 'linear'
        },
        settings: { ...prepared.engine.settings, seed: options.seed }
      })
    );
    const samples = strokeSamples();
    const started = performance.now();
    for (let offset = 0; offset < samples.length; offset += 16) {
      await stroke.add(samples.slice(offset, offset + 16));
    }

    document.commit(await stroke.finish());
    await renderer.submitted();
    const ms = performance.now() - started;
    const pixels = new Uint8Array(region.width * region.height * 4);
    for (let ty = 0; ty < lines; ty++) {
      for (let tx = 0; tx < columns; tx++) {
        const tile = unpackTile(document.active.tiles.get(`${tx},${ty}`)!);
        for (let y = 0; y < TILE_SIZE; y++) {
          pixels.set(
            tile.subarray(y * TILE_SIZE * 4, (y + 1) * TILE_SIZE * 4),
            ((ty * TILE_SIZE + y) * region.width + tx * TILE_SIZE) * 4
          );
        }
      }
    }

    return { pixels, ms };
  } finally {
    resources.dispose();
  }
}

/** SHA-256 of `pixels` as hex. */
async function digest(pixels: Uint8Array<ArrayBuffer>) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', pixels));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Stripe colors of the retouch base; the pattern repeats every tile, so one tile serves the whole layer. */
const stripes = [
  [192, 57, 43],
  [241, 196, 15],
  [46, 134, 193],
  [255, 255, 255]
] as const;

const baseTiles = new Map<boolean, Uint8Array>();

/** An opaque tile: white for painting tools, 64 px vertical color stripes for erasers and retouch tools. */
function baseTile(striped: boolean) {
  let tile = baseTiles.get(striped);
  if (!tile) {
    const pixels = new Uint8Array(TILE_SIZE * TILE_SIZE * 4).fill(255);
    if (striped) {
      for (let y = 0; y < TILE_SIZE; y++) {
        for (let x = 0; x < TILE_SIZE; x++) {
          pixels.set(stripes[Math.floor(x / 64) % stripes.length]!, (y * TILE_SIZE + x) * 4);
        }
      }
    }

    tile = packTile(pixels);
    baseTiles.set(striped, tile);
  }

  return tile;
}

/** The untouched region, for telling which pixels a stroke changed. */
function basePixels(striped: boolean) {
  const tile = unpackTile(baseTile(striped));
  const pixels = new Uint8Array(region.width * region.height * 4);
  for (let y = 0; y < region.height; y++) {
    for (let tx = 0; tx < region.width / TILE_SIZE; tx++) {
      const row = (y % TILE_SIZE) * TILE_SIZE * 4;
      pixels.set(tile.subarray(row, row + TILE_SIZE * 4), (y * region.width + tx * TILE_SIZE) * 4);
    }
  }

  return pixels;
}

/** A pen stroke across the region at about 1500 px/s: a sine wave with slowly varying pressure and tilt. */
function strokeSamples(): Sample[] {
  return Array.from({ length: 290 }, (_, index) => {
    const x = 160 + index * 6;
    return {
      x,
      y: region.height / 2 + Math.sin(index / 28) * 170,
      pressure: 0.7 + 0.3 * Math.sin(index / 45),
      tiltX: 25 + 10 * Math.sin(index / 60),
      tiltY: 15 * Math.cos(index / 50),
      pointerType: 'pen',
      time: index * 4
    };
  });
}

/**
 * The region as the view shows it: premultiplied pixels over white, reduced by a 2^lod box filter and blurred by a
 * 3×3 box. Returns interleaved RGB.
 */
function viewImage(pixels: Uint8Array, lod: number) {
  const factor = 2 ** lod;
  const width = region.width / factor;
  const height = region.height / factor;
  const reduced = new Float32Array(width * height * 3);
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const at = (y * region.width + x) * 4;
      const to = (Math.floor(y / factor) * width + Math.floor(x / factor)) * 3;
      const paper = 255 - pixels[at + 3]!;
      reduced[to]! += pixels[at]! + paper;
      reduced[to + 1]! += pixels[at + 1]! + paper;
      reduced[to + 2]! += pixels[at + 2]! + paper;
    }
  }

  const blurred = new Float32Array(reduced.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const sx = x + dx;
            const sy = y + dy;
            if (sx >= 0 && sy >= 0 && sx < width && sy < height) {
              sum += reduced[(sy * width + sx) * 3 + channel]!;
              count++;
            }
          }
        }

        blurred[(y * width + x) * 3 + channel] = sum / count / (factor * factor);
      }
    }
  }

  return blurred;
}

function imageBytes(values: Float32Array) {
  let binary = '';
  for (let offset = 0; offset < values.length; offset += 0x8000) {
    binary += String.fromCharCode(
      ...Uint8Array.from(values.subarray(offset, offset + 0x8000), (value) => Math.round(value))
    );
  }

  return btoa(binary);
}

/** Compares two strokes over the pixels where either changed the base by more than one level. */
function compare(base: Float32Array, reference: Float32Array, candidate: Float32Array) {
  let referenceChange = 0;
  let candidateChange = 0;
  let difference = 0;
  let touched = 0;
  for (let index = 0; index < base.length; index += 3) {
    let a = 0;
    let b = 0;
    let between = 0;
    for (let channel = 0; channel < 3; channel++) {
      a += Math.abs(reference[index + channel]! - base[index + channel]!) / 3;
      b += Math.abs(candidate[index + channel]! - base[index + channel]!) / 3;
      between += Math.abs(candidate[index + channel]! - reference[index + channel]!) / 3;
    }

    referenceChange += a;
    candidateChange += b;
    if (a > 1 || b > 1) {
      difference += between;
      touched++;
    }
  }

  return {
    /** How much the candidate changed the base relative to the reference; 1 is the same amount of paint moved. */
    ink: referenceChange > 0 ? candidateChange / referenceChange : candidateChange > 0 ? Infinity : 1,
    /** Mean absolute difference between the strokes where either changed the base. */
    difference: touched ? difference / touched : 0,
    /** Mean change of the base by the reference stroke over those pixels; tiny values make `ink` meaningless. */
    strength: touched ? referenceChange / touched : 0
  };
}
