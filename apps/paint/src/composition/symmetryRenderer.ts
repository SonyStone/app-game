import { symmetryDabs, symmetryTransforms, type PaintSymmetry } from '../symmetry';
import type { PaintRenderer } from './contracts';

/** Decorates the borrowed renderer for one paint stroke; all copies share one commit/cancel and tile history.
 * Does not create GPU resources. The runtime only installs it for supported paint tools.
 */
export function symmetryRenderer(renderer: PaintRenderer, symmetry: PaintSymmetry): PaintRenderer {
  const transforms = symmetryTransforms(symmetry);
  if (transforms.length === 1) return renderer;
  return {
    ...renderer,
    paint: (dabs) => renderer.paint(symmetryDabs(dabs, transforms)),
    preview: (dabs) => renderer.preview(symmetryDabs(dabs, transforms))
  };
}
