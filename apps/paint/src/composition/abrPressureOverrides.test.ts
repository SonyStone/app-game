import { brushToFormValues, formValuesToBrush } from '@app-game/abr-brush/form';
import { createAbrStrokeSampler, type PreviewPoint } from '@app-game/abr-brush/stroke';
import { AbrParser, AbrWriter, createAbrFile } from '@app-game/abr-parser/browser';
import { expect, it } from 'vitest';
import calibration from '../../../../packages/abr-brush/fixtures/photoshop-pressure-overrides.json';
import { viewerBrush } from '../brushLibrary/viewerBrush';

it.each(calibration.cases)('matches Photoshop effective dynamics for $name without rewriting the preset', (fixture) => {
  const values = brushToFormValues(brush());
  const requested = fixture.requested;
  values.useShapeDynamics = requested.enabled;
  values.useTransfer = requested.enabled;
  Object.assign(values.shapeDynamics, {
    sizeControl: requested.control,
    sizeJitter: requested.jitter,
    minimumDiameter: requested.minimum
  });
  Object.assign(values.transfer, {
    opacityControl: requested.control,
    opacityJitter: requested.jitter,
    opacityMinimum: requested.minimum
  });
  Object.assign(values.transfer, { flowControl: 2, flowJitter: 40, flowMinimum: 20 });
  values.tool.pressureOverridesSize = requested.sizeOverride;
  values.tool.pressureOverridesOpacity = requested.opacityOverride;
  const original = structuredClone(values);
  const effective = structuredClone(values);
  effective.tool.pressureOverridesSize = false;
  effective.tool.pressureOverridesOpacity = false;
  effective.useShapeDynamics = fixture.effective.useShapeDynamics;
  effective.useTransfer = fixture.effective.useTransfer;
  Object.assign(effective.shapeDynamics, {
    sizeControl: fixture.effective.sizeControl,
    sizeJitter: fixture.effective.sizeJitter,
    minimumDiameter: fixture.effective.sizeMinimum
  });
  Object.assign(effective.transfer, {
    opacityControl: fixture.effective.opacityControl,
    opacityJitter: fixture.effective.opacityJitter,
    opacityMinimum: fixture.effective.opacityMinimum,
    flowControl: fixture.effective.flowControl,
    flowJitter: fixture.effective.flowJitter,
    flowMinimum: fixture.effective.flowMinimum
  });
  // Disabled sections skip random draws. The noise seed is not part of this dynamics calibration.
  const attributes = (data: Float32Array) => data.filter((_, index) => index % 16 !== 11);
  expect(attributes(sample(values).data)).toEqual(attributes(sample(effective).data));
  expect(values).toEqual(original);
  const applied = viewerBrush(formValuesToBrush(brush(), values)).engine.settings.values;
  expect(applied.useShapeDynamics).toBe(values.useShapeDynamics);
  expect(applied.useTransfer).toBe(values.useTransfer);
  expect(applied.shapeDynamics).toEqual(values.shapeDynamics);
  expect(applied.transfer).toEqual(values.transfer);
});

it('pressure opacity reaches zero despite a saved minimum/jitter, including dormant Transfer and ABR roundtrip', () => {
  const values = brushToFormValues(brush());
  values.useTransfer = false;
  values.transfer.opacityMinimum = 80;
  values.transfer.opacityJitter = 80;
  values.transfer.opacityControl = 3;
  values.tool.pressureOverridesOpacity = true;
  const edited = formValuesToBrush(brush(), values);
  const file = new AbrParser().parse(new AbrWriter().write(createAbrFile([edited])));
  expect(file.errors).toEqual([]);
  const imported = brushToFormValues(file.brushes[0]!);
  expect(imported.transfer).toMatchObject({ opacityMinimum: 80, opacityJitter: 80, opacityControl: 3 });
  for (const pressure of [0, 0.1, 0.5, 1]) {
    expect(sample(imported, [{ ...point(0), pressure }]).data[9]).toBeCloseTo(0.6 * pressure);
  }
  imported.tool.pressureOverridesOpacity = false;
  expect(sample(imported, [{ ...point(0), pressure: 0 }]).data[9]).toBeCloseTo(0.6);
});

function sample(values: ReturnType<typeof brushToFormValues>, points = [point(0), point(1), point(2)]) {
  return createAbrStrokeSampler(
    { values, size: 64, opacity: 0.6, flow: 0.4, color: '#000000', seed: 17 },
    { width: 1, height: 1 }
  ).add(points);
}
function point(index: number): PreviewPoint {
  return {
    x: index * 120,
    y: index * 15,
    pressure: [0.1, 0.9, 0.2][index]!,
    tiltX: 30,
    tiltY: 15,
    rotation: 0,
    time: index * 100
  };
}
function brush() {
  return { id: 'pressure-override', name: 'Pressure override', type: 'computed' as const, spacing: 10, settings: {} };
}
