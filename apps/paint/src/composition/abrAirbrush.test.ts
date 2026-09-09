import { brushToFormValues, formValuesToBrush } from '@app-game/abr-brush/form';
import { createAbrStrokeSampler, createPreviewStroke, type PreviewPoint } from '@app-game/abr-brush/stroke';
import { AbrParser, AbrWriter, createAbrFile } from '@app-game/abr-parser/browser';
import { expect, it } from 'vitest';

it('reads toolbar-only Airbrush and synchronizes the two native descriptor locations on edits', () => {
  const brush = {
    id: 'air',
    name: 'Airbrush',
    type: 'computed' as const,
    spacing: 25,
    settings: { toolOptions: { __classId: 'PbTl', 'Rpt ': true, futureOption: 17 } }
  };
  const values = brushToFormValues(brush);
  expect(values.useBuildUp).toBe(true);
  values.useBuildUp = false;
  const edited = formValuesToBrush(brush, values);
  expect(edited.settings['Rpt ']).toBe(false);
  expect(edited.settings.toolOptions).toMatchObject({ 'Rpt ': false, futureOption: 17 });
  values.useBuildUp = true;
  const enabled = formValuesToBrush(edited, values);
  expect(enabled.settings.toolOptions).toMatchObject({ 'Rpt ': true });
  const reopened = new AbrParser().parse(new AbrWriter().write(createAbrFile([enabled])));
  expect(reopened.errors).toEqual([]);
  expect(brushToFormValues(reopened.brushes[0]!).useBuildUp).toBe(true);
  expect(reopened.brushes[0]!.settings.toolOptions).toMatchObject({ 'Rpt ': true, futureOption: 17 });
});

it('emits timed stamps independently of packet boundaries and excludes disposable previews from the clock', () => {
  const values = settings();
  const input = { values, size: 16, color: '#ff0000', flow: 0.05, opacity: 0.5, seed: 1 };
  const tip = { width: 1, height: 1 };
  const together = createAbrStrokeSampler(input, tip);
  const partitioned = createAbrStrokeSampler(input, tip);
  const points = [point(0), point(60), point(120), point(600)];
  const expected = together.add(points);
  const data = points.flatMap((point) => {
    partitioned.preview([{ ...point, time: point.time + 1500 }]);
    return [...partitioned.add([point]).data];
  });
  expect(data).toEqual([...expected.data]);
  expect(expected.count).toBe(21);
  for (const type of ['PcTl', 'SmTl', 'ShTl', 'BlTl']) {
    values.tool.type = type;
    expect(createAbrStrokeSampler(input, tip).add(points).count).toBe(1);
  }
  values.tool.type = 'ErTl';
  for (const eraserMode of [2, 3]) {
    values.tool.eraserMode = eraserMode;
    expect(createAbrStrokeSampler(input, tip).add(points).count).toBe(1);
  }
});

it('preview hold builds paint with smoothing enabled, without exceeding the input time or painting a slack string', () => {
  const values = settings();
  const input = {
    values,
    color: '#ff0000',
    background: '#ffffff',
    opacity: 0.5,
    flow: 0.05,
    width: 256,
    height: 256,
    dpr: 1,
    path: [point(0), point(600)]
  };
  const tip = { width: 1, height: 1 };
  const raw = createPreviewStroke(input, tip);
  values.smoothing.amount = 100;
  for (const catchUp of [true, false]) {
    values.smoothing.catchUp = catchUp;
    expect(createPreviewStroke(input, tip).data).toEqual(raw.data);
  }
  values.smoothing.pulledString = true;
  expect(createPreviewStroke(input, tip).count).toBe(0);
});

function settings() {
  const values = brushToFormValues({ id: 'a', name: 'Airbrush', type: 'computed', spacing: 25, settings: {} });
  values.useBuildUp = true;
  return values;
}
function point(time: number): PreviewPoint {
  return { x: 0.5, y: 0.5, pressure: 1, time, tiltX: 0, tiltY: 0, rotation: 0 };
}
