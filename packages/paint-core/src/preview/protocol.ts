import type { BrushTipImage } from '@app-game/abr-brush/library';
import type { PreviewResourceSource } from '@app-game/abr-brush/resources';
import type { PreviewInput, PreviewPoint } from '@app-game/abr-brush/stroke';
import type { BrushResource } from '@app-game/abr-paint/resources';
import type { Brush } from '../brush';

/** A tiny document. ABR form snapshots and decoded Paint presets use the same engine registry. */
export type PreviewConfiguration = {
  /** Output width in backing pixels. */
  width: number;
  /** Output height in backing pixels. */
  height: number;
  /** Backing pixels per CSS/document pixel. Engine geometry stays in document pixels. */
  dpr: number;
  background: string;
  /** Higher priorities run first. Interactive contact suspends thumbnail work. */
  priority?: number;
  /** Persist only completed sample images, never intermediate gesture frames. */
  thumbnail?: boolean;
} & (
  | { kind: 'abr'; input: PreviewInput; tip?: BrushTipImage; resources?: PreviewResourceSource }
  | { kind: 'brush'; brush: Partial<Brush>; resources?: readonly BrushResource[] }
);

/** Ordered input packets carry only newly received normalized samples; settings travel at contact. */
export type PreviewJob = {
  id: number;
  target: number;
  revision: number;
  action: 'sample' | 'begin' | 'add' | 'finish' | 'cancel';
  configuration?: PreviewConfiguration;
  points: PreviewPoint[];
  elapsedMs?: number;
  end?: boolean;
};

/** Each transferred bitmap has exactly one UI owner. */
export type PreviewReply =
  | { type: 'image'; id: number; bitmap: ImageBitmap; reason?: string; renderMs: number; idle?: boolean }
  | { type: 'done'; id: number }
  | { type: 'error'; id: number; message: string };
