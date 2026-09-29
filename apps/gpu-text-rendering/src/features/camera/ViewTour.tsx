import { createMemo } from 'solid-js';
import { useFrame } from '../scene/FrameLoop';
import type { Camera } from './camera';
import type { DocumentCamera } from './createDocumentCamera';
import { makeViewTour } from './makeViewTour';

/**
 * Flies the camera along a route of saved stops before drawing. Each new `route` object restarts from the current
 * camera; an undefined route leaves the camera alone. Mount beneath FrameLoop.
 */
export function ViewTour(props: {
  /** Camera the route moves; fixed for the component's lifetime. */
  camera: DocumentCamera;
  /** Cameras to fly to; read on each frame, so stops may be added or removed while a route runs. */
  stops: readonly Camera[];
  /** First stop and whether to keep touring after reaching it; undefined or an empty `stops` list stops flying. */
  route: { start: number; loop: boolean } | undefined;
  /** Runs when a flight towards the stop at `index` begins. */
  onVisit?: (index: number) => void;
  /** Runs once when a non-looping route reaches its stop, or when no stops remain. */
  onFinish: () => void;
}) {
  const { camera, setCamera } = props.camera;
  // Each route gets its own plan and visit record, so a new route reports its first stop even if it was just visited.
  const tour = createMemo(() => props.route && { plan: makeViewTour(props.route), visited: -1 });

  useFrame(
    ({ time }) => {
      const current = tour();

      if (!current || props.stops.length === 0) {
        props.onFinish();
        return;
      }

      const next = current.plan.update(time * 1000, props.stops, camera());
      setCamera(next.camera);

      if (next.index !== current.visited) {
        current.visited = next.index;
        props.onVisit?.(next.index);
      }

      if (next.done) {
        props.onFinish();
      }
    },
    { phase: 'update', enabled: () => tour() !== undefined, continuous: true }
  );

  return null;
}
