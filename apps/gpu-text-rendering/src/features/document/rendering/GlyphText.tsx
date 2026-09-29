import { createGlyphRenderer } from './createTypeGpuRenderer';
import { DocumentEngine } from './DocumentEngine';
import { useDocumentRenderer } from './DocumentRenderer';

/**
 * Engine for glyph documents, such as the bundled demo: instanced glyph quads sampled from a glyph atlas over the
 * page paper. Mount beneath DocumentRenderer with a glyph document; other kinds are a programming error.
 */
export function GlyphText(props: {
  /** Evaluate glyph outlines directly instead of sampling the atlas. Default false. */
  vectorOnly?: boolean;
  /** Overlay each glyph's coverage grid and control points for debugging. Default false. */
  grids?: boolean;
  /** Higher values draw on top; equal values follow JSX order. Default 0. */
  order?: number;
  /** Skip drawing while retaining the prepared renderer. Default true. */
  visible?: boolean;
}) {
  const { document } = useDocumentRenderer();

  if (document.kind !== 'glyphs') {
    throw new Error('GlyphText draws glyph documents; use VectorArtwork for curve documents');
  }

  return (
    <DocumentEngine
      create={(gpu, { signal }) => createGlyphRenderer(gpu, document, { signal })}
      vectorOnly={props.vectorOnly}
      grids={props.grids}
      order={props.order}
      visible={props.visible}
    />
  );
}
