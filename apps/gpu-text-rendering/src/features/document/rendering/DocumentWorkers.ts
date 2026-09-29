import type { buildCoverage } from '../documentWorkerProtocol';
import type { createRasterWorker } from './curves/createRasterWorker';

/** Transports supplied by the renderer's owner. All transports are required; calculations never create workers. */
export type DocumentWorkers = {
  /** Serial image decoder with a cached source; destroy() is permanent and owned by the supplier. */
  raster: ReturnType<typeof createRasterWorker>;
  /**
   * Builds coverage tables in a fresh worker per call, typically `(input) => buildCoverage(input, { signal })`;
   * the supplier's signal cancels pending calls.
   */
  coverage: (input: Parameters<typeof buildCoverage>[0]) => ReturnType<typeof buildCoverage>;
};
