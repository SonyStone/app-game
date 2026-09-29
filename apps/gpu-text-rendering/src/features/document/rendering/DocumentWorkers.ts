import type { DocumentError } from '../../../shared/errors';
import type { WorkerRequest } from '../../../shared/worker/runWorkerRequest';
import type { buildCoverageTables, CoverageTables } from './curves/buildCoverageTables';
import type { createRasterWorker } from './curves/createRasterWorker';

/** Transports supplied by the renderer's owner. All transports are required; calculations never create workers. */
export type DocumentWorkers = {
  raster: ReturnType<typeof createRasterWorker>;
  coverage: WorkerRequest<Parameters<typeof buildCoverageTables>[0], CoverageTables, DocumentError>;
};
