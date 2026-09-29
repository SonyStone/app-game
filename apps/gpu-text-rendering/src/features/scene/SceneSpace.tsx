import type { JSX } from '@solidjs/web';
import { createContext, useContext } from 'solid-js';
import { TokenContext } from '../../shared/jsx/TokenContext';
import { useViewport } from '../viewport/createViewport';

/**
 * Provides a coordinate system to descendant graphics while preserving their draw tokens for FrameLoop.
 * Spaces replace the parent coordinate system; they do not multiply nested transforms. The space object is fixed
 * for the subtree, so it reads changing state such as a camera inside its projections.
 */
export function SceneSpaceProvider(props: { space: SceneSpace; children: JSX.Element }) {
  return (
    <TokenContext context={SpaceContext} value={props.space}>
      {props.children}
    </TokenContext>
  );
}

/** Projects descendants in canvas-local CSS pixels, with y pointing down, independently of the camera and DPR. */
export function ScreenSpace(props: { children: JSX.Element }) {
  const viewport = useViewport();

  return (
    <SceneSpaceProvider
      space={{ toScreen: (point) => point, fromScreen: (point) => point, toClip: viewport.screenToClip }}
    >
      {props.children}
    </SceneSpaceProvider>
  );
}

/**
 * Projects descendants through an affine map onto canvas-local CSS pixels. The transform is reactive: projections read
 * the current value, so drawing and hit testing follow its changes.
 */
export function AffineSpace(props: { transform: AffineTransform; children: JSX.Element }) {
  const viewport = useViewport();

  return (
    <SceneSpaceProvider space={makeAffineSpace(() => props.transform, viewport.screenToClip)}>
      {props.children}
    </SceneSpaceProvider>
  );
}

/** Reads the nearest coordinate system. Read transforms during each draw to include current camera changes. */
export function useSceneSpace() {
  return useContext(SpaceContext);
}

/** Shared projection contract for drawing and hit testing. */
export type SceneSpace = {
  /** Converts local units to canvas-local CSS pixels. */
  toScreen: (point: Point) => Point;
  /** Converts canvas-local CSS pixels to local units. */
  fromScreen: (point: Point) => Point;
  /** Converts local units to WebGPU clip coordinates. */
  toClip: (point: Point) => Point;
};

/** A 2D point. Canvas-local CSS points have y pointing down; other spaces define their own units. */
export type Point = { x: number; y: number };

/**
 * Creates a space mapping a local point to `origin + x * axisX + y * axisY` in canvas-local CSS pixels.
 * `transform` is read on every projection; a degenerate transform makes fromScreen return non-finite points.
 */
export function makeAffineSpace(transform: () => AffineTransform, screenToClip: (point: Point) => Point): SceneSpace {
  const space: SceneSpace = {
    toScreen(point) {
      const { origin, axisX, axisY } = transform();

      return {
        x: origin.x + point.x * axisX.x + point.y * axisY.x,
        y: origin.y + point.x * axisX.y + point.y * axisY.y
      };
    },
    fromScreen(point) {
      const { origin, axisX, axisY } = transform();
      const x = point.x - origin.x;
      const y = point.y - origin.y;
      const determinant = axisX.x * axisY.y - axisY.x * axisX.y;

      return {
        x: (x * axisY.y - y * axisY.x) / determinant,
        y: (y * axisX.x - x * axisX.y) / determinant
      };
    },
    toClip: (point) => screenToClip(space.toScreen(point))
  };

  return space;
}

/** Canvas-local CSS pixel position of the local origin and of one local unit along each axis. */
export type AffineTransform = { origin: Point; axisX: Point; axisY: Point };

const SpaceContext = createContext<SceneSpace>();
