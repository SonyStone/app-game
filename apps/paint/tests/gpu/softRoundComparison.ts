import { createBrushResources } from '@app-game/abr-paint/resources';
import { initAbr } from '@app-game/abr-parser';
import { createStrokeSampler, TILE_SIZE, type Brush, type Dab, type Sample } from '@app-game/paint-core/brush';
import { defaultCamera } from '@app-game/paint-core/camera';
import { createResourceSession } from '@app-game/paint-core/composition/resourceSession';
import { studioBrushRecipe } from '@app-game/paint-core/composition/studioBrushRecipe';
import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { withPrediction } from '@app-game/paint-core/strokePrediction';
import { createStudioProcessor } from '@app-game/paint-core/strokeProcessors';
import { unpackTile } from '@app-game/paint-core/tilePixels';
import { softRoundCandidate } from '../fixtures/softRound';
import baseline from '../fixtures/softRoundCoverage.json';

type Variant = 'native' | 'ABR' | 'paint-round' | 'matched processor';

type Row = {
  label: string;
  size: number;
  points: Sample[];
  erase?: boolean;
  flow?: number;
  opacity?: number;
  passes?: number;
  centres?: 'stationary' | 'native';
  mode?: Brush['stroke']['mode'];
  prediction?: boolean;
};

const width = 128,
  height = 64;

/** Compares committed alpha and the visible production preview on the same small canvas. */
export async function compareSoftRound(report: (message: string) => void) {
  await initAbr();
  const canvas = new OffscreenCanvas(width, height);
  const errors: string[] = [];
  const renderer = await createPaintRenderer(canvas, (message) => errors.push(message), { cacheTiles: 2 });
  const cache = createBrushResources();
  const captured = new Set<string>();
  const loaded = new Set<string>();
  try {
    for (const row of referenceRows()) {
      const preset = softRoundCandidate(row.size, row.erase, row.flow);
      for (const resource of preset.resources) {
        if (!loaded.has(resource.id)) {
          cache.put(resource);
          loaded.add(resource.id);
        }
      }
      const native = new Map<string, { bytes: Uint8Array; empty: string }>();
      const variants: Variant[] = ['native', 'ABR', 'paint-round'];
      if (row.mode === 'studio') {
        variants.push('matched processor');
      }

      for (const variant of variants) {
        const abr = variant !== 'native';
        await compareCell(row, variant, preset, renderer, canvas, cache, async (label, bytes, count) => {
          captured.add(label);
          const metrics = await captureCell(label, bytes, row, abr, count, report);
          // Compare raw byte hashes, independent of the PNG encoder. Collect all changed cells in one run.
          const expected = (baseline as Record<string, string>)[label];
          const phase = label.endsWith(' displayed') ? 'displayed' : 'finished';
          if (variant === 'native') {
            native.set(phase, { bytes, empty: metrics.split(' ')[2]! });
          } else if (variant !== 'ABR' && !(variant === 'paint-round' && row.mode === 'studio')) {
            const reference = native.get(phase)!;
            const worst = bytes.reduce((max, v, i) => Math.max(max, Math.abs(v - reference.bytes[i]!)), 0);
            if (worst > 1 || metrics.split(' ')[2] !== reference.empty) {
              errors.push(label + ' differs from native, worst ' + worst);
            }
          }
          if (expected !== metrics) {
            errors.push(label + ': expected ' + expected + ', got ' + metrics);
          }
        });
      }
    }
    for (const label of Object.keys(baseline)) {
      if (!captured.has(label)) {
        errors.push('Missing coverage cell ' + label);
      }
    }
    if (errors.length) {
      throw new Error(errors.join('\n'));
    }
  } finally {
    renderer.destroy();
    cache.dispose();
  }
}

