// @vitest-environment jsdom
import { createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createDeveloperSettings } from './createDeveloperSettings';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it('starts with prediction and the ink trail off and the GPU warm-up on', () => {
  const settings = createRoot(() => createDeveloperSettings());
  expect([settings.predictStrokes(), settings.inkTrail(), settings.warmGpu()]).toEqual([false, false, true]);
});

it('remembers the pen latency switches across sessions, also when changed in one event', () => {
  const first = createRoot(() => createDeveloperSettings());
  first.setPredictStrokes(true);
  first.setInkTrail(true);
  first.setWarmGpu(false);
  first.setLiveTail(false);

  const next = createRoot(() => createDeveloperSettings());
  expect([next.predictStrokes(), next.inkTrail(), next.warmGpu()]).toEqual([true, true, false]);
  // Other switches last for one session.
  expect(next.liveTail()).toBe(true);
});

it('takes defaults for invalid stored values and keeps choices when storage fails', () => {
  localStorage.setItem('paint.penLatency', JSON.stringify({ predict: 'yes', inkTrail: true }));
  const settings = createRoot(() => createDeveloperSettings());
  expect([settings.predictStrokes(), settings.inkTrail(), settings.warmGpu()]).toEqual([false, true, true]);

  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Full', 'QuotaExceededError');
  });
  settings.setPredictStrokes(true);
  expect(settings.predictStrokes()).toBe(true);

  vi.restoreAllMocks();
  localStorage.setItem('paint.penLatency', '{broken');
  expect(createRoot(() => createDeveloperSettings()).predictStrokes()).toBe(false);
});
