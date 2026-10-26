// @vitest-environment jsdom
import { createRoot, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createPalmRejection } from '../palm-rejection';
import { createPenHover } from '../pen-hover';
import { tiltFromAndroid } from './createNativeHover';
import { createNativeShell } from './createNativeShell';
import { createShellClient, type NativeHover } from './shellClient';

let dispose: (() => void) | undefined;
let under: Element;
beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="canvas"></div><button id="button"></button>';
  under = document.getElementById('canvas')!;
  // jsdom has no layout; the element under the pen is whatever the test says.
  document.elementFromPoint = () => under;
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
});

it('calls shell methods and gets their results or errors', async () => {
  const shell = fakeShell();
  const client = createShellClient(shell.port);

  const info = client.request('info', {});
  expect(shell.sent).toEqual([{ kind: 'request', id: 1, method: 'info', params: {} }]);
  shell.send({ kind: 'response', id: 1, result: { shell: 'paint-android', capabilities: ['info'] } });
  expect((await info)._unsafeUnwrap()).toMatchObject({ shell: 'paint-android', capabilities: ['info'] });

  const missing = client.request('setGestureExclusion', {});
  shell.send({ kind: 'response', id: 2, error: { code: 'unknown-method', message: 'no such method' } });
  expect((await missing)._unsafeUnwrapErr()).toMatchObject({ code: 'unknown-method' });
});

it('answers the shell, also when the page has no handler', async () => {
  const shell = fakeShell();
  const client = createShellClient(shell.port);

  shell.send({ kind: 'request', id: 5, method: 'back', params: {} });
  await Promise.resolve();
  expect(shell.sent.at(-1)).toMatchObject({ kind: 'response', id: 5, error: { code: 'unknown-method' } });

  const stop = client.handle('back', () => ({ handled: true }));
  shell.send({ kind: 'request', id: 6, method: 'back', params: {} });
  await Promise.resolve();
  expect(shell.sent.at(-1)).toEqual({ kind: 'response', id: 6, result: { handled: true } });

  stop();
  shell.send({ kind: 'request', id: 7, method: 'back', params: {} });
  await Promise.resolve();
  expect(shell.sent.at(-1)).toMatchObject({ kind: 'response', id: 7, error: { code: 'unknown-method' } });
});

it('asks the shell for its info on start and is inactive outside the shell', () => {
  const shell = fakeShell();
  const nativeShell = start(() => createNativeShell(createShellClient(shell.port)));
  expect(nativeShell.active).toBe(true);
  expect(shell.sent[0]).toMatchObject({ kind: 'request', method: 'info' });

  dispose?.();
  expect(start(() => createNativeShell(undefined)).active).toBe(false);
});

it('closes the newest open thing on back, and lets the shell offer to exit when nothing was open', async () => {
  const shell = fakeShell();
  const open = { panel: true, sheet: true };
  start(() => {
    const nativeShell = createNativeShell(createShellClient(shell.port));
    nativeShell.onBack(() => close('panel'));
    nativeShell.onBack(() => close('sheet'));
  });

  const results = [];
  for (let id = 1; id <= 3; id++) {
    shell.send({ kind: 'request', id, method: 'back', params: {} });
    await Promise.resolve();
    results.push(shell.sent.at(-1).result.handled);
  }

  expect(results).toEqual([true, true, false]);
  expect(open).toEqual({ panel: false, sheet: false });

  function close(name: keyof typeof open) {
    const was = open[name];
    open[name] = false;
    return was;
  }
});

it('replays forwarded hover as pen pointer events that hover consumers see', () => {
  const shell = fakeShell();
  const seen: string[] = [];
  for (const type of ['pointerover', 'pointerenter', 'pointermove', 'pointerout', 'pointerleave']) {
    under.addEventListener(type, (event) => {
      const pointer = event as PointerEvent;
      seen.push(`${type} ${pointer.pointerType} ${pointer.buttons} ${pointer.clientX},${pointer.clientY}`);
    });
  }

  const { penHover, palm } = start(() => {
    const penHover = createPenHover();
    const palm = createPalmRejection({
      enabled: () => true,
      hand: () => 'right',
      tolerance: () => 0,
      linger: () => 10_000
    });
    createNativeShell(createShellClient(shell.port));
    return { penHover, palm };
  });

  shell.send(hover('enter', 100, 50));
  shell.send(hover('move', 120, 60));
  expect(seen).toEqual([
    'pointerover pen 0 100,50',
    'pointerenter pen 0 100,50',
    'pointermove pen 0 100,50',
    'pointermove pen 0 120,60'
  ]);
  expect(penHover.hovers()).toBe(true);
  flush();
  expect(palm.zone()).toEqual({ left: 120, right: innerWidth });

  // Moving onto another element leaves the first one.
  under = document.getElementById('button')!;
  shell.send(hover('move', 300, 60));
  expect(seen.slice(4)).toEqual(['pointerout pen 0 300,60', 'pointerleave pen 0 300,60']);

  shell.send(hover('exit', 300, 60));
  flush();
  expect(palm.zone()).toBeUndefined();
});

it('converts Android tilt like Chromium', () => {
  expect(tiltFromAndroid(0, 0)).toEqual({ tiltX: 0, tiltY: 0 });
  // Leaning 30° toward the top of the screen, then toward the right.
  expect(tiltFromAndroid(Math.PI / 6, 0)).toEqual({ tiltX: 0, tiltY: 30 });
  expect(tiltFromAndroid(Math.PI / 6, -Math.PI / 2)).toEqual({ tiltX: 30, tiltY: 0 });
});

function start<T>(create: () => T): T {
  return createRoot((disposeRoot) => {
    dispose = disposeRoot;
    return create();
  });
}

/** A stand-in for the port the shell injects, recording what the page sends. */
function fakeShell() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sent: any[] = [];
  const listeners = new Set<(event: MessageEvent) => void>();
  return {
    sent,
    port: {
      postMessage: (message: string) => sent.push(JSON.parse(message)),
      addEventListener: (_type: 'message', listener: (event: MessageEvent) => void) => listeners.add(listener)
    },
    /** Delivers a message from the shell. */
    send(message: object) {
      listeners.forEach((listener) => listener(new MessageEvent('message', { data: JSON.stringify(message) })));
    }
  };
}

function hover(phase: NativeHover['phase'], x: number, y: number) {
  const data: NativeHover = {
    phase,
    x,
    y,
    tilt: 0,
    orientation: 0,
    distance: 0,
    eraser: false,
    buttons: 0,
    time: 0,
    sentAt: 0
  };
  return { kind: 'event', name: 'hover', data };
}
