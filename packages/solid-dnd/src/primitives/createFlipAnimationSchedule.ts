import { type Rect } from '../core/rect';
import { snapshotsEqual } from './flipUtils';

export function createFlipAnimationSchedule<K>() {
  let lastTargets: Map<K, Rect> | null = null;
  let animationStartTime = 0;

  return {
    effectiveDuration(targets: Map<K, Rect>, baseDuration: number): number {
      const targetsUnchanged = lastTargets !== null && snapshotsEqual(lastTargets, targets);

      let duration: number;
      if (targetsUnchanged && animationStartTime > 0) {
        const elapsed = performance.now() - animationStartTime;
        duration = Math.max(baseDuration - elapsed, 16);
      } else {
        duration = baseDuration;
        animationStartTime = performance.now();
      }

      lastTargets = targets;
      return duration;
    },

    clearTargets(): void {
      lastTargets = null;
    },

    reset(): void {
      lastTargets = null;
      animationStartTime = 0;
    }
  };
}
