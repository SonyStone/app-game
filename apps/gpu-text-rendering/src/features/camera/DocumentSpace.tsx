import type { JSX } from '@solidjs/web';
import { SceneSpaceProvider, type SceneSpace } from '../scene/SceneSpace';
import { useViewport } from '../viewport/Viewport';
import { screenToWorld, worldToScreen } from './camera';
import { useDocumentCamera } from './DocumentCamera';

/**
 * Projects descendant graphics with DocumentCamera. Units match the document's first page, with y pointing up.
 * Spaces replace the parent coordinate system; they do not multiply nested transforms.
 */
export function DocumentSpace(props: { children: JSX.Element }) {
  const { camera, pageAspect } = useDocumentCamera();
  const viewport = useViewport();

  const space: SceneSpace = {
    toScreen(point) {
      const { css } = viewport.size();
      return worldToScreen(camera(), point, css.width, css.height, pageAspect());
    },
    fromScreen(point) {
      const { css } = viewport.size();
      return screenToWorld(camera(), point, css.width, css.height, pageAspect());
    },
    toClip: (point) => viewport.screenToClip(space.toScreen(point))
  };

  return <SceneSpaceProvider space={space}>{props.children}</SceneSpaceProvider>;
}
