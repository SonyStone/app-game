import { errorMessage, gpuError, type GpuError, type ResultValue } from '@app-game/solid-gpu/errors';
import { openWorker, type WorkerFailure, type WorkerReply } from '@app-game/solid-gpu/worker';
import { debounce } from '@solid-primitives/scheduled';
import { err, ok, type Result } from 'neverthrow';
import { onCleanup } from 'solid-js';
import DetailTableWorker from './detailTable.worker?worker';

/**
 * Builds magnified prefix-area tables in one reusable worker, one batch at a time; an idle worker shuts down after
 * five seconds. Error codes: 'render' for a failed or stalled batch (over thirty seconds), a busy worker or an
 * unsendable request, and 'unavailable' when the worker cannot start, crashes or cannot reply. Any failure shuts the
 * worker down and the next batch starts a fresh one. destroy(), also run on owner disposal, is permanent: it settles
 * the active batch and every later one with a 'destroyed' error.
 */
export function createDetailTableWorker(create: () => Worker = () => new DetailTableWorker()) {
  let connection: DetailTableConnection | undefined;
  let active: ((result: DetailTableResult) => void) | undefined;
  let destroyed = false;
  const deadline = debounce(
    () => settle(err(gpuError('render', 'Coverage table building exceeded 30 seconds'))),
    30_000
  );
  const releaseAfterIdle = debounce(release, 5_000);

  onCleanup(destroy);

  return {
    /** Builds every outline of `request`; each outline's curves are transferred to the worker. */
    build(request: DetailTableRequest): Promise<DetailTableResult> {
      if (destroyed) {
        return Promise.resolve(err(destroyedError()));
      }

      if (active) {
        return Promise.resolve(err(gpuError('render', 'The coverage table builder is busy')));
      }

      releaseAfterIdle.clear();
      return new Promise((resolve) => {
        active = resolve;
        const transport = connect();
        const sent = transport.andThen((worker) =>
          worker
            .post(
              request,
              request.outlines.map(({ curves }) => curves.buffer)
            )
            .mapErr(transportError)
        );

        if (sent.isErr()) {
          settle(err(sent.error));
        } else {
          deadline();
        }
      });
    },
    destroy
  };

  function connect(): Result<DetailTableConnection, GpuError> {
    if (connection) {
      return ok(connection);
    }

    const created = openWorker<DetailTableRequest, DetailTableWorkerReply>(create, {
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

  function settle(result: DetailTableResult) {
    const resolve = active;

    if (!resolve) {
      return;
    }

    active = undefined;
    deadline.clear();

    if (result.isErr()) {
      release();
    } else {
      releaseAfterIdle();
    }

    resolve(result);
  }

  function release() {
    releaseAfterIdle.clear();
    connection?.close();
    connection = undefined;
  }

  /** Shuts the worker down and settles the active batch. Later batches fail immediately. */
  function destroy() {
    if (destroyed) {
      return;
    }

    destroyed = true;
    settle(err(destroyedError()));
    release();
  }
}

/**
 * Outlines to rasterize over a square `window` of their unit box; `curves` holds one outline's cubics (eight floats
 * each) and is transferred.
 */
export type DetailTableRequest = {
  outlines: {
    key: number;
    rule: number;
    grid: { columns: number; rows: number };
    window: { x: number; y: number; extent: number };
    curves: Float32Array;
  }[];
};

/** Row tables packed as described by `rasterizeRowTable`, keyed like their requests. */
export type DetailTableReply = { tables: { key: number; words: Uint32Array }[] };

/** Terminal response of the detail table worker. */
export type DetailTableWorkerReply = WorkerReply<DetailTableReply, string>;

/** The open worker; replaced by a fresh one after a failure or idle shutdown. */
type DetailTableConnection = ResultValue<ReturnType<typeof openWorker<DetailTableRequest, DetailTableWorkerReply>>>;

/** Built tables, or a render/unavailable/destroyed failure. */
type DetailTableResult = Result<DetailTableReply, GpuError>;

function destroyedError() {
  return gpuError('destroyed', 'The coverage table builder has been destroyed');
}

/** A failed post only affects its batch; other transport failures mean the builder is unavailable. */
function transportError(failure: WorkerFailure) {
  switch (failure.kind) {
    case 'post':
      return gpuError('render', errorMessage(failure.cause));
    case 'create':
      return gpuError('unavailable', `Unable to start the coverage table builder: ${errorMessage(failure.cause)}`);
    case 'error':
      return gpuError('unavailable', failure.cause.message || 'The coverage table builder crashed');
    case 'messageerror':
      return gpuError('unavailable', 'Unable to transfer coverage tables');
  }
}
