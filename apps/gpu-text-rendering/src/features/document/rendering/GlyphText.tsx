import type { DocumentCamera } from '../../camera/createDocumentCamera';
import { useDocumentRenderer } from './DocumentRenderer';
import { DocumentView } from './DocumentView';

/**
 * Draws a glyph document, such as the bundled demo, into this FrameLoop's canvas: instanced glyph quads sampled from
 * a glyph atlas over the page paper. Mount beneath DocumentRenderer and FrameLoop; other kinds are a programming error.
 */
export function GlyphText(props: {
  /** Camera of this canvas; fixed for the view's lifetime. */
  camera: DocumentCamera;
  /** Evaluate glyph outlines directly instead of sampling the atlas. Default false. */
  vectorOnly?: boolean;
  /** Overlay each glyph's coverage grid and control points for debugging. Default false. */
  grids?: boolean;
  /** Higher values draw on top; equal values follow JSX order. Default 0. */
  order?: number;
  /** Skip drawing while retaining the view. Default true. */
  visible?: boolean;
}) {
  if (useDocumentRenderer().document.kind !== 'glyphs') {
    throw new Error('GlyphText draws glyph documents; use VectorArtwork for curve documents');
  }

  return (
    <DocumentView
      camera={props.camera}
      vectorOnly={props.vectorOnly}
      grids={props.grids}
      order={props.order}
      visible={props.visible}
    />
  );
}
