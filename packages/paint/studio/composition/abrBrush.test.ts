import { brushToFormValues } from '@app-game/abr-brush/form';
import { createAbrStrokeSampler, type PreviewPoint } from '@app-game/abr-brush/stroke';
import { describe, expect, it } from 'vitest';
import { interpolateTabletAxes } from '../tabletAxes';

function input() {
  const values = brushToFormValues({
    id: 'test',
    name: 'Dynamics',
    type: 'computed',
    settings: {},
    spacing: 8,
    diameter: 24
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
      { ...points[1]!, x: 5000, y: 0 }
    ]);
    expect(stroke.count).toBeGreaterThan(16384);
    expect(stroke.data[(stroke.count - 1) * 16]).toBeCloseTo(5000);
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
  it('interpolates barrel rotation across its wrap without a half-turn jump', () => {
    const a = { ...points[0]!, rotation: 355 },
      b = { ...points[1]!, rotation: 5 };
    expect(interpolateTabletAxes(a, b, 0.5).rotation).toBe(360);
  });
});
