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
  | { type: 'import'; text: string };

/** Lightweight worker status; document pixels are sent only for explicit file downloads. */
export type PaintEvent =
  | {
      type: 'state';
      document: ReturnType<ReturnType<typeof createDocument>['state']>;
      camera: Camera;
      saved: boolean;
      gpuBytes: number;
      residentTiles: number;
      renderMs: number;
      debugTiles?: string[];
    }
  | { type: 'ready' }
  | { type: 'disposed' }
  | { type: 'restored'; camera: Camera }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'download'; blob: Blob; name: string };
