import { attachStrokePreview } from '@app-game/paint-core/preview/client';
import type { BrushTipImage } from '../../lib/abr';
import type { PreviewResourceSource } from './resources';
import type { PreviewInput } from './stroke';

/** Adapts editor form snapshots to the shared Paint engine preview service. Input packets bypass this adapter. */
export function attachPreview(canvas: HTMLCanvasElement) {
  const connection = attachStrokePreview(canvas);
  return {
    ...connection,
    update(
      input: PreviewInput,
      tip: BrushTipImage | undefined,
      priority: number,
      resources: PreviewResourceSource = {},
      thumbnail = false
    ) {
      connection.update({
        kind: 'abr',
        input,
        tip,
        resources,
        priority,
        thumbnail,
        width: input.width,
        height: input.height,
        dpr: input.dpr,
        background: input.background
      });
    }
  };
}
