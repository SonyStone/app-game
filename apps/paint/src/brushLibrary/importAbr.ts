import { makeEventListener } from '@solid-primitives/event-listener';
import type { Result } from '../asyncResult';
import type { BrushLibrary } from './decodeAbrLibrary';
import Worker from './importAbr.worker?worker';

/** Starts a disposable Vite worker. Always releases it on success, failure, timeout or editor unmount. */
export function importAbr(file: File, signal: AbortSignal): Promise<BrushLibrary> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Brush import cancelled.'));
      return;
    }
    const worker = new Worker();
    const close = () => {
      clearTimeout(timer);
      removeAbort();
      worker.terminate();
    };
    const fail = (error: Error) => {
      close();
      reject(error);
    };
    const abort = () => fail(new Error('Brush import cancelled.'));
    const timer = setTimeout(() => fail(new Error('Brush import timed out. Try a smaller library.')), 60_000);
    const removeAbort = makeEventListener(signal, 'abort', abort, { once: true });
    worker.onerror = (event) => fail(new Error(event.message || 'Brush import failed.'));
    worker.onmessage = ({ data }: MessageEvent<Result<BrushLibrary, string>>) => {
      close();
      if (data.ok) resolve(data.value);
      else reject(new Error(data.error));
    };
    try {
      worker.postMessage(file);
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
