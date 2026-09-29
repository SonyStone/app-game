import { debounce } from '@solid-primitives/scheduled';
import { err, ok, Result } from 'neverthrow';
import { onCleanup } from 'solid-js';
import { errorMessage, gpuError, type GpuError } from '../../../../shared/errors';
import { createWorkerTransport, type WorkerTransport } from '../../../../shared/worker/createWorkerTransport';
import type { WorkerFailure } from '../../../../shared/worker/workerProtocol';
import RasterWorker from './raster.worker?worker';
import type { RasterReply, RasterRequest, RasterWorkerReply } from './rasterWorkerTypes';

/**
 * Decodes raster tiles in one reusable worker, one request at a time. The worker keeps the last image's source,
 * so repeated requests for it skip copying bytes. An idle worker is shut down after five seconds.
 * Error codes: 'render' is specific to one request (decoder error, unsendable bytes, a request exceeding sixty
 * seconds, or decoding while another request is in flight); 'unavailable' means the worker could not start,
 * crashed or could not return its reply. Any failure shuts the worker down and the next request starts a fresh one.
 * destroy(), also run on owner disposal, is permanent: it settles the active request and all later requests
 * with a 'destroyed' error.
 */
export function createRasterWorker(create: () => Worker = () => new RasterWorker()) {
  let connection: WorkerTransport<RasterRequest, RasterWorkerReply> | undefined;
  let cachedImage: number | undefined;
  let active: ((result: RasterResult) => void) | undefined;
  let destroyed = false;
  const deadline = debounce(() => settle(err(gpuError('render', 'Image decoding exceeded 60 seconds'))), 60_000);
  const releaseAfterIdle = debounce(release, 5_000);

  onCleanup(destroy);

  return {
    /** Sends one request, lazily reading source bytes only when the worker does not already hold the image. */
    decode(request: Omit<RasterRequest, 'bytes'>, readSource: () => ArrayBuffer): Promise<RasterResult> {
      if (destroyed) {
        return Promise.resolve(err(destroyedError()));
      }
      if (active) {
        return Promise.resolve(err(gpuError('render', 'The image decoder is busy')));
      }

      releaseAfterIdle.clear();
      return new Promise((resolve) => {
        active = resolve;
        const sent = send(request, readSource);
        if (sent.isErr()) {
          settle(err(sent.error));
        } else {
          deadline();
        }
      });
    },
    destroy
  };

  function send(request: Omit<RasterRequest, 'bytes'>, readSource: () => ArrayBuffer): Result<void, GpuError> {
    const transport = connect();
    if (transport.isErr()) {
      return err(transport.error);
    }

    const bytes = Result.fromThrowable(
      () => (cachedImage === request.id ? undefined : readSource()),
      (cause) => gpuError('render', errorMessage(cause))
    )();
    if (bytes.isErr()) {
      return err(bytes.error);
    }

    cachedImage = request.id;
    return transport.value
      .post({ ...request, bytes: bytes.value }, (input) => (input.bytes ? [input.bytes] : []))
      .mapErr(transportError);
  }

  function connect(): Result<WorkerTransport<RasterRequest, RasterWorkerReply>, GpuError> {
    if (connection) {
      return ok(connection);
    }

    const created = createWorkerTransport<RasterRequest, RasterWorkerReply>(create, {
      message: ({ data }) => {
        if (!('progress' in data)) {
          settle(data.ok ? ok(data.value) : err(gpuError('render', data.error)));
        }
      },
      error: (failure) => settle(err(transportError(failure)))
    });
    if (created.isErr()) {
      return err(transportError(created.error));
    }

    connection = created.value;
    return ok(connection);
  }

  function settle(result: RasterResult) {
    const resolve = active;
    if (!resolve) {
      return;
    }

    active = undefined;
    deadline.clear();
    if (result.isErr()) {
      // A failed or stalled worker may hold a broken decoder state; start fresh next time.
      release();
    } else {
      releaseAfterIdle();
    }
    resolve(result);
  }

  function release() {
    releaseAfterIdle.clear();
    connection?.destroy();
    connection = undefined;
    cachedImage = undefined;
  }

  /** Shuts the worker down and settles the active request. Later requests fail immediately. */
  function destroy() {
    if (destroyed) {
      return;
    }

    destroyed = true;
    settle(err(destroyedError()));
    release();
  }
}

/** Decoded tiles, or a render/destroyed failure. */
type RasterResult = Result<RasterReply, GpuError>;

function destroyedError() {
  return gpuError('destroyed', 'The image decoder has been destroyed');
}

/** A failed post only affects its request's bytes; other transport failures mean the decoder is unavailable. */
function transportError(failure: WorkerFailure) {
  switch (failure.kind) {
    case 'post':
      return gpuError('render', errorMessage(failure.cause));
    case 'create':
      return gpuError('unavailable', `Unable to start the image decoder: ${errorMessage(failure.cause)}`);
    case 'error':
      return gpuError('unavailable', failure.cause.message || 'The image decoder crashed');
    case 'messageerror':
      return gpuError('unavailable', 'Unable to transfer image tiles');
  }
}
