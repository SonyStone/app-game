import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { createSavedViews } from './createSavedViews';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((dispose) => dispose()));

const first = { x: 0, y: 0, zoom: 1, rotation: 0 };
const second = { x: 1, y: 1, zoom: 0.5, rotation: 0 };
const third = { x: 2, y: 2, zoom: 0.25, rotation: 0 };

it('visits one view, then stops when the flight finishes', () => {
  const saved = setup();
  const canvas = document.createElement('canvas');
  saved.capture(first, canvas);
  saved.capture(second, canvas);
  flush();
  const [, target] = saved.views();

  saved.visit(target!);
  flush();
  expect(saved.stops()).toEqual([second]);
  expect(saved.route()).toEqual({ start: 0, loop: false });
  expect(saved.selected()).toBe(target);
  expect(saved.playing()).toBe(false);

  saved.stop();
  flush();
  expect(saved.route()).toBeUndefined();
});

it('tours every view from the one after the selection until toggled again', () => {
  const saved = setup();
  const canvas = document.createElement('canvas');
  saved.capture(first, canvas);
  saved.capture(second, canvas);
  saved.capture(third, canvas);
  flush();

  saved.visit(saved.views()[1]!);
  flush();
  saved.toggleTour();
  flush();
  const route = saved.route();
  expect(route).toEqual({ start: 2, loop: true });
  expect(saved.playing()).toBe(true);
  expect(saved.stops()).toEqual([first, second, third]);

  saved.reportVisit(0);
  flush();
  expect(saved.selected()).toBe(saved.views()[0]);

  saved.toggleTour();
  flush();
  expect(saved.playing()).toBe(false);
});

it('stops a visit to a removed view but keeps touring the rest', () => {
  const saved = setup();
  const canvas = document.createElement('canvas');
  saved.capture(first, canvas);
  saved.capture(second, canvas);
  flush();
  const [kept, removed] = saved.views();

  saved.visit(removed!);
  saved.remove(removed!);
  flush();
  expect(saved.views()).toEqual([kept]);
  expect(saved.selected()).toBeUndefined();
  expect(saved.route()).toBeUndefined();

  saved.toggleTour();
  flush();
  expect(saved.playing()).toBe(true);
  saved.remove(kept!);
  flush();
  expect(saved.route()).toBeUndefined();
});

it('scrubs along the route between neighbouring views, selecting the nearest and stopping flights', () => {
  const saved = setup();
  const canvas = document.createElement('canvas');
  saved.capture(first, canvas);
  saved.capture(third, canvas);
  flush();
  saved.toggleTour();
  flush();

  expect(saved.scrub(-1)!.x).toBeCloseTo(first.x);
  const middle = saved.scrub(0.5)!;
  expect(middle.x).toBeGreaterThan(first.x);
  expect(middle.x).toBeLessThan(third.x);
  expect(middle.zoom).toBeLessThan(first.zoom);
  expect(middle.zoom).toBeGreaterThan(third.zoom);
  expect(saved.scrub(0.8)!.x).toBeGreaterThan(middle.x);
  flush();
  expect(saved.selected()).toBe(saved.views()[1]);
  expect(saved.playing()).toBe(false);
  expect(saved.scrub(5)!.x).toBeCloseTo(third.x);
});

it('copies saved cameras and forgets every view when the reset source changes', () => {
  const { reset, ...saved } = setup();
  const camera = { ...first };
  saved.capture(camera, document.createElement('canvas'));
  camera.x = 5;
  flush();
  expect(saved.views()[0]!.camera).toEqual(first);

  saved.toggleTour();
  reset();
  flush();
  expect(saved.views()).toEqual([]);
  expect(saved.route()).toBeUndefined();
});

function setup() {
  return createRoot((dispose) => {
    cleanups.push(dispose);
    const [source, setSource] = createSignal({});

    return { ...createSavedViews(source), reset: () => setSource({}) };
  });
}
