import { documentError, errorMessage } from '../../../../shared/errors';
import { createWorkerRequests } from '../../../../shared/worker/createWorkerRequests';
import { mountWorker } from '../../../../shared/worker/mountWorker';
import { WorkerTasks } from '../../../../shared/worker/WorkerTasks';
import type { CoverageInput, CoverageReply } from '../../documentWorkerProtocol';
import { buildCoverageTables } from './buildCoverageTables';

mountWorker(() => {
  const request = createWorkerRequests<CoverageInput, CoverageReply>(self);
  return (
    <WorkerTasks
      request={request}
      execute={(input) => ({ ok: true, value: buildCoverageTables(input) })}
      error={(cause) => documentError('decode', errorMessage(cause))}
      transfer={(value) => [value.offsets.buffer, value.areas.buffer, value.grids.buffer]}
    />
  );
});
