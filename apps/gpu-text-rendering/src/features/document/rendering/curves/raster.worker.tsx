import { WorkerTasks } from '../../../../shared/worker/WorkerTasks';
import { createWorkerRequests } from '../../../../shared/worker/createWorkerRequests';
import { mountWorker } from '../../../../shared/worker/mountWorker';
import { createRasterDecoder } from './createRasterDecoder';
import type { RasterRequest, RasterWorkerReply } from './rasterWorkerTypes';

// Serves serial requests from createRasterWorker. Shutdown disposes the decoder's cached image before closing.
mountWorker(() => {
  const request = createWorkerRequests<RasterRequest, RasterWorkerReply>(self);
  const { decode } = createRasterDecoder();
  return (
    <WorkerTasks
      request={request}
      execute={async (input, { signal }) => {
        // Shutdown aborts the signal, stopping decoding between steps; WorkerTasks drops the aborted reply.
        const result = await decode(input, signal);
        return result.isOk() ? { ok: true, value: result.value } : { ok: false, error: result.error };
      }}
      error={String}
      transfer={(value) => [...(value.tail ? [value.tail.pixels] : []), ...value.tiles.map((tile) => tile.pixels)]}
    />
  );
}, self);
