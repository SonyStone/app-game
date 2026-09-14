import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareBrushPerformance } from './compare-brush-performance.mjs';

test('accepts ordinary timing noise without weakening workload/output checks', () => {
  const baseline = fixture(), actual = fixture();
  actual.cases[0].drawMs *= 1.2;
  assert.deepEqual(compareBrushPerformance(baseline, actual), []);
});

for (const metric of ['drawMs', 'finishMs', 'maxFrameGapMs', 'stamps', 'submissions', 'gpuBytes']) {
  test(`rejects a ${metric} regression`, () => {
    const actual = fixture(); actual.cases[0][metric] *= 3;
    assert.ok(compareBrushPerformance(fixture(), actual).some(message => message.includes(metric)));
  });
}

test('rejects missing cases, changed workload, different devices, and lost ink', () => {
  for (const change of [
    actual => { actual.cases.pop(); },
    actual => { actual.cases[0].distance = 10; },
    actual => { actual.environment.device = 'other'; },
    actual => { actual.cases[0].pixelHash++; },
    actual => { actual.cases[0].stamps = 0; },
    actual => { actual.cases[0].drawMs = NaN; }
  ]) {
    const actual = fixture(); change(actual);
    assert.notDeepEqual(compareBrushPerformance(fixture(), actual), []);
  }
});

function fixture() {
  return { schema: 1, environment: { device: 'test', dpr: 1 }, cases: [{
    id: '2b', preset: '2B', size: 222, distance: 6000, lod: 3, mixing: 'linear',
    drawMs: 100, finishMs: 100, maxFrameGapMs: 100, stamps: 500, submissions: 100,
    gpuBytes: 32 * 1024 * 1024, pixelHash: 123
  }] };
}
