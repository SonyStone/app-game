import { createEffect, type Accessor } from 'solid-js';
import { useDocumentCamera } from '../../camera/DocumentCamera';
import { useFrameLoop } from '../../scene/FrameLoop';
import type { SceneDraw } from '../../scene/renderScene';
import { useViewport } from '../../viewport/Viewport';
import { createFrame } from './createFrame';
import { useDocumentRenderer } from './DocumentRendererProvider';

/**
 * Creates a stable draw callback and invalidates the loop when option accessors change.
 * Call once beneath DocumentRendererProvider, DocumentCamera, Viewport and FrameLoop.
 * The owner disposes the effect; RenderLayer describes participation in the scene and the provider owns GPU resources.
 */
export function createDocumentDraw(
  options: {
    /** Reads the vector-only setting; defaults to false. */
    vectorOnly?: Accessor<boolean>;
    /** Reads the grid overlay setting; defaults to false. */
    grids?: Accessor<boolean>;
  } = {}
): SceneDraw {
  const { document, renderer } = useDocumentRenderer();
  const camera = useDocumentCamera();
  const loop = useFrameLoop();
  const viewport = useViewport();

  createEffect(
    () => [options.vectorOnly?.(), options.grids?.()],
    () => loop.invalidate()
  );

  const draw: SceneDraw = ({ pass, width, height }) => {
    const frame = createFrame(
      document,
      camera,
      width,
      height,
      options.vectorOnly?.(),
      options.grids?.(),
      viewport.size().css
    );

    return renderer.draw(pass, frame);
  };

  return draw;
}
