// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { abbreviate, describeTarget, readPointer } from './inputRecording';

it('describes an element by its label, or by its nearest labelled ancestor', () => {
  document.body.innerHTML = `
    <main aria-label="Drawing workspace"><div class="handle corner"><span></span></div></main>
    <button title="Undo">↶</button>`;

  expect(describeTarget(document.querySelector('button'))).toBe('button[title="Undo"]');
  expect(describeTarget(document.querySelector('.handle'))).toBe('div.handle in main[aria-label="Drawing workspace"]');
  expect(describeTarget(window)).toBe('window');
});

it('keeps coalesced samples of moves and the target of contacts', () => {
  const sample = (clientX: number, timeStamp: number) => ({ clientX, clientY: 0, timeStamp, pressure: 0.5 });
  const move = Object.assign(new MouseEvent('pointermove', { clientX: 3 }), {
    getCoalescedEvents: () => [sample(1, 1001), sample(3, 1002)]
  }) as unknown as PointerEvent;
  const time = (timeStamp: number) => timeStamp - 1000;

  const recorded = readPointer(move, time);
  expect(recorded.coalesced?.map(({ clientX, time }) => [clientX, time])).toEqual([
    [1, 1],
    [3, 2]
  ]);
  expect(recorded.target).toBeUndefined();
  expect(readPointer(new MouseEvent('pointerdown') as PointerEvent, time).target).toBe('none');
});

it('abbreviates long arrays, strings, binary data and deep nesting', () => {
  expect(
    abbreviate({
      points: Array.from({ length: 10 }, (_, index) => index),
      text: 'x'.repeat(300),
      file: new Blob(['abc']),
      nested: { a: { b: { c: { d: 1 } } } },
      skipped: undefined,
      callback: () => {}
    })
  ).toEqual({
    points: { length: 10, first: 0, last: 9 },
    text: `${'x'.repeat(200)}…`,
    file: { blob: '', size: 3 },
    nested: { a: { b: { c: '…' } } }
  });
});
