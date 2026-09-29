import type { DocumentCamera } from '../../camera/createDocumentCamera';
import { useDocumentRenderer } from './DocumentRenderer';
import { DocumentView } from './DocumentView';

/**
 * Draws a curve document, such as an imported PDF, into this FrameLoop's canvas: vector outlines, streamed images,
 * transparency groups and cached page tiles. Mount beneath DocumentRenderer and FrameLoop; other kinds are a
 * programming error.
 */
export function VectorArtwork(props: {
  /** Camera of this canvas; fixed for the view's lifetime. */
  camera: DocumentCamera;
  /** Paint every page directly instead of using cached page tiles, for diagnostics. Default false. */
  vectorOnly?: boolean;
  /** Higher values draw on top; equal values follow JSX order. Default 0. */
  order?: number;
  /** Skip drawing while retaining the view. Default true. */
  visible?: boolean;
}) {
  if (useDocumentRenderer().document.kind !== 'curves') {
    throw new Error('VectorArtwork draws curve documents; use GlyphText for glyph documents');
  }

  return (
    <DocumentView camera={props.camera} vectorOnly={props.vectorOnly} order={props.order} visible={props.visible} />
  );
}
