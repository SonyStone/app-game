import { defineDocumentFeature } from '@app-game/paint-core/composition/documentFeature';
import { z } from 'zod';

/**
 * Frames as a document feature, the engine half of the frames module: named rectangles on the infinite canvas, like
 * artboards, saved with the document, and the frame the editor works in. A command replaces the whole list; frame
 * changes are not undo steps.
 */
export const framesFeature = defineDocumentFeature({
  id: 'frames',
  parse: (input: unknown): FramesData => framesSchema.parse(input),
  initial: (): FramesData => ({ frames: [] }),
  commands: {
    parse: (input: unknown): FramesData => framesSchema.parse(input),
    apply: (_previous, next) => next
  }
});

const frameSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(64),
  left: z.number().finite(),
  top: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive()
});

const framesSchema = z.object({
  frames: z.array(frameSchema).max(256),
  /** The frame the editor works in; absent for the whole canvas. */
  active: z.string().optional()
});

/** A named rectangle on the canvas, in document pixels. */
export type Frame = z.infer<typeof frameSchema>;

/** The document's frames and the active one. */
export type FramesData = z.infer<typeof framesSchema>;
