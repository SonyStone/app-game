import type { ProtocolRequest } from '../../../shared/worker/runWorkerRequest';
import type { CoverageInput, CoverageReply } from '../documentWorkerProtocol';
import type { createRasterWorker } from './curves/createRasterWorker';

/** Transports supplied by the renderer's owner. All transports are required; calculations never create workers. */
export type DocumentWorkers = {
  /** Serial image decoder with a cached source; destroy() is permanent and owned by the supplier. */
  raster: ReturnType<typeof createRasterWorker>;
  /** Builds coverage tables in a fresh worker per call; the supplier's lifetime cancels pending calls. */
  coverage: ProtocolRequest<CoverageInput, CoverageReply>;
};
