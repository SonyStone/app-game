import { percent } from '@app-game/abr-parser';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { brushToFormValues } from './form';
import { createAbrStrokeSampler, stampStride } from './stroke';

it.each([1, 2, 4, 32])('freezes ordered distance traces and default stamp records at size %i', (size) => {
  const values = round();
  const paint = createHash('sha256');
  const photoshop = createHash('sha256');
  for (const path of paths) {
    for (const sizeControl of [false, true]) {
      for (const flowControl of [false, true]) {
        values.useShapeDynamics = sizeControl;
        values.useTransfer = flowControl;
        for (const minimumSpacing of [undefined, undefined, 1, 4]) {
          const input = { values, size, seed: 12345, flow: 0.35, opacity: 1, color: '#000000', minimumSpacing };
          const tip = { width: 1, height: 1 };
          for (const packets of [[path], path.map((p) => [p]), [subdivide(path)]]) {
            const explicit = createAbrStrokeSampler({ ...input, placement: 'photoshop-v1' }, tip);
            const implicit = createAbrStrokeSampler(input, tip);
            const distance = createAbrStrokeSampler({ ...input, placement: 'paint-distance-v1' }, tip);
            for (const packet of packets) {
              const legacy = implicit.add(packet);
              const bytes = Buffer.from(legacy.data.buffer);
              expect(Buffer.from(explicit.add(packet).data.buffer).equals(bytes)).toBe(true);
              photoshop.update(String(legacy.count) + '|').update(bytes);

              const { count, data } = distance.add(packet);
              paint.update(String(count) + '|');
              for (let i = 0; i < count; i++) {
                paint.update(data.subarray(i * stampStride, i * stampStride + 2));
              }
            }
          }
        }
      }
    }
  }
  expect([paint.digest('hex'), photoshop.digest('hex')]).toMatchSnapshot();
});

it('restores fractional phase and seeded dynamics after previewing a ramp', () => {
  const values = round();
  values.useShapeDynamics = true;
  values.shapeDynamics.sizeJitter = 50;
  values.useScattering = true;
  Object.assign(values.scattering, { scatter: 75, count: 3, bothAxes: true });
  const input = {
    values,
    size: 4,
    seed: 7,
    flow: 0.35,
    opacity: 1,
    color: '#000000',
    placement: 'paint-distance-v1' as const
  };
  const make = () => createAbrStrokeSampler(input, { width: 1, height: 1 });
  const live = make();
  const control = make();
  const prefix = [point(0, 0, 0.2), point(1, 1, 0.7)];
  live.add(prefix);
  control.add(prefix);
  live.preview([point(9, 2, 1)]);
  const tail = [point(3, 1, 0.1)];
  expect(live.add(tail)).toEqual(control.add(tail));
});

it('places pressure-sized 4 px tips across 32 document pixels', () => {
  const values = round();
  values.useShapeDynamics = true;
  const counts = [0.05, 0.25, 1].map((pressure) => {
    return (['photoshop-v1', 'paint-distance-v1'] as const).map(
      (placement) =>
        createAbrStrokeSampler(
          { values, placement, size: 4, flow: 0.35, opacity: 1, color: '#000000' },
          { width: 1, height: 1 }
        ).add([point(0, 0, pressure), point(32, 0, pressure)]).count
    );
  });
  expect(counts).toEqual([
    [33, 534],
    [33, 267],
    [33, 67]
  ]);
});

function round() {
  const values = brushToFormValues({
    name: 'Soft round',
    preset: { kind: 'brush', sourceId: 'fixture', tip: { kind: 'computed', spacing: percent(12) } }
  });
  values.tool.type = 'PbTl';
  values.shapeDynamics.sizeControl = 2;
  values.shapeDynamics.minimumDiameter = 4;
  values.transfer.flowControl = 2;
  return values;
}

function point(x: number, y: number, pressure: number, time = x + y) {
  return { x, y, pressure, time, tiltX: 0, tiltY: 0, rotation: 0 };
}

const paths = [
  ...[0, 0.05, 0.25, 0.5, 1].map((p) => [point(0, 0, p), point(16, 0, p)]),
  [point(0, 0, 0), point(16, 0, 1)],
  [point(0, 0, 1), point(16, 0, 0)],
  [point(0, 0, 0.05), point(8, 0, 0.5), point(8, 8, 1)],
  [point(0, 0, 0), point(0, 0, 1, 8), point(0, 0, 1, 16)]
];

function subdivide(path: ReturnType<typeof point>[]) {
  return path.flatMap((a, i) => {
    const b = path[i + 1];
    return b ? [a, point((a.x + b.x) / 2, (a.y + b.y) / 2, (a.pressure + b.pressure) / 2, (a.time + b.time) / 2)] : [a];
  });
}
