import { makeEventListener } from '@solid-primitives/event-listener';
import { onCleanup, Show } from 'solid-js';
import type { DocumentCamera } from '../../camera/createDocumentCamera';
import { useFrameLoop } from '../../scene/FrameLoop';
import { RenderLayer } from '../../scene/RenderLayer';
import type { SceneDraw } from '../../scene/renderScene';
import { useViewport } from '../../viewport/createViewport';
import { createFrame } from './createFrame';
import { useDocumentRenderer } from './DocumentRenderer';

/**
 * Draws the prepared document into this FrameLoop's canvas through `camera`, as a RenderLayer, once the renderer is
 * ready. Shared by GlyphText and VectorArtwork. Each mounted view streams its own visible images and tiles; unmounting
 * ends the view without affecting the renderer or other canvases.
 */
export function DocumentView(props: {
  /** Camera read on every draw; fixed for the view's lifetime. */
  camera: DocumentCamera;
  /** Draw only vectors instead of the engine's cached or atlas path. Default false. */
  vectorOnly?: boolean;
  /** Show the glyph grid overlay, where the engine supports it. Default false. */
  grids?: boolean;
  /** Higher values draw on top; equal values follow JSX order. Default 0. */
  order?: number;
  /** Skip drawing while retaining the view. Default true. */
  visible?: boolean;
}) {
  const { document, renderer } = useDocumentRenderer();
  const loop = useFrameLoop();
  const viewport = useViewport();
  const { camera } = props.camera;

  return (
    <Show when={renderer()} keyed>
      {(renderer) => {
        const view = renderer.createView();
        onCleanup(view.destroy);
        makeEventListener(renderer.events, 'change', loop.invalidate);

        const draw: SceneDraw = ({ pass, width, height }) =>
          view.draw(
            pass,
            createFrame(document, camera(), width, height, {
              vectorOnly: props.vectorOnly,
              grids: props.grids,
              displaySize: viewport.size().css
            })
          );

        return <RenderLayer draw={draw} order={props.order} visible={props.visible} />;
      }}
    </Show>
  );
}
