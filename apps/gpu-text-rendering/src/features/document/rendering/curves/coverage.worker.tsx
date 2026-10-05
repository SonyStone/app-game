import { errorMessage } from '@app-game/solid-gpu/errors';
import { mountWorker, WorkerTasks } from '@app-game/solid-gpu/worker';
import { ok } from 'neverthrow';
import { documentError } from '../../../../shared/errors';
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
