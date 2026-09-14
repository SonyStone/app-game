import type { sampledTipTransform } from '@app-game/abr-brush/sampledTipRaster';

/** Actual, non-predicted input in document space. Mouse pressure is normalized by the input adapter. */
export type Sample = { x: number; y: number } & {
  /** Retains device capability information through smoothing and worker transfer. */
  pointerType?: string;
  pressure: number;
  time: number;
  /** Tablet tilt in degrees and clockwise barrel rotation, when available. */
  tiltX?: number;
  tiltY?: number;
  rotation?: number;
  tangentialPressure?: number;
};
/** A GPU-ready round brush stamp, in document pixels. */
export type Dab = { x: number; y: number } & {
  radius: number;
  flow: number;
  /** Packed ABR bounds/transform/dynamics/color. Radius is the conservative tile-culling extent. */
  abr?: {
    data: Float32Array;
    secondary: boolean;
    /** Detailed stamp intervals represented by this adaptive stamp; omitted means one. */
    spacingRatio?: number;
    /** Double-precision raster geometry in document coordinates.
     * Secondary preset source-rectangle preparation is not yet Photoshop-verified.
     */
    sampledTip?: ReturnType<typeof sampledTipTransform>;
    /** Per-stamp Mixer Brush dynamics, independent of flow and opacity. */
    mixing?: { wet: number; mix: number };
  };
};

/** Tile side expected by the raster kernels, in document pixels. */
export const TILE_SIZE = 256;
