/** @vitest-environment jsdom */
import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { expect, it } from 'vitest';
import { PathOverlay } from '../src/features/inspection/PathOverlay';

it.each([1, 2])('places known saved knots at camera pixel positions independently of DPR %s', (dpr) => {
  Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true });
  const host = document.createElement('div');
  const knots = [
    [2 - 2 ** -21, 2],
    [21, 2],
    [21, 14],
    [2 - 2 ** -21, 14]
  ].map((anchor) => ({
    selector: 1,
    q24YX: [],
    anchor,
    before: anchor,
    after: anchor
  }));
  const path = {
    outcome: 'geometry' as const,
    resourceId: 2000,
    namedIndex: null,
    legacyName: new Uint8Array(),
    unicodeName: null,
    companionStream: false,
    tail: new Uint8Array(),
    components: [
      { subpaths: [{ closed: true, knots, recordIndex: 0, originationIndex: 0 }], operation: 1, fillRule: 0 }
    ]
  } satisfies Parameters<typeof PathOverlay>[0]['path'];
  const dispose = render(() => <PathOverlay path={path} view={{ x: 12, y: 18, scale: 4 }} />, host);
  try {
    flush();
    expect(host.querySelector('g')?.getAttribute('transform')).toBe('translate(12 18) scale(4)');
    expect(
      [...host.querySelectorAll('circle')].map((circle) => [
        12 + Number(circle.getAttribute('cx')) * 4,
        18 + Number(circle.getAttribute('cy')) * 4
      ])
    ).toEqual([
      [20 - 2 ** -19, 26],
      [96, 26],
      [96, 74],
      [20 - 2 ** -19, 74]
    ]);
  } finally {
    dispose();
  }
});
