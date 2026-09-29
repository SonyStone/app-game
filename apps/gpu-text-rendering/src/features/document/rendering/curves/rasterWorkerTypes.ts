import type { WorkerReply } from '../../../../shared/worker/workerProtocol';
import type { Tile } from './virtualTiles';

/** Jobs carry at most sixteen tiles. The worker retains only the current image's decoded pyramid. */
export type RasterRequest = {
  id: number;
  bytes?: ArrayBuffer;
  width: number;
  height: number;
  codec: number;
  tailLevel?: number;
  /** Finest visible mip, including tiles queued after this bounded batch. */
  decodeLevel?: number;
  tiles: Tile[];
};

/** Transferable pixels, independent of any GPU allocation or residency decision. */
export type RasterReply = {
  id: number;
  tail?: { width: number; height: number; pixels: ArrayBuffer };
  tiles: { tile: Tile; pixels: ArrayBuffer }[];
};

/** Shared terminal response for the raster worker. */
export type RasterWorkerReply = WorkerReply<RasterReply, string>;
