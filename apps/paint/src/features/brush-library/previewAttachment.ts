import { attachStrokePreview } from '@app-game/paint-core/preview/client';
import { createContext } from 'solid-js';

/** Presentation-only preview connection. Galleries may supply deterministic samples without a worker or storage. */
export const PreviewAttachment =
  createContext<
    (canvas: HTMLCanvasElement) => Pick<ReturnType<typeof attachStrokePreview>, 'update' | 'pause' | 'dispose'>
  >(attachStrokePreview);
