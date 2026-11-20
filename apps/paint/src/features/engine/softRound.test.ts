import { createAbrStrokeSampler, stampStride } from '@app-game/abr-brush/stroke';
import { adaptiveBrushQuality, brushQualityAtLod } from '@app-game/abr-paint/adaptiveQuality';
import { initAbr } from '@app-game/abr-parser';
import { createStrokeSampler, defaultBrush } from '@app-game/paint-core/brush';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { beforeAll, expect, it } from 'vitest';
import { softRoundCandidate } from '../../../tests/fixtures/softRound';

beforeAll(async () => {
  await initAbr();
});

it('records constant-pressure placement over 32 document pixels', () => {
  const preset = softRoundCandidate();
  const measurements = [0.05, 0.25, 0.5, 1].map((pressure) => {
    const points = [0, 32].map((x) => ({ x, y: 0, pressure, time: x, tiltX: 0, tiltY: 0, rotation: 0 }));
    const native = createStrokeSampler(defaultBrush()).add(points);
    const abr = createAbrStrokeSampler(
      {
        values: preset.engine.settings.values,
        size: 32,
        seed: 12345,
        flow: 0.35,
        opacity: 1,
        color: '#000000'
      },
      preset.resource
    ).add(points);
    return [native.length, native[1]!.x, native[0]!.radius, abr.count, abr.data[16]! - abr.data[0]!, abr.data[2]!].map(
      (value) => Number(value.toFixed(4))
    );
  });

  // Document the placement gap. Each triple is dab count, first advance and horizontal tip radius.
  expect(measurements).toEqual([
    [167, 0.192, 0.8, 33, 1, 1.804],
    [34, 0.96, 4, 30, 1.0752, 5.74],
    [17, 1.92, 8, 17, 1.9968, 10.66],
    [9, 3.84, 16, 9, 3.84, 20.5]
  ]);
});

type Point = ReturnType<typeof tabletPoint>;

function tabletPoint(x: number, y: number, pressure: number, time: number) {
  return { x, y, pressure, time, tiltX: 0, tiltY: 0, rotation: 0, pointerType: 'pen' };
}

const paths = [
  ...[0, 0.05, 0.25, 0.5, 1].map((p) => ({
    name: String(p),
    points: [tabletPoint(0, 0, p, 0), tabletPoint(16, 0, p, 16)]
  })),
  { name: 'rise', points: [tabletPoint(0, 0, 0, 0), tabletPoint(16, 0, 1, 16)] },
  { name: 'fall', points: [tabletPoint(0, 0, 1, 0), tabletPoint(16, 0, 0, 16)] },
  { name: 'corner', points: [tabletPoint(0, 0, 0.05, 0), tabletPoint(8, 0, 0.5, 8), tabletPoint(8, 8, 1, 16)] },
  { name: 'hold', points: [tabletPoint(0, 0, 0, 0), tabletPoint(0, 0, 1, 8), tabletPoint(0, 0, 1, 16)] }
];

it.each([1, 2, 4, 32])('gates ordered sampler traces at %i px', async (size) => {
  const preset = softRoundCandidate(size);
  const values = preset.engine.settings.values;
  // Optional full-resolution report for inspecting individual dabs behind a changed snapshot column.
  const output = process.env.PAINT_SOFT_ROUND_TRACES;
  const records: string[] = [];
  const rows = ['path sizeControl flowControl adaptive lod delivery | native count/xy/radius/flow | ABR'];
  for (const { name, points } of paths) {
    for (const pressureSize of [true, false]) {
      for (const pressureFlow of [false, true]) {
        values.useShapeDynamics = pressureSize;
        values.useTransfer = pressureFlow;
        values.transfer.flowControl = 2;
        const brush = { ...defaultBrush(), size, pressureSize, pressureFlow };
        for (const [adaptive, lod] of [
          [false, 0],
          [false, 2],
          [true, 0],
          [true, 2]
        ] as const) {
          const run = (delivery: string, packets: Point[][]) => {
            const native = createStrokeSampler(brush, brushQualityAtLod(adaptive, lod)?.minimumSpacing);
            const quality = adaptiveBrushQuality(adaptive, values, lod);
            const abr = createAbrStrokeSampler(
              { ...brush, values, seed: 12345, ...quality, sampledTipGeometry: true },
              preset.resource
            );
            const nativeDabs = packets.flatMap((packet) => native.add(packet).map((d) => [d.x, d.y, d.radius, d.flow]));
            const abrDabs = packets.flatMap((packet) => {
              const { data, count } = abr.add(packet);
              return Array.from({ length: count }, (_, i) => [0, 1, 2, 8].map((j) => data[i * stampStride + j]!));
            });
            if (output) {
              records.push(
                JSON.stringify({
                  path: name,
                  pressureSize,
                  pressureFlow,
                  adaptive,
                  lod,
                  delivery,
                  columns: ['x', 'y', 'radius', 'flow'],
                  native: nativeDabs,
                  abr: abrDabs
                })
              );
            }
            const nativeTrace = trace(nativeDabs);
            const candidate = trace(abrDabs).map((v, i) => (v === nativeTrace[i] ? '=' : v));
            return [nativeTrace.join('/'), candidate.join('/')];
          };
          const reference = run('packet', [points]);
          expect(
            run(
              'single',
              points.map((point) => [point])
            )
          ).toEqual(reference);
          const split = run('subdivided', [subdivide(points)]);
          const key = [name, +pressureSize, +pressureFlow, adaptive ? 'on' : 'off', lod].join(' ');
          rows.push(key + ' packet | ' + reference.join(' | '));
          if (split.join() !== reference.join()) {
            rows.push(key + ' subdivided | ' + split.join(' | '));
          }
        }
      }
    }
  }
  if (output) {
    await writeFile(join(output, 'sampler-' + size + 'px.jsonl.gz'), gzipSync(records.join('\n')));
  }
  // These columns document today's gaps. Replace an ABR column with "=" when that entire ordered channel agrees.
  await expect(rows.join('\n')).toMatchFileSnapshot('./__snapshots__/softRound-' + size + '.txt');
});

function trace(dabs: number[][]) {
  const digest = (indices: number[]) =>
    createHash('sha256')
      .update(JSON.stringify(dabs.map((d) => indices.map((i) => Number(d[i]!.toFixed(6))))))
      .digest('hex')
      .slice(0, 16);
  const extent = (i: number) => [dabs[0]![i]!, dabs.at(-1)![i]!].map((n) => Number(n.toFixed(6))).join('..');
  return [dabs.length, digest([0, 1]), extent(2) + '@' + digest([2]), extent(3) + '@' + digest([3])];
}

/** Inserts a collinear sample without changing the path, pressure slope or elapsed time. */
function subdivide(points: Point[]) {
  return points.flatMap((point, i) => {
    const next = points[i + 1];
    if (!next) {
      return [point];
    }
    return [
      point,
      tabletPoint(
        (point.x + next.x) / 2,
        (point.y + next.y) / 2,
        (point.pressure + next.pressure) / 2,
        (point.time + next.time) / 2
      )
    ];
  });
}
