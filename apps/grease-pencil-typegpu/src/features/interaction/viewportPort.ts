import type { WorkplaneGizmoHighlight } from '../../render/workplaneGizmoTypes';
import type { Vec3 } from '../../shared/vector';
import type { TouchViewTransform } from './touchGesture';

export type InteractionViewport = {
  /** Applies pan, pinch, and twist together around their shared screen-space anchor. */
  transformTouch: (gesture: TouchViewTransform) => void;
  offsetFromWorkplane: (position: Vec3, distance: number) => Vec3;
  orbit: (deltaX: number, deltaY: number) => void;
  pan: (deltaX: number, deltaY: number) => void;
  /** World length of one CSS pixel at this position; zero behind the near plane. */
  worldUnitsPerPixel: (position: Vec3) => number;
  projectToScreen: (position: Vec3) =>
    | {
        x: number;
        y: number;
        depth: number;
      }
    | undefined;
  setWorkplaneGizmoHighlight: (highlight?: WorkplaneGizmoHighlight) => void;
  screenToWorld: (clientX: number, clientY: number) => Vec3 | undefined;
  zoom: (delta: number) => void;
};
