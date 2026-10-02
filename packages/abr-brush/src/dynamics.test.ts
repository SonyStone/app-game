import { brushToFormValues } from './form';
import { createAbrStrokeSampler, type PreviewPoint } from './stroke';
import { percent, pixels } from '@app-game/abr-parser';
import { describe, expect, it } from 'vitest';

function input() {
  const values = brushToFormValues({
    id: 'test',
    name: 'Dynamics',
    preset: {
      kind: 'brush',
      sourceId: 'fixture',
      ...{},
      tip: { kind: 'computed', diameter: pixels(24), spacing: percent(8) }
    },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  });
  values.useShapeDynamics = true;
  values.shapeDynamics.sizeJitter = 30;
  values.shapeDynamics.sizeControl = 2;
  values.shapeDynamics.minimumDiameter = 10;
  values.shapeDynamics.angleJitter = 35;
  values.useScattering = true;
  values.scattering.count = 3;
  values.scattering.scatter = 100;
  values.useColorDynamics = true;
  values.colorDynamics.applyPerTip = true;
  values.colorDynamics.hueJitter = 50;
  values.useTransfer = true;
  values.transfer.opacityControl = 2;
  return { values, size: 24, color: '#de3456', opacity: 0.8, flow: 0.6 };
}
const points: PreviewPoint[] = Array.from({ length: 60 }, (_, i) => ({
  x: i * 10,
  y: Math.sin(i / 6) * 80,
  pressure: 0.1 + (0.9 * i) / 59,
  tiltX: i,
  tiltY: 12,
  rotation: i * 2,
  time: i * 8
}));
const tip = { width: 24, height: 12 };

describe('shared ABR stroke state', () => {
  it('preserves random dynamics, spacing and transfer across arbitrary frame batches', () => {
    const whole = createAbrStrokeSampler(input(), tip).add(points).data;
    const live = createAbrStrokeSampler(input(), tip);
    const batches = [
      ...live.add(points.slice(0, 1)).data,
      ...live.add(points.slice(1, 17)).data,
      ...live.add(points.slice(17)).data
    ];
    expect(batches).toEqual([...whole]);
  });
  it('disposable previews do not change the next committed stamp or random color', () => {
    const a = createAbrStrokeSampler(input(), tip),
      b = createAbrStrokeSampler(input(), tip);
    a.add(points.slice(0, 30));
    b.add(points.slice(0, 30));
    const first = a.preview(points.slice(30)).data;
    expect(a.preview(points.slice(30)).data).toEqual(first);
    expect(a.add(points.slice(30)).data).toEqual(b.add(points.slice(30)).data);
  });
  it('does not truncate a long document stroke at the preview GPU buffer capacity', () => {
    const config = input();
    config.values.useScattering = false;
    config.values.useShapeDynamics = false;
    config.values.spacing = 1;
    config.size = 1;
    const stroke = createAbrStrokeSampler(config, tip).add([
      { ...points[0]!, x: 0, y: 0 },
      { ...points[1]!, x: 20000, y: 0 }
    ]);
    expect(stroke.count).toBeGreaterThan(16384);
    expect(stroke.data[(stroke.count - 1) * 16]).toBeCloseTo(20000);
  });
  it('Tilt Scale stretches untraced tips only by the pen tilt', () => {
    const config = input();
    config.values.useScattering = false;
    config.values.shapeDynamics.sizeJitter = 0;
    config.values.shapeDynamics.angleJitter = 0;
    config.values.shapeDynamics.roundnessJitter = 0;
    config.values.shapeDynamics.sizeControl = 3;
    config.values.shapeDynamics.tiltScale = 200;
    const aspect = (values: typeof config.values, tiltX: number) => {
      const { data } = createAbrStrokeSampler({ ...config, values }, tip).add([
        { x: 0, y: 0, pressure: 1, tiltX, tiltY: 0, rotation: 0, time: 0, pointerType: 'pen' }
      ]);
      return data[3]! / data[2]!;
    };
    const upright = aspect(config.values, 0);

    expect(upright).toBeCloseTo(aspect({ ...config.values, useShapeDynamics: false }, 0));
    expect(aspect(config.values, 45)).toBeCloseTo(upright * 2);
  });
  it('wheel controls use tangential pressure rather than the canvas X coordinate', () => {
    const config = input();
    config.values.useScattering = false;
    config.values.shapeDynamics.sizeJitter = 0;
    config.values.shapeDynamics.sizeControl = 4;
    const left = createAbrStrokeSampler(config, tip).add([{ ...points[0]!, tangentialPressure: -1 }]);
    const right = createAbrStrokeSampler(config, tip).add([{ ...points[0]!, x: 100000, tangentialPressure: -1 }]);
    expect(left.data[2]).toBe(right.data[2]);
  });
});
