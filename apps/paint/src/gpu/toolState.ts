import { z } from 'zod/v3';

/** Ephemeral renderer handoff, separate from document checkpoints and ABR preset settings.
 * Mixer pixels are three exact rgba16float images: reservoir, pickup, then the Auto Load source.
 * The fixed 1.5 MiB payload preserves low-alpha pigment without an 8-bit conversion.
 */
export const rendererToolState = z
  .object({
    version: z.literal(1),
    mixer: z
      .object({
        key: z.string().min(1).max(1024),
        color: z.string().regex(/^#[\da-f]{6}$/i),
        remaining: z.number().finite().min(0).max(1),
        settings: z
          .object({
            load: z.number().finite().min(0).max(1),
            autoFill: z.boolean(),
            autoClean: z.boolean()
          })
          .strict(),
        pixels: z
          .instanceof(Uint8Array)
          .refine(
            (value) => value.byteLength === 3 * 256 * 256 * 8,
            'Mixer handoff must contain three 256×256 rgba16float images.'
          )
      })
      .strict()
      .optional()
  })
  .strict();

/** Structured-cloneable tool state, retained only while replacing a renderer. */
export type RendererToolState = z.infer<typeof rendererToolState>;
