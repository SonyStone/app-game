import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { brushToFormValues } from '../src/features/brush-detail/brush-form-schema';
import type { PreviewJob, PreviewReply } from '../src/features/brush-preview/protocol';
import type { PreviewInput } from '../src/features/brush-preview/stroke';

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage?: (event: { data: PreviewReply }) => void;
  onerror?: (event: { message: string }) => void;
  postMessage = vi.fn<(job: PreviewJob, transfer?: Transferable[]) => void>();
  terminate = vi.fn();
  constructor() {
    TestWorker.instances.push(this);
  }
}
function canvas() {
  const present = vi.fn();
  return { width: 1, height: 1, dataset: {}, getContext: () => ({ transferFromImageBitmap: present }), present };
}
function input(): PreviewInput {
  return {
    values: brushToFormValues({ id: 'a', name: 'Brush', type: 'computed', settings: {}, spacing: 10, diameter: 10 }),
    width: 32,
    height: 16,
    dpr: 1,
    color: '#ffffff',
    background: '#333333',
    flow: 1,
    opacity: 1
  };
}
function bitmap() {
  return { close: vi.fn() } as unknown as ImageBitmap;
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  TestWorker.instances = [];
  vi.stubGlobal('Worker', TestWorker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('many canvases share one worker; stale and hidden results are closed', async () => {
  const { attachPreview } = await import('../src/features/brush-preview/client');
  const a = canvas(),
    b = canvas();
  const first = attachPreview(a as unknown as HTMLCanvasElement),
    second = attachPreview(b as unknown as HTMLCanvasElement);
  first.update(input(), undefined, 0);
  await vi.advanceTimersByTimeAsync(1);
  const worker = TestWorker.instances[0]!;
  const old = worker.postMessage.mock.calls[0]![0];
  const newer = input();
  newer.values.diameter = 20;
  first.update(newer, undefined, 0);
  second.update(input(), undefined, 10);
  const stale = bitmap();
  worker.onmessage!({ data: { type: 'image', id: old.id, bitmap: stale, backend: 'gpu' } });
  expect(stale.close).toHaveBeenCalledOnce();
  expect(a.present).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  const selected = worker.postMessage.mock.calls[1]![0];
  second.pause();
  const hidden = bitmap();
  worker.onmessage!({ data: { type: 'image', id: selected.id, bitmap: hidden, backend: 'gpu' } });
  expect(hidden.close).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  const latest = worker.postMessage.mock.calls[2]![0];
  const image = bitmap();
  worker.onmessage!({ data: { type: 'image', id: latest.id, bitmap: image, backend: 'gpu' } });
  expect(a.present).toHaveBeenCalledWith(image);
  expect(image.close).not.toHaveBeenCalled();
  expect(TestWorker.instances).toHaveLength(1);
  first.dispose();
  second.dispose();
  await vi.advanceTimersByTimeAsync(1001);
  expect(worker.terminate).toHaveBeenCalledOnce();
});

test('tip upload transfers a copy and preserves ABR source data', async () => {
  const { attachPreview } = await import('../src/features/brush-preview/client');
  const connection = attachPreview(canvas() as unknown as HTMLCanvasElement);
  const data = new Uint8Array([10, 20, 30, 40]);
  connection.update(input(), { width: 2, height: 2, depth: 8, data }, 0);
  await vi.advanceTimersByTimeAsync(1);
  const worker = TestWorker.instances[0]!,
    id = worker.postMessage.mock.calls[0]![0].id;
  worker.onmessage!({ data: { type: 'need-tip', id } });
  const sent = worker.postMessage.mock.calls[1]!;
  expect(sent[0].tip?.data).toEqual(data);
  expect(sent[0].tip?.data.buffer).not.toBe(data.buffer);
  expect(sent[1]).toEqual([sent[0].tip!.data.buffer]);
  expect(data.byteLength).toBe(4);
  connection.dispose();
  await vi.advanceTimersByTimeAsync(1001);
});

test('worker failure renders the current request through the CPU fallback', async () => {
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number
      ) {}
    }
  );
  const image = bitmap();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => image)
  );
  const { attachPreview } = await import('../src/features/brush-preview/client');
  const target = canvas();
  const connection = attachPreview(target as unknown as HTMLCanvasElement);
  connection.update(input(), undefined, 0);
  await vi.advanceTimersByTimeAsync(1);
  TestWorker.instances[0]!.onerror!({ message: 'Worker unavailable' });
  await vi.waitFor(() => expect(target.present).toHaveBeenCalledWith(image));
  expect(target.dataset).toMatchObject({ previewBackend: 'cpu', previewState: 'ready' });
  connection.dispose();
  await vi.advanceTimersByTimeAsync(1001);
});

test('resource upload unwraps reactive objects and transfers only bounded copies', async () => {
  const { attachPreview } = await import('../src/features/brush-preview/client');
  const connection = attachPreview(canvas() as unknown as HTMLCanvasElement);
  const source = new Uint8Array(1024);
  source.set([1, 2, 3, 4], 500);
  const pattern = new Proxy(
    { id: 'pattern', name: 'Texture', width: 2, height: 2, mode: 1, data: source.subarray(500, 504) },
    {}
  );
  connection.update(input(), undefined, 10, { pattern });
  await vi.advanceTimersByTimeAsync(1);
  const worker = TestWorker.instances[0]!,
    id = worker.postMessage.mock.calls[0]![0].id;
  worker.onmessage!({ data: { type: 'need-tip', id } });
  const [job, transfer] = worker.postMessage.mock.calls[1]!;
  expect(() => structuredClone(job)).not.toThrow();
  expect(job.resources?.pattern?.data.buffer.byteLength).toBe(4);
  expect(transfer).toContain(job.resources?.pattern?.data.buffer);
  expect(source.byteLength).toBe(1024);
  expect([...source.subarray(500, 504)]).toEqual([1, 2, 3, 4]);
  connection.dispose();
  await vi.advanceTimersByTimeAsync(1001);
});
