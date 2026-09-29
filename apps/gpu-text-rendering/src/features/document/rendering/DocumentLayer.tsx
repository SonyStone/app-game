import { makeEventListener } from '@solid-primitives/event-listener';
import { onCleanup } from 'solid-js';
import { useDocumentCamera } from '../../camera/DocumentCamera';
import { useFrameLoop } from '../../scene/FrameLoop';
import { RenderLayer } from '../../scene/RenderLayer';
import type { SceneDraw } from '../../scene/renderScene';
import { useViewport } from '../../viewport/Viewport';
import { createFrame } from './createFrame';
import type { TextRenderer } from './createTypeGpuRenderer';
import { useDocumentRenderer } from './DocumentRendererProvider';

/**
 * Draws the nearest prepared document beneath DocumentRendererProvider, DocumentCamera, Viewport and FrameLoop.
 * Options remain reactive; removing the layer releases its subscriptions, while the provider owns GPU resources.
 * Mount at most one DocumentLayer per provider: the renderer has one view uniform, so a second layer would make
 * both draw with the last-written frame. Development builds throw when a second layer mounts.
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
  if (import.meta.env.DEV) {
    claimRenderer(renderer);
  }
  const camera = useDocumentCamera();
  const loop = useFrameLoop();
  const viewport = useViewport();

  makeEventListener(renderer.events, 'change', loop.invalidate);

  const draw: SceneDraw = ({ pass, width, height }) =>
    renderer.draw(
      pass,
      createFrame(document, camera, width, height, {
        vectorOnly: props.vectorOnly,
        grids: props.grids,
        displaySize: viewport.size().css
      })
    );

  return <RenderLayer draw={draw} order={props.order} visible={props.visible} />;
}

/** Renderers with a mounted layer; development-only guard for the one-layer-per-provider contract. */
const claimedRenderers = new WeakSet<TextRenderer>();

function claimRenderer(renderer: TextRenderer) {
  if (claimedRenderers.has(renderer)) {
    throw new Error('Only one DocumentLayer can draw a DocumentRendererProvider; add another provider instead');
  }
  claimedRenderers.add(renderer);
  onCleanup(() => claimedRenderers.delete(renderer));
}
