import { debounce } from '@solid-primitives/scheduled';
import { err, ok, type Result } from 'neverthrow';
import { onCleanup } from 'solid-js';
import { errorMessage, gpuError, type GpuError } from '../../../../shared/errors';
import { createWorkerTransport } from '../../../../shared/worker/createWorkerTransport';
import type { WorkerFailure } from '../../../../shared/worker/workerProtocol';
import RasterWorker from './raster.worker?worker';
import type { RasterReply, RasterRequest, RasterWorkerReply } from './rasterWorkerTypes';

/** Serializes raster requests, retaining the decoder and its last source for five idle seconds. Owner disposal cancels all work. */
export function createRasterWorker(create: () => Worker = () => new RasterWorker()) {
  type Job = {
    request: Omit<RasterRequest, 'bytes'>;
    readSource: () => ArrayBuffer;
    resolve: (result: Result<RasterReply, GpuError>) => void;
  };
  const queue: Job[] = [];
  let active: Job | undefined;
  type Transport = ReturnType<
    ReturnType<typeof createWorkerTransport<RasterRequest, RasterWorkerReply>>['_unsafeUnwrap']
  >;
  let connection: Transport | undefined;
  let cachedImage: number | undefined;
  let destroyed = false;
  const deadline = debounce(() => finish(err(gpuError('render', 'Image decoding exceeded 60 seconds'))), 60_000);
  const releaseAfterIdle = debounce(release, 5_000);

  onCleanup(destroy);
  return {
    /** Lazily copies source bytes only when this worker does not already hold the requested image. */
    decode(request: Job['request'], readSource: Job['readSource']): Promise<Result<RasterReply, GpuError>> {
      if (destroyed) return Promise.resolve(err(gpuError('destroyed', 'The image decoder has been destroyed')));
      return new Promise((resolve) => {
        queue.push({ request, readSource, resolve });
        next();
      });
    },
    destroy
  };

  function next() {
    if (active || destroyed) return;
    releaseAfterIdle.clear();
    active = queue.shift();
    if (!active) {
      releaseAfterIdle();
      return;
    }
    if (!connection) {
      const created = createWorkerTransport<RasterRequest, RasterWorkerReply>(create, {
        message: ({ data }) => {
          if ('progress' in data) return;
          finish(data.ok ? ok(data.value) : err(gpuError('render', data.error)));
        },
        error: (failure) => finish(err(transportError(failure)))
      });
      if (created.isErr()) return finish(err(transportError(created.error)));
      if (destroyed) {
        created.value.destroy();
        return;
      }
      connection = created.value;
    }
    const job = active;
    try {
      const bytes = cachedImage === job.request.id ? undefined : job.readSource();
      cachedImage = job.request.id;
      deadline();
      const sent = connection.post({ ...job.request, bytes }, (input) => (input.bytes ? [input.bytes] : []));
      if (sent.isErr()) finish(err(transportError(sent.error)));
    } catch (cause) {
      finish(err(gpuError('render', errorMessage(cause))));
    }
  }

  function finish(result: Result<RasterReply, GpuError>) {
    const job = active;
    if (!job) return;
    active = undefined;
    deadline.clear();
    if (result.isErr()) release();
    job.resolve(result);
    next();
  }

  function release() {
    releaseAfterIdle.clear();
    connection?.destroy();
    connection = undefined;
    cachedImage = undefined;
  }

  /** Terminates native work and settles both the active request and queued callers. */
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    deadline.clear();
    release();
    const cancelled = err<RasterReply, GpuError>(gpuError('destroyed', 'The image decoder has been destroyed'));
    active?.resolve(cancelled);
    active = undefined;
    queue.splice(0).forEach((job) => job.resolve(cancelled));
  }
}

function transportError(failure: WorkerFailure) {
  return gpuError(
    'render',
    failure.kind === 'messageerror'
      ? 'Unable to transfer image tiles'
      : failure.kind === 'error'
        ? failure.cause.message
        : errorMessage(failure.cause)
  );
}
