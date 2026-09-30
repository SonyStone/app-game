import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareBrushPerformance } from './compare-brush-performance.mjs';

test('accepts ordinary timing noise without weakening workload/output checks', () => {
  const baseline = fixture(), actual = fixture();
  actual.cases[0].drawMs *= 1.2;
  assert.deepEqual(compareBrushPerformance(baseline, actual), { failures: [], warnings: [] });
});

for (const metric of ['drawMs', 'finishMs', 'maxFrameGapMs', 'stamps', 'submissions', 'gpuBytes']) {
  test(`rejects a ${metric} regression`, () => {
    const actual = fixture();
    actual.cases[0][metric] *= 3;
    assert.ok(compareBrushPerformance(fixture(), actual).failures.some(message => message.includes(metric)));
  });
}

test('rejects missing cases, changed workload, different configurations, and lost ink', () => {
  for (const change of [
    actual => { actual.cases.pop(); },
    actual => { actual.cases[0].distance = 10; },
    actual => { actual.environment.device = 'other'; },
    actual => { actual.environment.dpr = 2; },
    actual => { actual.environment.width = 800; },
    actual => { actual.environment.height = 600; },
    actual => { actual.environment.gpu.vendor = 'apple'; },
    actual => { actual.environment.gpu.architecture = 'metal-3'; },
    actual => { actual.environment.gpu.device = '0x1234'; },
    actual => { actual.environment.gpu.description = 'Other GPU'; },
    actual => { delete actual.environment.gpu; },
    actual => { actual.cases[0].pixelHash++; },
    actual => { actual.cases[0].stamps = 0; },
    actual => { actual.cases[0].drawMs = NaN; }
  ]) {
    const actual = fixture();
    change(actual);
    assert.notDeepEqual(compareBrushPerformance(fixture(), actual).failures, []);
  }
});

test('ignores the browser user agent', () => {
  const actual = fixture();
  actual.environment.userAgent = 'Chrome/999';
  assert.deepEqual(compareBrushPerformance(fixture(), actual), { failures: [], warnings: [] });
});

test('warns instead of failing for adapter fields an older baseline does not record', () => {
  const baseline = fixture();
  delete baseline.environment.gpu.device;
  const { failures, warnings } = compareBrushPerformance(baseline, fixture());
  assert.deepEqual(failures, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /device/);
});

function fixture() {
  return {
    schema: 1,
    environment: {
      device: 'test', userAgent: 'Chrome/1', dpr: 1, width: 1280, height: 720,
      gpu: { vendor: 'qualcomm', architecture: 'adreno-7xx', device: '', description: '' }
    },
    cases: [{
      id: '2b', preset: '2B', size: 222, distance: 6000, lod: 3, mixing: 'linear',
      drawMs: 100, finishMs: 100, maxFrameGapMs: 100, stamps: 500, submissions: 100,
      gpuBytes: 32 * 1024 * 1024, pixelHash: 123
    }]
  };
}
