import type { Result } from './asyncResult';
import type { Brush, Sample } from './brush';
import type { Camera, Point, ViewSize } from './camera';
import type { BrushResource, createBrushResources } from './composition/brushResources';
import type { BrushEngine } from './composition/contracts';
import type { HistorySource, LayerAction, createDocument } from './document';
import type { RendererToolState } from './gpu/toolState';
import type { PaintSymmetry } from './symmetry';

/** Main-thread commands are processed in order; all sample batches precede their stroke end. */
export type PaintCommand =
  | {
      type: 'init';
      canvas: OffscreenCanvas;
      size: ViewSize;
      dpr: number;
      storageName?: string;
      tools?: RendererToolState;
      historySource?: HistorySource;
    }
  | ({ type: 'brush-resources'; requestId: string } & (
      | { action: 'put'; resource: BrushResource }
      | { action: 'delete'; id: string }
      | { action: 'stats' }
    ))
  | { type: 'debug'; enabled: boolean }
  | { type: 'symmetry'; settings: PaintSymmetry }
  | { type: 'history-source'; id: number }
  | { type: 'brush-command'; requestId: string; brush: Brush; command: unknown }
  | { type: 'live-tail'; enabled: boolean }
  | { type: 'selection-view'; points: Point[]; animate: boolean }
  | { type: 'view'; camera: Camera; size: ViewSize; dpr: number }
  | {
      type: 'begin';
      brush: Brush;
      samples: Sample[];
      zoom?: number;
      /** Captured at contact and fixed for this stroke; never persisted with the preset. */
      modifiers?: Parameters<BrushEngine>[0]['modifiers'];
    }
  | { type: 'samples'; samples: Sample[] }
  | { type: 'checkpoint'; includeTools?: boolean }
  | { type: 'end' | 'cancel' | 'undo' | 'redo' | 'save' | 'download' | 'png' | 'recover' | 'dispose' }
  | { type: 'layer'; action: LayerAction }
  | { type: 'selection'; action: SelectionAction; points: Point[]; offset?: Point; layerId: string; revision: number }
  | { type: 'import'; text: string }
  | { type: 'import'; file: Blob };

/** Local execution accepts a DOM canvas; the worker protocol only permits a transferable canvas. */
export type PaintRuntimeCommand =
  | Exclude<PaintCommand, { type: 'init' }>
  | (Omit<Extract<PaintCommand, { type: 'init' }>, 'canvas'> & { canvas: OffscreenCanvas | HTMLCanvasElement });

/** Lightweight status; pixel payloads are limited to explicit downloads and requested tool handoffs. */
export type PaintEvent =
  | {
      type: 'state';
      /** Document-owned guides and painting transforms. Absent from older/custom endpoints. */
      symmetry?: PaintSymmetry;
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
  | {
      type: 'brush-resources';
      requestId: string;
      /** Acknowledges uploads/removals independently of document saving. Failure leaves the cache unchanged. */
      result: Result<
        { evicted: string[]; stats: ReturnType<ReturnType<typeof createBrushResources>['stats']> },
        string
      >;
    }
  | { type: 'ready' }
  | { type: 'brush-command'; requestId: string; result: Result<void, string> }
  | { type: 'checkpointed'; tools?: RendererToolState; historySource?: HistorySource }
  | { type: 'selection'; points: Point[]; hasClipboard: boolean }
  | { type: 'disposed' }
  | { type: 'restored'; camera: Camera; symmetry?: PaintSymmetry }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'download'; blob: Blob; name: string };

/** Clipboard is private to this editor session; paste writes into the active layer at the copied coordinates. */
export type SelectionAction = 'copy' | 'cut' | 'paste' | 'delete' | 'move' | 'new-layer';
