// @vitest-environment jsdom
import { ok } from 'neverthrow';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createInputRecorder } from './createInputRecorder';
import type { InputRecording } from './inputRecording';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

it('records input, commands and state changes from the start until stopping', async () => {
  const { recorder, setTool, uploads, dispose } = setup();
  const canvas = document.body.appendChild(document.createElement('canvas'));
  canvas.setAttribute('aria-label', 'Drawing');

  recorder.start();
  flush();
  canvas.dispatchEvent(pointer('pointerdown', { clientX: 10, clientY: 20, pressure: 0.5, pointerType: 'pen' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', metaKey: true }));
  recorder.command({ type: 'begin', samples: Array.from({ length: 20 }, (_, x) => ({ x, y: 0 })) });
  setTool('lasso');
  flush();
  recorder.stop();
  flush();
  canvas.dispatchEvent(pointer('pointerup', { clientX: 10, clientY: 20 }));
  await recorder.save('  The stroke vanished  ');
  flush();

  const recording = JSON.parse(await uploads.get('recording.json')!.text()) as InputRecording;
  expect(recorder.status()).toBe('idle');
  expect(recorder.saved()).toBe('apps/paint/recordings/test');
  expect([...uploads.keys()]).toEqual(['start.paint', 'start.png', 'end.png', 'recording.json']);
  expect(recording).toMatchObject({
    version: 1,
    note: 'The stroke vanished',
    initial: { tool: 'brush' },
    files: { document: 'start.paint', startView: 'start.png', endView: 'end.png' }
  });
  expect(recording.events.map((event) => event.kind)).toEqual(['pointer', 'key', 'command', 'state']);
  expect(recording.events[0]).toMatchObject({
    type: 'pointerdown',
    clientX: 10,
    clientY: 20,
    pressure: 0.5,
    pointerType: 'pen',
    target: 'canvas[aria-label="Drawing"]'
  });
  expect(recording.events[1]).toMatchObject({ key: 'z', metaKey: true });
  expect(recording.events[2]).toMatchObject({
    command: { type: 'begin', samples: { length: 20, first: { x: 0, y: 0 }, last: { x: 19, y: 0 } } }
  });
  expect(recording.events[3]).toMatchObject({ changes: { tool: 'lasso' } });
  dispose();
});

it('ignores its own controls and keeps a failed recording for another attempt', async () => {
  const { recorder, uploads, fail, dispose } = setup();
  const controls = document.body.appendChild(document.createElement('div'));
  controls.dataset.inputRecorder = '';

  recorder.start();
  flush();
  controls.dispatchEvent(pointer('pointerdown', {}));
  recorder.stop();
  flush();
  fail(true);
  await recorder.save('');
  flush();
  expect(recorder.status()).toBe('review');
  expect(recorder.failure()).toMatch(/did not save/);

  fail(false);
  await recorder.save('');
  flush();
  const recording = JSON.parse(await uploads.get('recording.json')!.text()) as InputRecording;
  expect(recording.events).toEqual([]);
  expect(recorder.failure()).toBeUndefined();
  dispose();
});

it('stops by itself after the longest duration', () => {
  vi.useFakeTimers();
  const { recorder, dispose } = setup(5000);

  recorder.start();
  flush();
  vi.advanceTimersByTime(5000);
  flush();
  expect(recorder.status()).toBe('review');
  dispose();
  vi.useRealTimers();
});

function setup(maxDurationMs?: number) {
  const uploads = new Map<string, Blob>();
  let failing = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (failing) {
        return new Response('disk full', { status: 500 });
      }

      uploads.set(url.split('/').at(-1)!, init.body as Blob);
      return Response.json({ directory: 'apps/paint/recordings/test' });
    })
  );

  return createRoot((dispose) => {
    const [tool, setTool] = createSignal('brush');
    const recorder = createInputRecorder({
      exportFile: async (kind) => ok(new Blob([kind])),
      observe: () => ({ tool: tool() }),
      maxDurationMs
    });

    return { recorder, setTool, uploads, fail: (value: boolean) => (failing = value), dispose };
  });
}

/** jsdom has no PointerEvent; a MouseEvent with pointer fields reaches the same listeners. */
function pointer(type: string, init: Partial<PointerEvent>) {
  const event = new MouseEvent(type, { bubbles: true, clientX: init.clientX, clientY: init.clientY });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: init.pointerType ?? 'mouse' },
    isPrimary: { value: true },
    pressure: { value: init.pressure ?? 0 }
  });
  return event;
}