async function compareCell(
  row: Row,
  variant: Variant,
  preset: ReturnType<typeof softRoundCandidate>,
  renderer: Awaited<ReturnType<typeof createPaintRenderer>>,
  canvas: OffscreenCanvas,
  cache: ReturnType<typeof createBrushResources>,
  captureBytes: (label: string, bytes: Uint8Array<ArrayBuffer>, count: number) => Promise<void>
) {
  const abr = variant !== 'native';
  const analytic = variant === 'paint-round' || variant === 'matched processor';
  const engine: typeof preset.engine = analytic
    ? { ...preset.engine, settings: { ...preset.engine.settings, placement: 'paint-distance-v1', coverage: 'paint-round-v1' } }
    : preset.engine;
  const brush: Brush = { ...preset.brush, engine: abr ? engine : undefined, opacity: row.opacity ?? 1 };
  brush.stroke = { ...brush.stroke, mode: row.mode ?? 'studio' };
  const label = row.size + 'px ' + row.label + ' ' + variant;
  let count = 0;
  const capture = (phase: string, bytes: Uint8Array<ArrayBuffer>) => captureBytes(label + phase, bytes, count);
  let reference: Uint8Array | undefined;
  for (const action of row.mode ? ['finish', 'preview', 'cancel'] : ['finish']) {
    count = 0;
    renderer.reset();
    renderer.setLinearBlending(true);
    const document = createDocument();
    if (row.erase) {
      const patch = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
      for (let i = 3; i < patch.length; i += 4) {
        patch[i] = 255;
      }
      document.active.tiles.set('0,0', patch);
    }
    const display = async () => {
      await renderer.render(document.layers, { ...defaultCamera(), x: width / 2, y: height / 2 }, { width, height }, 1);
      await renderer.submitted();
      const ctx = new OffscreenCanvas(width, height).getContext('2d')!;
      ctx.drawImage(canvas, 0, 0);
      return ctx.getImageData(0, 0, width, height).data;
    };
    const blank = action !== 'finish' ? await display() : undefined;
    for (let pass = 0; pass < (row.passes ?? 1); pass++) {
      const last = row.points.at(-1)!;
      const predicted = [{ ...last, x: last.x + 8, time: last.time + 8 }];
      const processorBrush = variant === 'matched processor' ? { ...brush, engine: undefined } : brush;
      const processor = row.mode
        ? withPrediction(studioBrushRecipe.processors[studioBrushRecipe.selectProcessor(processorBrush)](brush, 1), () =>
            row.prediction ? predicted : []
          )
        : createStudioProcessor(brush);
      const engine = studioBrushRecipe.engines[abr ? 'abr' : 'round'];
      const session = createResourceSession(cache, (resources) =>
        engine({
          brush,
          settings: brush.engine?.settings,
          resources,
          layer: document.active,
          seed: 12345,
          processor,
          renderer: {
            ...renderer,
            begin(layer, activeBrush, tip, settings) {
              if (analytic && settings?.coverage !== 'paint-round-v1') {
                throw new Error(label + ' did not select analytic coverage');
              }
              renderer.begin(layer, activeBrush, tip, settings);
            },
            async paint(dabs) {
              const stamps = row.centres && dabs.length ? attributionDabs(row, brush, dabs[0]!) : dabs;
              count += stamps.length;
              return renderer.paint(stamps);
            }
          }
        })
      );
      await session.add(row.centres ? row.points.slice(0, 1) : row.points);
      const beforeFinish = count;
      if (blank) {
        session.preview(true);
        const visible = await display();
        session.preview(true);
        assertBytes(await display(), visible, label + ' second preview');
        if (action === 'cancel') {
          session.cancel();
          assertBytes(await display(), blank, label + ' cancelled display');
          if (document.active.tiles.size) {
            throw new Error(label + ' cancelled tiles');
          }
          break;
        }
        // Display is opaque. Measure the red-channel darkening relative to the blank view.
        const darkness = Uint8Array.from({ length: width * height }, (_, i) => blank[i * 4]! - visible[i * 4]!);
        await capture(' displayed', darkness);
      }
      document.commit(await session.finish());
      if (row.points.length === 1 && count !== beforeFinish) {
        throw new Error(label + ' tap gained a finish dab');
      }
    }
    if (action === 'cancel') {
      continue;
    }
    const tile = document.active.tiles.get('0,0');
    const bytes = tile ? unpackTile(tile) : new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
    if (reference) {
      assertBytes(bytes, reference, label + ' preview entered final tile');
    } else {
      reference = bytes.slice();
      await capture(
        '',
        Uint8Array.from(
          { length: width * height },
          (_, i) => bytes[(Math.floor(i / width) * TILE_SIZE + (i % width)) * 4 + 3]!
        )
      );
    }
  }
}

/** Reuses a real contact's transform and transfer at constant pressure, changing only its centre. */
function attributionDabs(row: Row, brush: Brush, stamp: Dab): Dab[] {
  const processor = createStudioProcessor(brush);
  const centres =
    row.centres === 'stationary'
      ? Array<Dab>(8).fill(stamp)
      : createStrokeSampler(brush).add([...processor.add(row.points), ...processor.finish()]);
  return centres.map(({ x, y }) => {
    if (!stamp.abr) {
      return { ...stamp, x, y };
    }
    const data = stamp.abr.data.slice();
    data.set([x, y]);
    return { ...stamp, x, y, abr: { ...stamp.abr, data } };
  });
}

