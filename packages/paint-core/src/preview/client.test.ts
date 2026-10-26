// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createStrokePreviewService } from './client';
import type { PreviewConfiguration, PreviewJob, PreviewReply } from './protocol';

class TestWorker {
  onmessage?: (event: { data: PreviewReply }) => void;
  onerror?: (event: { message: string }) => void;
  onmessageerror?: () => void;
  postMessage = vi.fn<(job: PreviewJob) => void>();
  terminate = vi.fn();
  reply(reply: PreviewReply) {
    this.onmessage?.({ data: reply });
  }
  job() {
    return this.postMessage.mock.calls.at(-1)![0];
  }
}
const services: ReturnType<typeof createStrokePreviewService>[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16)
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => {
  services.forEach((service) => service.dispose());
  services.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup() {
  const worker = new TestWorker();
  const service = createStrokePreviewService(() => worker as unknown as Worker);
  services.push(service);
  const present = vi.fn();
  const canvas = { width: 1, height: 1, dataset: {}, getContext: () => ({ transferFromImageBitmap: present }) };
  return { worker, service, present, canvas, connection: service.attach(canvas as unknown as HTMLCanvasElement) };
}
const configuration: PreviewConfiguration = {
  kind: 'brush',
  brush: { size: 20 },
  width: 128,
  height: 64,
  dpr: 1,
  background: '#333333'
};
const point = { x: 0.1, y: 0.5, pressure: 0.5, tiltX: 15, tiltY: 25, rotation: 45, time: 0 };
function bitmap() {
  return { width: 128, height: 64, close: vi.fn() } as unknown as ImageBitmap;
}
function image(worker: TestWorker, value = bitmap()) {
  worker.reply({ type: 'image', id: worker.job().id, bitmap: value, renderMs: 1 });
  return value;
}

test('shares one worker, prioritizes active samples, replaces queued edits and closes stale/hidden images', async () => {
  const { worker, service, connection, present } = setup();
  const secondCanvas = { dataset: {}, getContext: () => ({ transferFromImageBitmap: vi.fn() }) };
  const second = service.attach(secondCanvas as unknown as HTMLCanvasElement);
  connection.update(configuration);
  second.update({ ...configuration, priority: 10 });
  connection.update({ ...configuration, brush: { size: 30 } });
  await vi.advanceTimersByTimeAsync(16);
  expect(worker.job().target).toBe(2);
  second.pause();
  expect(image(worker).close).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(16);
  expect(worker.job().configuration).toMatchObject({ brush: { size: 30 } });
  connection.update({ ...configuration, brush: { size: 40 } });
  expect(image(worker).close).toHaveBeenCalledOnce();
  expect(present).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(16);
  const fresh = image(worker);
  expect(present).toHaveBeenCalledWith(fresh);
  expect(fresh.close).not.toHaveBeenCalled();
});

test('sends only new tablet samples, merges pending input and suspends thumbnails until finish', async () => {
  const { worker, connection, service } = setup();
  connection.update(configuration);
  connection.begin([point]);
  connection.add([{ ...point, x: 0.2, time: 10 }]);
  await vi.advanceTimersByTimeAsync(16);
  expect(worker.job()).toMatchObject({ action: 'begin', points: [point, { ...point, x: 0.2, time: 10 }] });
  image(worker);
  const thumbnail = service.attach({ dataset: {}, getContext: () => ({}) } as unknown as HTMLCanvasElement);
  thumbnail.update(configuration);
  connection.add([{ ...point, x: 0.3, time: 20 }]);
  connection.add([{ ...point, x: 0.4, time: 30 }]);
  await vi.advanceTimersByTimeAsync(16);
  expect(worker.job().action).toBe('add');
  expect(worker.job().configuration).toBeUndefined();
  expect(worker.job().points).toHaveLength(2);
  expect(worker.job().points[0]!.x).toBe(0.3);
  connection.finish();
  image(worker);
  await vi.advanceTimersByTimeAsync(16);
  expect(worker.job().action).toBe('finish');
  image(worker);
  await vi.advanceTimersByTimeAsync(16);
  expect(worker.job().target).toBe(2);
});

test('a tap finishes the contact packet instead of replacing it with the synthetic sample', async () => {
  const { worker, connection } = setup();
  connection.update(configuration);
  connection.begin([point]);
  connection.finish();
  await vi.advanceTimersByTimeAsync(16);
  expect(worker.job()).toMatchObject({ action: 'begin', end: true, points: [point] });
});

test('holds use engine idle ticks; stopped idle does not busy-loop', async () => {
  const { worker, connection } = setup();
  connection.update(configuration);
  connection.begin([point]);
  await vi.advanceTimersByTimeAsync(16);
  worker.reply({ type: 'image', id: worker.job().id, bitmap: bitmap(), renderMs: 1, idle: true });
  await vi.advanceTimersByTimeAsync(16);
  expect(worker.job()).toMatchObject({ action: 'add', points: [] });
  expect(worker.job().elapsedMs).toBeGreaterThanOrEqual(0);
  image(worker);
  const count = worker.postMessage.mock.calls.length;
  await vi.advanceTimersByTimeAsync(160);
  expect(worker.postMessage).toHaveBeenCalledTimes(count);
});

test('resource transport preserves export bytes and final disposal terminates the shared worker', async () => {
  const { worker, connection } = setup();
  const pixels = new Uint8Array([1, 2, 3, 4]);
  connection.update({ ...configuration, resources: [{ id: 'tip', width: 2, height: 2, format: 'r8unorm', pixels }] });
  await vi.advanceTimersByTimeAsync(16);
  expect(worker.postMessage.mock.calls[0]).toHaveLength(1);
  expect(pixels).toEqual(new Uint8Array([1, 2, 3, 4]));
  image(worker);
  connection.dispose();
  await vi.advanceTimersByTimeAsync(999);
  expect(worker.terminate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(worker.terminate).toHaveBeenCalledOnce();
});

test('worker failures report the reason without a CPU stroke fallback', async () => {
  const { worker, connection, canvas } = setup();
  connection.update(configuration);
  await vi.advanceTimersByTimeAsync(16);
  worker.onerror?.({ message: 'WebGPU is unavailable.' });
  expect(canvas.dataset).toMatchObject({ previewState: 'error', previewReason: 'WebGPU is unavailable.' });
  expect(worker.terminate).toHaveBeenCalledOnce();
});
