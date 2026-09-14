import { z } from 'zod/v3';

/** Small, cloneable idle actions. Coordinates are document pixels, independent of camera transform. */
export const abrBrushCommand = z.union([
  z.enum(['load', 'clean']),
  z
    .object({
      type: z.literal('load-canvas'),
      point: z.object({ x: z.number().finite(), y: z.number().finite() }).strict()
    })
    .strict()
]);

/** UI and engine share this transport contract; the engine still validates every received action. */
export type AbrBrushCommand = z.infer<typeof abrBrushCommand>;
