import { expect, test, vi } from 'vitest';
import { createPointerEventsHandler } from './pointerevent';

const events = [
  {
    type: 'pointerdown',
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 0,
    clientY: 0
  },
  {
    type: 'pointermove',
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 10,
    clientY: 0
  },
  {
    type: 'pointermove',
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 0
  },
  {
    type: 'pointerup',
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 30,
    clientY: 0
  }
];

test('should work', () => {
  expect(2 + 1).toBe(3);
});

test('should mouse input events handler works', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(0));

  const pointerEventsHandler = createPointerEventsHandler({
    now: Date.now
  });

  const inputs = [];

  inputs.push(pointerEventsHandler(events[0]));
  vi.setSystemTime(new Date(1000));
  inputs.push(pointerEventsHandler(events[1]));
  vi.setSystemTime(new Date(2000));
  inputs.push(pointerEventsHandler(events[2]));
  vi.setSystemTime(new Date(3000));
  inputs.push(pointerEventsHandler(events[3]));

  expect(inputs).toEqual([
    expect.objectContaining({
      angle: 0,
      center: [0, 0],
      delta: [0, 0],
      distance: 0,
      eventType: 'start',
      isFinal: false,
      isFirst: true,
      offsetDirection: 1,
      overallVelocity: [0, 0],
      pointerType: 'mouse',
      rotation: 0,
      scale: 1,
      start: [0, 0],
      timeStamp: 0
    }),
    expect.objectContaining({
      angle: 0,
      center: [10, 0],
      delta: [10, 0],
      distance: 10,
      eventType: 'move',
      isFinal: false,
      isFirst: false,
      offsetDirection: 4,
      overallVelocity: [0.01, 0],
      pointerType: 'mouse',
      rotation: 0,
      scale: 1,
      start: [0, 0],
      timeStamp: 1000
    }),
    expect.objectContaining({
      angle: 0,
      center: [20, 0],
      delta: [20, 0],
      distance: 20,
      eventType: 'move',
      isFinal: false,
      isFirst: false,
      offsetDirection: 4,
      overallVelocity: [0.01, 0],
      pointerType: 'mouse',
      rotation: 0,
      scale: 1,
      start: [0, 0],
      timeStamp: 2000
    }),
    expect.objectContaining({
      angle: 0,
      center: [30, 0],
      delta: [30, 0],
      distance: 30,
      eventType: 'end',
      isFinal: true,
      isFirst: false,
      offsetDirection: 4,
      overallVelocity: [0.01, 0],
      pointerType: 'mouse',
      rotation: 0,
      scale: 1,
      start: [0, 0],
      timeStamp: 3000
    })
  ]);

  expect(inputs).toBeTruthy();
});
