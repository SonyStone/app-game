import type { BrushTipImage } from '../../lib/abr';
import type { PreviewResourceSource } from './resources';
import type { PreviewInput } from './stroke';

/** A job is self-contained except for a cached tip, supplied on a cache miss. */
export type PreviewJob = {
  id: number;
  input: PreviewInput;
  tipKey: string;
  tip?: BrushTipImage;
  auxKey?: string;
  resources?: PreviewResourceSource;
};

/** Worker replies transfer ownership of completed bitmaps to the UI. */
export type PreviewReply =
  | { type: 'image'; id: number; bitmap: ImageBitmap; backend: 'gpu' | 'cpu'; reason?: string }
  | { type: 'need-tip'; id: number }
  | { type: 'error'; id: number; message: string };
