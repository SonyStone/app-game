import { err, ok, type Result } from 'neverthrow';
import { createRoot, onCleanup } from 'solid-js';
import type { TextDocument } from '../../src/features/document/document';
import type { OnDocumentProgress } from '../../src/features/document/documentProgress';
import { documentWorkerError } from '../../src/features/document/documentWorkerError';
import DecodeWorker from '../../src/features/document/format/decode.worker?worker';
import type { DecodedDocument } from '../../src/features/document/format/types';
import ConvertWorker from '../../src/features/document/pdf/convert.worker?worker';
import { createTypeGpuRenderer as prepare } from '../../src/features/document/rendering/createTypeGpuRenderer';
import type { CoverageTables } from '../../src/features/document/rendering/curves/buildCoverageTables';
import CoverageWorker from '../../src/features/document/rendering/curves/coverage.worker?worker';
import { createRasterWorker } from '../../src/features/document/rendering/curves/createRasterWorker';
import type { DocumentWorkers } from '../../src/features/document/rendering/DocumentWorkers';
import type { DocumentError, ViewerError } from '../../src/shared/errors';
import { mountWorker } from '../../src/shared/worker/mountWorker';
import { runWorkerRequest } from '../../src/shared/worker/runWorkerRequest';
import { DocumentSource } from '../fixtures/DocumentSource';

/** Tests mount the renderer's transports at their fixture boundary, not in production calculations. */
export function mountRendererWorkers() {
  return createRoot((dispose) => {
    const raster = createRasterWorker();
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    const workers: DocumentWorkers = {
      raster,
      coverage: (input) =>
        runWorkerRequest<typeof input, CoverageTables, DocumentError>(() => new CoverageWorker(), input, {
          signal: controller.signal
        })
    };
    return { workers, dispose };
  });
}

export function readGdoc(source: string | ArrayBuffer, signal?: AbortSignal, progress?: OnDocumentProgress) {
  return withRequest<string | ArrayBuffer, DecodedDocument>(() => new DecodeWorker(), source, signal, progress);
}
export function convertPdf(bytes: ArrayBuffer, signal?: AbortSignal) {
  return withRequest<ArrayBuffer, ArrayBuffer>(() => new ConvertWorker(), bytes, signal);
}
/** Exercises the production loading sequence by mounting its owning component. */
export function loadDocument(signal?: AbortSignal, file?: File, progress?: OnDocumentProgress) {
  let dispose: (() => void) | undefined;
  let cancel: () => void;
  const pending = new Promise<Result<TextDocument, ViewerError>>((resolve) => {
    cancel = () => {
      dispose?.();
      resolve(err({ kind: 'aborted', message: 'Operation cancelled' }));
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
  initialFrame?: Parameters<typeof prepare>[4]
) {
  const fixture = mountRendererWorkers();
  const dispose = () => {
    signal?.removeEventListener('abort', dispose);
    gpu.signal.removeEventListener('abort', dispose);
    fixture.dispose();
  };
  signal?.addEventListener('abort', dispose);
  gpu.signal.addEventListener('abort', dispose);
  const result = await prepare(gpu, document, fixture.workers, signal, initialFrame);
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

async function withRequest<Input extends string | ArrayBuffer, Output>(
  create: () => globalThis.Worker,
  input: Input,
  signal?: AbortSignal,
  progress?: OnDocumentProgress
) {
  return (
    await runWorkerRequest<Input, Output, DocumentError, Parameters<OnDocumentProgress>[0]>(create, input, {
      signal: signal ?? new AbortController().signal,
      transfer: input instanceof ArrayBuffer ? [input] : [],
      onProgress: progress
    })
  ).mapErr(documentWorkerError);
}
