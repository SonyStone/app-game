import { mountWorker } from '../../../../shared/worker/mountWorker';
import { WorkerTasks } from '../../../../shared/worker/WorkerTasks';
import { createRasterDecoder } from './createRasterDecoder';
import type { RasterRequest, RasterWorkerReply } from './rasterWorkerTypes';

// Serves single-flight requests from createRasterWorker. Shutdown disposes the decoder's cached image before closing.
mountWorker(() => {
  const { decode } = createRasterDecoder();
  return (
    <WorkerTasks<RasterRequest, RasterWorkerReply>
      // Shutdown aborts the signal, stopping decoding between steps; WorkerTasks drops the aborted reply.
      execute={(input, { signal }) => decode(input, signal)}
      error={String}
      transfer={(value) => [...(value.tail ? [value.tail.pixels] : []), ...value.tiles.map((tile) => tile.pixels)]}
    />
  );
}, self);
