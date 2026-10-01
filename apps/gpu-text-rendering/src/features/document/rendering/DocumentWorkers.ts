import type { buildCoverage } from '../documentWorkerProtocol';
import type { createDetailTableWorker } from './curves/createDetailTableWorker';
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
  /**
   * Serial builder of magnified coverage tables; destroy() is permanent and owned by the supplier. Without it,
   * magnified text keeps integrating source cubics in every pixel.
   */
  tables?: ReturnType<typeof createDetailTableWorker>;
};
