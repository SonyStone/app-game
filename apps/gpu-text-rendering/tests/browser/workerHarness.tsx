import { err, ok, type Result } from 'neverthrow';
import { createRoot, onCleanup } from 'solid-js';
import type { TextDocument } from '../../src/features/document/document';
import type { OnDocumentProgress } from '../../src/features/document/documentProgress';
import { buildCoverage, convertDocument, decodeDocument } from '../../src/features/document/documentWorkerProtocol';
import { createTypeGpuRenderer as prepare } from '../../src/features/document/rendering/createTypeGpuRenderer';
import { createRasterWorker } from '../../src/features/document/rendering/curves/createRasterWorker';
import type { DocumentWorkers } from '../../src/features/document/rendering/DocumentWorkers';
import { abortedError, type ViewerError } from '../../src/shared/errors';
import { mountWorker } from '../../src/shared/worker/mountWorker';
import { DocumentSource } from '../fixtures/DocumentSource';

/** Tests mount the renderer's transports at their fixture boundary, not in production calculations. */
export function mountRendererWorkers() {
  return createRoot((dispose) => {
    const raster = createRasterWorker();
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    const workers: DocumentWorkers = {
      raster,
      coverage: (input) => buildCoverage(input, { signal: controller.signal })
    };
    return { workers, dispose };
  });
}

export function readGdoc(source: string | ArrayBuffer, signal?: AbortSignal, progress?: OnDocumentProgress) {
  return decodeDocument(source, { signal: signal ?? new AbortController().signal, onProgress: progress });
}
export function convertPdf(bytes: ArrayBuffer, signal?: AbortSignal) {
  return convertDocument(bytes, { signal: signal ?? new AbortController().signal });
}
/** Exercises the production loading sequence by mounting its owning component. */
export function loadDocument(signal?: AbortSignal, file?: File, progress?: OnDocumentProgress) {
  let dispose: (() => void) | undefined;
  let cancel: () => void;
  const pending = new Promise<Result<TextDocument, ViewerError>>((resolve) => {
    cancel = () => {
      dispose?.();
      resolve(err(abortedError()));
    };
    if (signal?.aborted) return cancel();
    signal?.addEventListener('abort', cancel);
    dispose = mountWorker(() => (
      <DocumentSource
        file={file}
        onLoading={(value) => {
          if (value) progress?.(value);
        }}
        onError={(error) => resolve(err(error))}
      >
        {(data) => {
          resolve(ok(data));
          return null;
        }}
      </DocumentSource>
    ));
  });
  return pending.finally(() => {
    signal?.removeEventListener('abort', cancel);
    dispose?.();
  });
}

export async function createTypeGpuRenderer(
  gpu: Parameters<typeof prepare>[0],
  document: Parameters<typeof prepare>[1],
  signal?: AbortSignal,
  initialFrame?: Parameters<typeof prepare>[2]['initialFrame']
) {
  const fixture = mountRendererWorkers();
  const dispose = () => {
    signal?.removeEventListener('abort', dispose);
    gpu.signal.removeEventListener('abort', dispose);
    fixture.dispose();
  };
  signal?.addEventListener('abort', dispose);
  gpu.signal.addEventListener('abort', dispose);
  const result = await prepare(gpu, document, { workers: fixture.workers, signal, initialFrame });
  if (result.isErr()) dispose();
  else {
    const destroy = result.value.destroy;
    result.value.destroy = () => {
      destroy();
      dispose();
    };
  }
  return result;
}
