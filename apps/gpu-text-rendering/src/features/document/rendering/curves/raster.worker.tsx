import { WorkerTasks } from '../../../../shared/worker/WorkerTasks';
import { createWorkerRequests } from '../../../../shared/worker/createWorkerRequests';
import { mountWorker } from '../../../../shared/worker/mountWorker';
import { createRasterDecoder } from './createRasterDecoder';
import type { RasterRequest, RasterWorkerReply } from './rasterWorkerTypes';

mountWorker(() => {
  const request = createWorkerRequests<RasterRequest, RasterWorkerReply>(self);
  const { decode } = createRasterDecoder();
  return (
    <WorkerTasks
      request={request}
      execute={async (input) => {
        const result = await decode(input);
        return result.isOk() ? { ok: true, value: result.value } : { ok: false, error: result.error };
      }}
      error={String}
      transfer={(value) => [...(value.tail ? [value.tail.pixels] : []), ...value.tiles.map((tile) => tile.pixels)]}
    />
  );
});
