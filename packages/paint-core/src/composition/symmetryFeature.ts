import { defaultPaintSymmetry, paintSymmetrySchema, supportsPaintSymmetry, type PaintSymmetry } from '../symmetry';
import { defineDocumentFeature } from './documentFeature';
import { symmetryRenderer } from './symmetryRenderer';

/**
 * Paint symmetry as a document feature: guide settings saved with the document, replaced by a command carrying the
 * new settings, and mirrored copies of strokes for the tools that support them.
 */
export const symmetryFeature = defineDocumentFeature({
  id: 'symmetry',
  parse: (input: unknown): PaintSymmetry => paintSymmetrySchema.parse(input),
  initial: defaultPaintSymmetry,
  commands: {
    parse: (input: unknown): PaintSymmetry => paintSymmetrySchema.parse(input),
    apply: (_previous, next) => next
  },
  decorateStroke: ({ data, brush, renderer }) =>
    supportsPaintSymmetry(brush) ? symmetryRenderer(renderer, data) : renderer
});