function assertBytes(actual: ArrayLike<number>, expected: ArrayLike<number>, label: string) {
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(label + ' differs at byte ' + i);
    }
  }
}

async function captureCell(
  label: string,
  bytes: Uint8Array<ArrayBuffer>,
  row: Row,
  abr: boolean,
  count: number,
  report: (message: string) => void
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(width, height);
  const occupied = new Set<number>();
  let peak = 0,
    ink = 0;
  for (const [i, alpha] of bytes.entries()) {
    const coverage = row.erase ? 255 - alpha : alpha;
    image.data.set([coverage, coverage, coverage, 255], i * 4);
    ink += coverage;
    peak = Math.max(peak, coverage);
    if (coverage) {
      occupied.add(i % width);
    }
  }
  const columns = row.points.map((p) => Math.floor(p.x));
  let empty = 0;
  for (let x = Math.min(...columns); x <= Math.max(...columns); x++) {
    if (!occupied.has(x)) {
      empty++;
    }
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
  const metrics = [peak, ink, empty, hash].join(' ');
  ctx.putImageData(image, 0, 0);
  report(JSON.stringify({ label, size: row.size, abr, count, metrics, alpha: canvas.toDataURL() }));
  return metrics;
}

function* referenceRows(): Generator<Row> {
  for (const size of [32, 4]) {
    for (const offset of [0, 0.5, 0.25]) {
      yield { size, label: 'Tap ' + offset, points: [point(64 + offset, 32 + offset, 0.05)] };
    }
    yield { size, label: 'Full tap', points: [point(64, 32, 1)] };
    for (const pressure of [0.05, 0.25, 0.5, 1]) {
      for (const offset of [0, 0.5]) {
        yield { size, label: 'Line ' + pressure + ' y+' + offset, points: line(pressure, offset) };
      }
    }
    for (const shape of ['Ramp', 'Fast S']) {
      yield {
        size,
        label: shape,
        points: Array.from({ length: 17 }, (_, i) =>
          point(
            20 + (88 * i) / 16,
            32 + (shape === 'Fast S' ? 12 * Math.sin((i * Math.PI) / 8) : 0),
            1 - Math.abs(i / 8 - 1),
            i * (shape === 'Fast S' ? 2 : 8)
          )
        )
      };
    }
    yield { size, label: 'Native centres integer y', centres: 'native', points: line(0.05, 0) };
    yield { size, label: 'Native centres', centres: 'native', points: line(0.05, 0.5) };
    yield { size, label: 'Low flow contact', flow: 0.025, points: [point(64.5, 32.5, 0.05)] };
    yield { size, label: '8 low flow contacts', flow: 0.025, centres: 'stationary', points: [point(64.5, 32.5, 0.05)] };
    yield { size, label: '8 contacts', centres: 'stationary', points: [point(64.5, 32.5, 0.05)] };
  }
  for (const flow of [1, 0.35]) {
    yield { size: 32, label: 'Erase ' + flow, erase: true, flow, points: line(1, 0) };
    for (const opacity of [1, 0.35]) {
      yield { size: 4, label: 'Flow ' + flow + ' opacity ' + opacity, flow, opacity, points: line(1, 0) };
    }
  }
  yield { size: 4, label: 'Two passes', passes: 2, points: line(1, 0) };
  for (const mode of ['studio', 'none', 'stabilizer'] as const) {
    for (const prediction of [false, true]) {
      for (const tap of [false, true]) {
        yield {
          size: 4,
          label: mode + ' predict ' + prediction + (tap ? ' tap' : ' corner'),
          mode,
          prediction,
          points: tap ? [point(40, 20, 1)] : [point(30, 20, 0.25), point(55, 20, 0.5, 8), point(55, 42, 1, 16)]
        };
      }
    }
  }
}

function point(x: number, y: number, pressure: number, time = 0): Sample {
  return { x, y, pressure, time, pointerType: 'pen' };
}

function line(pressure: number, offset: number) {
  return Array.from({ length: 17 }, (_, i) => point(20 + (88 * i) / 16, 32 + offset, pressure, i * 8));
}
