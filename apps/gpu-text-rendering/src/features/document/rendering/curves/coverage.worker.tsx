import { ok } from 'neverthrow';
import { documentError, errorMessage } from '../../../../shared/errors';
import { mountWorker } from '../../../../shared/worker/mountWorker';
import { WorkerTasks } from '../../../../shared/worker/WorkerTasks';
import type { CoverageInput, CoverageReply } from '../../documentWorkerProtocol';
import { buildCoverageTables } from '../../plan/buildCoverageTables';

// Receives one request per worker; WorkerTasks supplies typed failure replies, transfers and cooperative shutdown.
mountWorker(
  () => (
    <WorkerTasks<CoverageInput, CoverageReply>
      execute={(input) => ok(buildCoverageTables(input))}
      error={(cause) => documentError('decode', errorMessage(cause))}
      transfer={(value) => [value.offsets.buffer, value.areas.buffer, value.grids.buffer]}
    />
  ),
  self
);
