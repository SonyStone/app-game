import type { JSX } from '@solidjs/web';
import { SceneSpaceProvider, type SceneSpace } from '../scene/SceneSpace';
import { useViewport } from '../viewport/createViewport';
import { screenToWorld, worldToScreen } from './camera';
import type { DocumentCamera } from './createDocumentCamera';

/**
 * Projects descendant graphics through a document camera. Units match the document's first page, with y pointing up.
 * Spaces replace the parent coordinate system; they do not multiply nested transforms. Mount beneath FrameLoop.
 */
export function DocumentSpace(props: {
  /** Camera whose current value every projection reads; fixed for the subtree. */
  camera: DocumentCamera;
  children: JSX.Element;
}) {
  const { camera, pageAspect } = props.camera;
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
