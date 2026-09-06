import type { Brush, Sample } from './brush';
import type { Camera, ViewSize } from './camera';
import type { LayerAction, createDocument } from './document';

/** Main-thread commands are processed in order; all sample batches precede their stroke end. */
export type PaintCommand =
  | { type: 'init'; canvas: OffscreenCanvas; size: ViewSize; dpr: number; storageName?: string }
  | { type: 'debug'; enabled: boolean }
  | { type: 'view'; camera: Camera; size: ViewSize; dpr: number }
  | { type: 'begin'; brush: Brush; samples: Sample[]; zoom?: number }
  | { type: 'samples'; samples: Sample[] }
  | { type: 'end' | 'cancel' | 'undo' | 'redo' | 'save' | 'download' | 'png' | 'recover' | 'dispose' }
  | { type: 'layer'; action: LayerAction }
  | { type: 'import'; text: string }
  | { type: 'import'; file: Blob };

/** Lightweight worker status; document pixels are sent only for explicit file downloads. */
export type PaintEvent =
  | {
      type: 'state';
      document: ReturnType<ReturnType<typeof createDocument>['state']>;
      camera: Camera;
      saved: boolean;
      /** Active strokes are unsaved; saving means a completed checkpoint is being written. */
      saveState: 'saved' | 'unsaved' | 'saving';
      gpuBytes: number;
      storage?: {
        ramBytes: number;
        dirtyBytes: number;
        reads: number;
        writes: number;
        pendingLoads: number;
        overviewReads: number;
        overviewWrites: number;
        overviewDirty: number;
        overviewDirtyBytes: number;
      };
      /** Last submitted frame's individual tile draws; virtual page draws are reported separately. */
      rasterDraws?: { preview: number; committed: number };
      /** Bounded staging memory for asynchronous eviction snapshots, included in gpuBytes. */
      readback?: { buffers: number; pending: number; bytes: number; batches: number; capacityWaits: number };
      residentTiles: number;
      renderMs: number;
      debugTiles?: string[];
      debugPages?: (import('./virtualPages').VirtualPage & { resident: boolean; fallback: boolean })[];
      virtual?: {
        workYields: number;
        peakWorkCpuMs: number;
        peakWorkOperations: number;
        peakUploadBytes: number;
        activePageJobs: number;
        coveragePages: number;
        coveragePending: number;
        overviewBytes: number;
        builtPages: number;
        restoredPages: number;
        pages: number;
        pending: number;
        uploadedBytes: number;
        drawCalls: number;
        fallbackPages: number;
        gpuBytes: number;
      };
    }
  | { type: 'ready' }
  | { type: 'disposed' }
  | { type: 'restored'; camera: Camera }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'download'; blob: Blob; name: string };
