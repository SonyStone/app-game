import { makeEventListener } from '@solid-primitives/event-listener';
import { createEffect } from 'solid-js';
import { useDocumentCamera } from '../../camera/DocumentCamera';
import { useFrameLoop } from '../../scene/FrameLoop';
import { RenderLayer } from '../../scene/RenderLayer';
import type { SceneDraw } from '../../scene/renderScene';
import { useViewport } from '../../viewport/Viewport';
import { createFrame } from './createFrame';
import { useDocumentRenderer } from './DocumentRendererProvider';

/**
 * Draws the nearest prepared document beneath DocumentRendererProvider, DocumentCamera, Viewport and FrameLoop.
 * Options remain reactive; removing the layer releases its subscriptions, while the provider owns GPU resources.
 */
export function DocumentLayer(props: {
  /** Draw only vectors instead of the glyph atlas. Default false. */
  vectorOnly?: boolean;
  /** Show the glyph grid overlay. Default false. */
  grids?: boolean;
  /** Higher values draw on top; equal values follow JSX order. Default 0. */
  order?: number;
  /** Skip drawing while retaining the prepared document. Default true. */
  visible?: boolean;
}) {
  const { document, renderer } = useDocumentRenderer();
  const camera = useDocumentCamera();
  const loop = useFrameLoop();
  const viewport = useViewport();

  makeEventListener(renderer.events, 'change', loop.invalidate);
  createEffect(() => [props.vectorOnly, props.grids], loop.invalidate);

  const draw: SceneDraw = ({ pass, width, height }) =>
    renderer.draw(
      pass,
      createFrame(document, camera, width, height, props.vectorOnly, props.grids, viewport.size().css)
    );

  return <RenderLayer draw={draw} order={props.order} visible={props.visible} />;
}
