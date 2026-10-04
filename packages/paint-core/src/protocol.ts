import type { RendererToolState } from '@app-game/abr-paint/gpu/toolState';
import type { BrushResource, createBrushResources } from '@app-game/abr-paint/resources';
import type { GpuError } from '@app-game/solid-gpu/errors';
import type { Result } from './asyncResult';
import type { Brush, Sample } from './brush';
import type { Camera, Point, ViewSize } from './camera';
import type { BrushEngine } from './composition/contracts';
import type { HistorySource, LayerAction, createDocument } from './document';

/** Main-thread commands are processed in order; all sample batches precede their stroke end. */
export type PaintCommand =
  | {
      type: 'init';
      canvas: OffscreenCanvas;
      size: ViewSize;
      dpr: number;
      storageName?: string;
      /** Opt-in frame/input timing for diagnostic clients; disabled in the editor by default. */
      diagnostics?: boolean;
      tools?: RendererToolState;
      historySource?: HistorySource;
    }
  | ({ type: 'brush-resources'; requestId: string } & (
      | { action: 'put'; resource: BrushResource }
      | { action: 'delete'; id: string }
      | { action: 'stats' }
    ))
  | { type: 'debug'; enabled: boolean }
  | { type: 'diagnostics'; enabled: boolean }
  /** Changes the data of a document feature registered with `DocumentFeatures`; see `defineDocumentFeature`. */
  | { type: 'feature'; feature: string; command: unknown }
  | { type: 'history-source'; id: number }
  | { type: 'brush-command'; requestId: string; brush: Brush; command: unknown }
  /** Reads the presented color, all layers and the paper included, at `point` in CSS pixels of the primary canvas. */
  | { type: 'pick-color'; requestId: string; point: Point }
  | { type: 'live-tail'; enabled: boolean }
  | { type: 'adaptive-quality'; enabled: boolean }
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
  /** Runs a pixel edit registered with `DocumentFeatures`, such as a bucket fill; see `defineDocumentEdit`. */
  | { type: 'edit'; edit: string; command: unknown }
  | { type: 'import'; text: string }
  | { type: 'import'; file: Blob };

/** Starts a runtime on a transferred canvas; the first command of every worker connection. */
export type InitCommand = Extract<PaintCommand, { type: 'init' }>;

/** Local execution accepts a DOM canvas; the worker protocol only permits a transferable canvas. */
export type PaintRuntimeCommand =
  | Exclude<PaintCommand, { type: 'init' }>
  | (Omit<InitCommand, 'canvas'> & { canvas: OffscreenCanvas | HTMLCanvasElement });

/** Lightweight status; pixel payloads are limited to explicit downloads and requested tool handoffs. */
export type PaintEvent =
  | {
      type: 'frame';
      /** Original input-clock timestamp of the last fully processed sample batch, if any. */
      processedInputTime?: number;
      /** Original input-clock timestamp of the newest received sample, including queued work. */
      receivedInputTime?: number;
      /** CPU time submitting this frame, excluding queue completion. */
      renderMs: number;
      /** Wall time waiting for submitted GPU work, not a GPU timestamp measurement. */
      queueWaitMs: number;
    }
  | {
      type: 'state';
      /** Data of the runtime's document features, such as paint symmetry, by feature ID. */
      features?: Record<string, unknown>;
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
  /** The `#rrggbb` color at a `pick-color` point. */
  | { type: 'picked-color'; requestId: string; result: Result<string, string> }
  | { type: 'checkpointed'; tools?: RendererToolState; historySource?: HistorySource }
  | { type: 'selection'; points: Point[]; hasClipboard: boolean }
  | { type: 'disposed' }
  /** A document was imported; UI state derived from its camera and feature data resets to them. */
  | { type: 'restored'; camera: Camera; features?: Record<string, unknown> }
  /**
   * `code` classifies renderer failures, for example `validation` versus a `lost` device. `background` marks a failure
   * of autosave or storage cleanup rather than of a command, so a stroke or checkpoint in progress is unaffected.
   */
  | { type: 'error'; message: string; recoverable: boolean; code?: GpuError['code']; background?: boolean }
  | { type: 'download'; blob: Blob; name: string };

/** Document, storage and performance status posted after changes and frames. */
export type StateEvent = Extract<PaintEvent, { type: 'state' }>;

/** Lasso outline and clipboard availability after a selection command. */
export type SelectionEvent = Extract<PaintEvent, { type: 'selection' }>;

/** Renderer tool state and the Erase to History source, handed from a checkpointed runtime to its replacement. */
export type CheckpointedEvent = Extract<PaintEvent, { type: 'checkpointed' }>;

/** Clipboard is private to this editor session; paste writes into the active layer at the copied coordinates. */
export type SelectionAction = 'copy' | 'cut' | 'paste' | 'delete' | 'move' | 'new-layer';
