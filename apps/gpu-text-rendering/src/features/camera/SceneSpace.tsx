import type { JSX } from '@solidjs/web';
import { createContext, createEffect, useContext } from 'solid-js';
import { TokenContext } from '../../shared/jsx/TokenContext';
import { useFrameLoop } from '../scene/FrameLoop';
import { useViewport } from '../viewport/Viewport';
import { screenToWorld, worldToScreen, type Point } from './camera';
import { useDocumentCamera } from './DocumentCamera';

/**
 * Projects descendant graphics with DocumentCamera. Units match the document's first page, with y pointing up.
 * Spaces replace the parent coordinate system; they do not multiply nested transforms.
 */
export function DocumentSpace(props: { pageAspect: number; children: JSX.Element }) {
  const camera = useDocumentCamera();
  const viewport = useViewport();
  const loop = useFrameLoop();

  createEffect(
    () => props.pageAspect,
    () => loop.invalidate()
  );

  const space: SceneSpace = {
    toScreen(point) {
      const { css } = viewport.size();
      return worldToScreen(camera, point, css.width, css.height, props.pageAspect);
    },
    fromScreen(point) {
      const { css } = viewport.size();
      return screenToWorld(camera, point, css.width, css.height, props.pageAspect);
    },
    toClip(point) {
      return viewport.screenToClip(space.toScreen(point));
    }
  };

  return (
    <TokenContext context={SpaceContext} value={space}>
      {props.children}
    </TokenContext>
  );
}

/** Projects descendants in canvas-local CSS pixels, with y pointing down, independently of the camera and DPR. */
export function ScreenSpace(props: { children: JSX.Element }) {
  const viewport = useViewport();
  const space: SceneSpace = {
    toScreen: (point) => point,
    fromScreen: (point) => point,
    toClip: viewport.screenToClip
  };

  return (
    <TokenContext context={SpaceContext} value={space}>
      {props.children}
    </TokenContext>
  );
}

/** Reads the nearest coordinate system. Read transforms during each draw to include current camera changes. */
export function useSceneSpace() {
  return useContext(SpaceContext);
}

/** Shared projection contract for drawing and hit testing. */
export type SceneSpace = {
  toScreen: (point: Point) => Point;
  fromScreen: (point: Point) => Point;
  toClip: (point: Point) => Point;
};

const SpaceContext = createContext<SceneSpace>();
